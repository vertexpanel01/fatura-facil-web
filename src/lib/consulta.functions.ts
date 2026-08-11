import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Normaliza para o padrão gravado no banco: DDD + número (10 ou 11 dígitos). */
function normalizarTelefone(valor: string): string {
  let d = valor.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  while (d.length > 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

const consultaSchema = z.object({
  telefone: z
    .string()
    .transform(normalizarTelefone)
    .refine((v) => v.length === 10 || v.length === 11, {
      message: "Informe um telefone válido.",
    }),
});

export type FaturaPublica = {
  id: string;
  descricao: string;
  referencia: string | null;
  valor_original: number;
  valor_desconto: number;
  vencimento: string;
  status: string;
};

export type ConsultaResultado = {
  encontrado: boolean;
  cliente?: { nome: string; telefone: string };
  faturas?: FaturaPublica[];
};

/**
 * Consulta pública por telefone. Roda apenas no servidor e devolve
 * somente os campos necessários — nenhuma tabela é exposta ao público.
 */
export const consultarFaturas = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => consultaSchema.parse(data))
  .handler(async ({ data }): Promise<ConsultaResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Variantes toleram cadastros gravados com/sem DDI e com/sem o 9 extra.
    const t = data.telefone;
    const variantes = new Set<string>([t, `55${t}`]);
    if (t.length === 11 && t[2] === "9") variantes.add(t.slice(0, 2) + t.slice(3));
    if (t.length === 10) variantes.add(`${t.slice(0, 2)}9${t.slice(2)}`);

    const { data: clientes, error: erroCliente } = await supabaseAdmin
      .from("clientes")
      .select("id, nome, telefone")
      .in("telefone", [...variantes])
      .limit(1);


    if (erroCliente) throw new Error("Não foi possível consultar no momento.");
    const cliente = clientes?.[0];

    // Registro de acesso (silencioso, invisível para o visitante).
    const registrar = async (
      sucesso: boolean,
      valorOriginal: number | null,
      valorDesconto: number | null,
    ) => {
      try {
        await supabaseAdmin.from("acessos").insert({
          pagina: "/fatura",
          telefone_consultado: t,
          sucesso,
          valor_original: valorOriginal,
          valor_desconto: valorDesconto,
        });
      } catch {
        /* nunca interrompe a consulta do cliente */
      }
    };

    if (!cliente) {
      await registrar(false, null, null);
      return { encontrado: false };
    }

    // Apenas a fatura pendente do mês corrente — faturas pagas/canceladas
    // e de outros meses não são exibidas na consulta pública.
    const hoje = new Date();
    const primeiroDia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const ultimoDia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);

    const { data: faturas, error: erroFaturas } = await supabaseAdmin
      .from("faturas")
      .select("id, descricao, referencia, valor_original, valor_desconto, vencimento, status")
      .eq("cliente_id", cliente.id)
      .in("status", ["em_aberto", "vencida", "em_processamento", "falhou", "expirada"])
      .gte("vencimento", primeiroDia)
      .lte("vencimento", ultimoDia)
      .order("vencimento", { ascending: false })
      .limit(1);

    if (erroFaturas) throw new Error("Não foi possível consultar no momento.");

    const primeira = faturas?.[0];
    await registrar(
      Boolean(primeira),
      primeira ? Number(primeira.valor_original) : null,
      primeira ? Number(primeira.valor_desconto) || Number(primeira.valor_original) : null,
    );

    return {
      encontrado: true,
      cliente: { nome: cliente.nome, telefone: cliente.telefone ?? "" },
      faturas: (faturas ?? []).map((f) => ({
        id: f.id,
        descricao: f.descricao,
        referencia: f.referencia,
        valor_original: Number(f.valor_original),
        valor_desconto: Number(f.valor_desconto),
        vencimento: f.vencimento,
        status: f.status as string,
      })),
    };
  });


const pagamentoSchema = z.object({ fatura_id: z.string().uuid() });

export type PixGerado = {
  valor: number;
  copia_cola: string;
  txid: string;
  status: string;
};

/**
 * Gera (ou reaproveita) a cobrança PIX da fatura.
 * O valor enviado é SEMPRE o valor com desconto.
 */
