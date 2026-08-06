import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const consultaSchema = z.object({
  telefone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 11, {
      message: "Informe um telefone válido com DDD.",
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

    const { data: clientes, error: erroCliente } = await supabaseAdmin
      .from("clientes")
      .select("id, nome, telefone")
      .eq("telefone", data.telefone)
      .limit(1);

    if (erroCliente) throw new Error("Não foi possível consultar no momento.");
    const cliente = clientes?.[0];
    if (!cliente) return { encontrado: false };

    const { data: faturas, error: erroFaturas } = await supabaseAdmin
      .from("faturas")
      .select("id, descricao, referencia, valor_original, valor_desconto, vencimento, status")
      .eq("cliente_id", cliente.id)
      .neq("status", "cancelada")
      .order("vencimento", { ascending: false });

    if (erroFaturas) throw new Error("Não foi possível consultar no momento.");

    return {
      encontrado: true,
      cliente: { nome: cliente.nome, telefone: cliente.telefone },
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

    const { data: fatura, error } = await supabaseAdmin
      .from("faturas")
      .select("id, cliente_id, valor_original, valor_desconto, status, pix_txid, pix_copia_cola")
      .eq("id", data.fatura_id)
      .maybeSingle();

    if (error || !fatura) throw new Error("Fatura não encontrada.");
    if (fatura.status === "paga") {
      return { valor: 0, copia_cola: "", txid: fatura.pix_txid ?? "", status: "paga" };
    }

    const valor = Number(fatura.valor_desconto) || Number(fatura.valor_original);

    let txid = fatura.pix_txid ?? "";
    let copiaCola = fatura.pix_copia_cola ?? "";

    if (!txid || !copiaCola) {
      txid = novoTxid();
      copiaCola = gerarBrCode({
        chave: process.env["PIX_CHAVE"] ?? "pagamentos@negociafacil.com.br",
        valor,
        nome: process.env["PIX_RECEBEDOR"] ?? "NEGOCIA FACIL",
        cidade: process.env["PIX_CIDADE"] ?? "SAO PAULO",
        txid,
      });

      await supabaseAdmin
        .from("faturas")
        .update({ pix_txid: txid, pix_copia_cola: copiaCola })
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
        gateway: "pix",
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
      .select("status")
      .eq("id", data.fatura_id)
      .maybeSingle();
    return { status: (fatura?.status as string) ?? "em_aberto" };
  });

