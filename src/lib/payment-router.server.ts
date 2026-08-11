/**
 * Payment Router — escolhe a gateway de cada cobrança PIX e cria a transação.
 *
 * Estratégias (public.roteamento_config.estrategia):
 *  - "prioridade": sempre na ordem de prioridade (menor número primeiro)
 *  - "rodizio":    alterna entre as gateways ativas (round-robin)
 *  - "fixa":       usa somente a gateway escolhida no painel
 *
 * Em qualquer estratégia há failover: se a gateway falhar, a próxima ativa é
 * tentada e cada falha é registrada em public.pagamentos_log.
 */
import { adaptadorDe } from "./gateways/adapters.server";
import type { Estrategia, GatewayRegistro } from "./gateways/types";

export type TransacaoPix = {
  id: string;
  gateway_slug: string;
  transacao_gateway_id: string | null;
  valor_centavos: number;
  copia_cola: string | null;
  qrcode: string | null;
  status: string;
  expira_em: string | null;
};

const MINUTOS_EXPIRACAO = Number(process.env["PIX_EXPIRACAO_MINUTOS"] ?? 30) || 30;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function registrarLog(entrada: {
  gateway_slug: string;
  fatura_id?: string | null;
  nivel?: string;
  http_status?: number | null;
  mensagem: string;
}): Promise<void> {
  try {
    const db = await admin();
    await db.from("pagamentos_log").insert({
      gateway_slug: entrada.gateway_slug,
      fatura_id: entrada.fatura_id ?? null,
      nivel: entrada.nivel ?? "erro",
      http_status: entrada.http_status ?? null,
      mensagem: entrada.mensagem.slice(0, 500),
    });
  } catch {
    /* log nunca interrompe o pagamento */
  }
}

async function carregarAtivos(): Promise<GatewayRegistro[]> {
  const db = await admin();
  const { data } = await db
    .from("gateways_config")
    .select(
      "id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, limite_diario, webhook_url, secret_names, observacoes",
    )
    .eq("ativo", true)
    .order("prioridade", { ascending: true });
  return (data ?? []) as unknown as GatewayRegistro[];
}

async function config(): Promise<{ estrategia: Estrategia; gateway_fixa: string | null; ponteiro: number }> {
  const db = await admin();
  const { data } = await db
    .from("roteamento_config")
    .select("estrategia, gateway_fixa, ponteiro")
    .eq("id", true)
    .maybeSingle();
  return {
    estrategia: ((data?.estrategia as Estrategia) ?? "prioridade") as Estrategia,
    gateway_fixa: data?.gateway_fixa ?? null,
    ponteiro: data?.ponteiro ?? 0,
  };
}

async function dentroDoLimite(gw: GatewayRegistro): Promise<boolean> {
  if (!gw.limite_diario || gw.limite_diario <= 0) return true;
  const db = await admin();
  const inicio = new Date();
  inicio.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("transacoes_pix")
    .select("id", { count: "exact", head: true })
    .eq("gateway_slug", gw.slug)
    .gte("created_at", inicio.toISOString());
  return (count ?? 0) < gw.limite_diario;
}

/** Ordem de tentativa conforme a estratégia configurada. */
async function ordemDeTentativa(): Promise<GatewayRegistro[]> {
  const ativos = await carregarAtivos();
  if (ativos.length === 0) return [];
  const cfg = await config();

  if (cfg.estrategia === "fixa" && cfg.gateway_fixa) {
    const fixa = ativos.find((g) => g.id === cfg.gateway_fixa);
    return fixa ? [fixa] : [];
  }

  if (cfg.estrategia === "rodizio") {
    const inicio = cfg.ponteiro % ativos.length;
    const db = await admin();
    await db
      .from("roteamento_config")
      .update({ ponteiro: (inicio + 1) % ativos.length })
      .eq("id", true);
    return [...ativos.slice(inicio), ...ativos.slice(0, inicio)];
  }

  return ativos;
}

export type PedidoCobranca = {
  faturaId: string;
  clienteId: string | null;
  centavos: number;
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  descricao: string;
  baseUrl: string;
};

function chaveIdempotencia(faturaId: string, centavos: number): string {
  return `fatura:${faturaId}:${centavos}`;
}

/** Transação válida já existente para a fatura + valor (não expirada). */
async function transacaoVigente(pedido: PedidoCobranca): Promise<TransacaoPix | null> {
  const db = await admin();
  const { data } = await db
    .from("transacoes_pix")
    .select(
      "id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em",
    )
    .eq("idempotency_key", chaveIdempotencia(pedido.faturaId, pedido.centavos))
    .maybeSingle();

  if (!data) return null;
  const t = data as unknown as TransacaoPix;
  if (t.status === "pago") return t;
  if (!t.copia_cola) return null;
  if (t.expira_em && new Date(t.expira_em).getTime() <= Date.now()) {
    await db.from("transacoes_pix").update({ status: "expirada" }).eq("id", t.id);
    // Chave liberada para uma nova tentativa.
    await db
      .from("transacoes_pix")
      .update({ idempotency_key: `${chaveIdempotencia(pedido.faturaId, pedido.centavos)}:${t.id}` })
      .eq("id", t.id);
    return null;
  }
  return t;
}