export const gerarPixFatura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pagamentoSchema.parse(data))
  .handler(async ({ data }): Promise<PixGerado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gerarBrCode, novoTxid } = await import("@/lib/pix.server");
    const { criarCobrancaPix } = await import("@/lib/cashinpay.server");

    const { data: fatura, error } = await supabaseAdmin
      .from("faturas")
      .select(
        "id, cliente_id, descricao, valor_original, valor_desconto, status, pix_txid, pix_copia_cola",
      )
      .eq("id", data.fatura_id)
      .maybeSingle();

    if (error || !fatura) throw new Error("Fatura não encontrada.");
    if (fatura.status === "paga") {
      return { valor: 0, copia_cola: "", txid: fatura.pix_txid ?? "", status: "paga" };
    }

    // Valor exato com desconto, convertido uma única vez para centavos.
    const bruto = Number(fatura.valor_desconto) || Number(fatura.valor_original);
    const centavos = Math.max(1, Math.round(bruto * 100));
    const valor = centavos / 100;

    let txid = fatura.pix_txid ?? "";
    let copiaCola = fatura.pix_copia_cola ?? "";
    let gateway = "cashinpay";

    const centavosSalvos = (fatura as { pix_valor_centavos?: number | null })
      .pix_valor_centavos;

    if (!txid || !copiaCola || centavosSalvos !== centavos) {
      txid = "";
      copiaCola = "";
      const { data: cliente } = await supabaseAdmin
        .from("clientes")
        .select("nome, telefone, email, documento")
        .eq("id", fatura.cliente_id)
        .maybeSingle();

      const base = process.env["SITE_URL"] ?? "https://clarofatura.app";

      const cobranca = await criarCobrancaPix({
        centavos,
        nome: cliente?.nome ?? "Cliente",
        telefone: cliente?.telefone ?? "",
        email: cliente?.email ?? null,
        documento: cliente?.documento ?? null,
        descricao: fatura.descricao || "Fatura",
        webhookUrl: `${base}/api/public/cashinpay-webhook`,
      });

      if (cobranca) {
        txid = cobranca.id;
        copiaCola = cobranca.copia_cola;
      } else {
        // Contingência: só usa PIX estático quando existe uma chave PIX REAL
        // configurada. Nunca gera código com chave fictícia.
        const chaveReal = process.env["PIX_CHAVE"];
        if (!chaveReal) {
          throw new Error(
            "Pagamento indisponível no momento. Tente novamente em alguns minutos.",
          );
        }
        gateway = "pix-estatico";
        txid = novoTxid();
        copiaCola = gerarBrCode({
          chave: chaveReal,
          valor,
          nome: process.env["PIX_RECEBEDOR"] ?? "FATURA MOVEL",
          cidade: process.env["PIX_CIDADE"] ?? "SAO PAULO",
          txid,
        });
      }

      await supabaseAdmin
        .from("faturas")
        .update({
          pix_txid: txid,
          pix_copia_cola: copiaCola,
          pix_valor_centavos: centavos,
        })
        .eq("id", fatura.id);
    }



    const { data: existente } = await supabaseAdmin
      .from("pagamentos")
      .select("id")
      .eq("fatura_id", fatura.id)
      .eq("status", "pendente")
      .limit(1);

    if (!existente?.length) {
      await supabaseAdmin.from("pagamentos").insert({
        fatura_id: fatura.id,
        cliente_id: fatura.cliente_id,
        valor,
        metodo: "pix",
        status: "pendente",
        gateway,
        gateway_payment_id: txid,
      });
    }

    return { valor, copia_cola: copiaCola, txid, status: fatura.status as string };
  });


/**
 * Consulta leve usada pelo polling da tela — devolve o status atual da fatura
 * para atualizar a interface sem recarregar a página.
 */
export const consultarStatusFatura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pagamentoSchema.parse(data))
  .handler(async ({ data }): Promise<{ status: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fatura } = await supabaseAdmin
      .from("faturas")
      .select("id, status, pix_txid")
      .eq("id", data.fatura_id)
      .maybeSingle();

    if (!fatura) return { status: "em_aberto" };
    if (fatura.status === "paga") return { status: "paga" };

    // Consulta o gateway a cada polling — baixa automática mesmo sem webhook.
    if (fatura.pix_txid) {
      const { consultarTransacao, pagoNoGateway } = await import("@/lib/cashinpay.server");
      const statusGateway = await consultarTransacao(fatura.pix_txid);
      if (pagoNoGateway(statusGateway)) {
        await supabaseAdmin
          .from("faturas")
          .update({ status: "paga", data_pagamento: new Date().toISOString() })
          .eq("id", fatura.id);
        await supabaseAdmin
          .from("pagamentos")
          .update({ status: "confirmado", pago_em: new Date().toISOString() })
          .eq("gateway_payment_id", fatura.pix_txid);
        return { status: "paga" };
      }
    }

    return { status: (fatura.status as string) ?? "em_aberto" };
  });


/**
 * Baixa automática do pagamento PIX.
 * Enquanto não há gateway real conectado, esta função simula a aprovação:
 * confirma o pagamento e marca a fatura como paga (baixada).
 * Quando o gateway real for plugado, o webhook em /api/public/pix-webhook
 * executa exatamente a mesma baixa.
 */
export const confirmarPagamentoPix = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pagamentoSchema.parse(data))
  .handler(async ({ data }): Promise<{ status: string }> => {
    if (process.env["PIX_SIMULACAO"] === "off") {
      throw new Error("A confirmação manual está desativada. Aguarde a baixa do gateway.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: fatura } = await supabaseAdmin
      .from("faturas")
      .select("id, cliente_id, valor_original, valor_desconto, status, pix_txid")
      .eq("id", data.fatura_id)
      .maybeSingle();

    if (!fatura) throw new Error("Fatura não encontrada.");
    if (fatura.status === "paga") return { status: "paga" };

    const valor = Number(fatura.valor_desconto) || Number(fatura.valor_original);
    const agora = new Date().toISOString();

    const { data: pendente } = await supabaseAdmin
      .from("pagamentos")
      .select("id")
      .eq("fatura_id", fatura.id)
      .eq("status", "pendente")
      .limit(1);

    if (pendente?.length && pendente[0]) {
      await supabaseAdmin
        .from("pagamentos")
        .update({ status: "confirmado", pago_em: agora, valor })
        .eq("id", pendente[0].id);
    } else {
      await supabaseAdmin.from("pagamentos").insert({
        fatura_id: fatura.id,
        cliente_id: fatura.cliente_id,
        valor,
        metodo: "pix",
        status: "confirmado",
        gateway: "pix",
        gateway_payment_id: fatura.pix_txid,
        pago_em: agora,
      });
    }

    await supabaseAdmin.from("faturas").update({ status: "paga" }).eq("id", fatura.id);

    return { status: "paga" };
  });

