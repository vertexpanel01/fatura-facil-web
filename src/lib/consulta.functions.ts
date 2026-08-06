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

/**
 * Ponto de integração futura com gateway PIX.
 * Registra a intenção de pagamento e devolve os dados do PIX quando existirem.
 */
export const iniciarPagamentoPix = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pagamentoSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: fatura, error } = await supabaseAdmin
      .from("faturas")
      .select("id, cliente_id, valor_original, valor_desconto, status, pix_copia_cola")
      .eq("id", data.fatura_id)
      .maybeSingle();

    if (error || !fatura) throw new Error("Fatura não encontrada.");
    if (fatura.status === "paga") throw new Error("Esta fatura já está paga.");

    const valor = Number(fatura.valor_desconto) || Number(fatura.valor_original);

    await supabaseAdmin.from("pagamentos").insert({
      fatura_id: fatura.id,
      cliente_id: fatura.cliente_id,
      valor,
      metodo: "pix",
      status: "pendente",
      gateway: "pendente_integracao",
    });

    return {
      valor,
      pix_copia_cola: fatura.pix_copia_cola,
      integrado: Boolean(fatura.pix_copia_cola),
    };
  });