/**
 * Cria (ou reaproveita) a cobrança PIX exclusiva da fatura, com failover
 * entre as gateways ativas. Devolve null quando nenhuma gateway respondeu.
 */
export async function criarCobrancaPix(pedido: PedidoCobranca): Promise<TransacaoPix | null> {
  const vigente = await transacaoVigente(pedido);
  if (vigente) return vigente;

  const db = await admin();
  const ordem = await ordemDeTentativa();
  if (ordem.length === 0) {
    await registrarLog({
      gateway_slug: "-",
      fatura_id: pedido.faturaId,
      mensagem: "Nenhuma gateway ativa disponível.",
    });
    return null;
  }

  const referencia = `fatura_${pedido.faturaId}_${pedido.centavos}_${Date.now().toString(36)}`;

  for (const gw of ordem) {
    const adaptador = adaptadorDe(gw);

    if (!adaptador.configurado(gw)) {
      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        nivel: "aviso",
        mensagem: "Credenciais ausentes — gateway ignorada.",
      });
      continue;
    }
    if (!(await dentroDoLimite(gw))) {
      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        nivel: "aviso",
        mensagem: "Limite diário atingido — gateway ignorada.",
      });
      continue;
    }

    try {
      const criado = await adaptador.criarPix({
        gateway: gw,
        centavos: pedido.centavos,
        nome: pedido.nome,
        telefone: pedido.telefone,
        email: pedido.email ?? null,
        documento: pedido.documento ?? null,
        descricao: pedido.descricao,
        referencia,
        webhookUrl: gw.webhook_url || `${pedido.baseUrl}/api/public/webhooks/${gw.slug}`,
      });

      const expira =
        criado.expiraEm ?? new Date(Date.now() + MINUTOS_EXPIRACAO * 60_000).toISOString();

      const { data: inserida, error } = await db
        .from("transacoes_pix")
        .insert({
          fatura_id: pedido.faturaId,
          cliente_id: pedido.clienteId,
          gateway_slug: gw.slug,
          gateway_id: gw.id,
          transacao_gateway_id: criado.transacaoId,
          valor_centavos: pedido.centavos,
          copia_cola: criado.copiaCola,
          qrcode: criado.qrcode ?? null,
          status: "pendente",
          idempotency_key: chaveIdempotencia(pedido.faturaId, pedido.centavos),
          expira_em: expira,
        })
        .select(
          "id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em",
        )
        .maybeSingle();

      if (error || !inserida) {
        // Corrida: outra requisição gravou a mesma chave — reaproveita.
        const existente = await transacaoVigente(pedido);
        if (existente) return existente;
        throw new Error(error?.message ?? "Falha ao gravar a transação.");
      }

      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        nivel: "info",
        mensagem: `PIX criado (${pedido.centavos} centavos).`,
      });

      return inserida as unknown as TransacaoPix;
    } catch (erro) {
      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        mensagem: erro instanceof Error ? erro.message : "Falha desconhecida na gateway.",
      });
    }
  }

  return null;
}

/** Consulta o status da transação diretamente na gateway que a criou. */
export async function statusNaGateway(transacao: TransacaoPix): Promise<boolean> {
  if (!transacao.transacao_gateway_id) return false;
  const db = await admin();
  const { data } = await db
    .from("gateways_config")
    .select(
      "id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, limite_diario, webhook_url, secret_names, observacoes",
    )
    .eq("slug", transacao.gateway_slug)
    .maybeSingle();
  if (!data) return false;
  const gw = data as unknown as GatewayRegistro;
  const adaptador = adaptadorDe(gw);
  try {
    const status = await adaptador.consultarStatus(transacao.transacao_gateway_id, gw);
    return adaptador.pago(status);
  } catch (erro) {
    await registrarLog({
      gateway_slug: gw.slug,
      mensagem: erro instanceof Error ? erro.message : "Falha ao consultar status.",
    });
    return false;
  }
}

/** Marca a transação, o pagamento e a fatura como pagos (idempotente). */
export async function confirmarPagamento(transacaoId: string): Promise<void> {
  const db = await admin();
  const agora = new Date().toISOString();

  const { data } = await db
    .from("transacoes_pix")
    .select("id, fatura_id, status, transacao_gateway_id, valor_centavos, cliente_id, gateway_slug")
    .eq("id", transacaoId)
    .maybeSingle();
  if (!data || data.status === "pago") return;

  await db.from("transacoes_pix").update({ status: "pago", pago_em: agora }).eq("id", data.id);
  await db
    .from("faturas")
    .update({ status: "paga", data_pagamento: agora })
    .eq("id", data.fatura_id);

  const { data: pagamento } = await db
    .from("pagamentos")
    .select("id")
    .eq("fatura_id", data.fatura_id)
    .eq("status", "pendente")
    .limit(1)
    .maybeSingle();

  if (pagamento) {
    await db
      .from("pagamentos")
      .update({ status: "confirmado", pago_em: agora })
      .eq("id", pagamento.id);
  } else {
    await db.from("pagamentos").insert({
      fatura_id: data.fatura_id,
      cliente_id: data.cliente_id,
      valor: data.valor_centavos / 100,
      metodo: "pix",
      status: "confirmado",
      gateway: data.gateway_slug,
      gateway_payment_id: data.transacao_gateway_id,
      pago_em: agora,
    });
  }
}
