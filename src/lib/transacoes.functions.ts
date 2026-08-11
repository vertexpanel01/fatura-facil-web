import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TransacaoAdmin = {
  id: string;
  fatura_id: string;
  gateway_slug: string;
  transacao_gateway_id: string | null;
  valor_centavos: number;
  status: string;
  created_at: string;
  expira_em: string | null;
  pago_em: string | null;
  cliente_nome: string | null;
};

export const listarTransacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ status: z.string().optional(), limite: z.number().int().min(1).max(500).optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<TransacaoAdmin[]> => {
    let consulta = context.supabase
      .from("transacoes_pix")
      .select(
        "id, fatura_id, gateway_slug, transacao_gateway_id, valor_centavos, status, created_at, expira_em, pago_em, clientes(nome)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limite ?? 100);

    if (data.status && data.status !== "todos") consulta = consulta.eq("status", data.status);

    const { data: linhas, error } = await consulta;
    if (error) throw new Error("Não foi possível carregar as transações.");

    return (linhas ?? []).map((t) => ({
      id: t.id,
      fatura_id: t.fatura_id,
      gateway_slug: t.gateway_slug,
      transacao_gateway_id: t.transacao_gateway_id,
      valor_centavos: t.valor_centavos,
      status: t.status,
      created_at: t.created_at,
      expira_em: t.expira_em,
      pago_em: t.pago_em,
      cliente_nome: (t as unknown as { clientes?: { nome: string } | null }).clientes?.nome ?? null,
    }));
  });

export type LogPagamento = {
  id: string;
  gateway_slug: string;
  nivel: string;
  http_status: number | null;
  mensagem: string;
  created_at: string;
};

export type LogWebhook = {
  id: string;
  gateway_slug: string;
  evento: string | null;
  transacao_gateway_id: string | null;
  assinatura_valida: boolean;
  resumo: string | null;
  created_at: string;
};

export const listarLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ pagamentos: LogPagamento[]; webhooks: LogWebhook[] }> => {
      const [{ data: pagamentos }, { data: webhooks }] = await Promise.all([
        context.supabase
          .from("pagamentos_log")
          .select("id, gateway_slug, nivel, http_status, mensagem, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        context.supabase
          .from("webhooks_log")
          .select("id, gateway_slug, evento, transacao_gateway_id, assinatura_valida, resumo, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      return {
        pagamentos: (pagamentos ?? []) as LogPagamento[],
        webhooks: (webhooks ?? []) as LogWebhook[],
      };
    },
  );
