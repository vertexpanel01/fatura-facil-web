import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da CashinPay. Recebe a confirmação do PIX e dá baixa na fatura.
 * O vínculo é feito pelo ID da transação, gravado em faturas.pix_txid.
 */
export const Route = createFileRoute("/api/public/cashinpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bruto = await request.text();
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(bruto) as Record<string, unknown>;
        } catch {
          return new Response("Payload inválido", { status: 400 });
        }

        const dados = (payload["data"] as Record<string, unknown> | undefined) ?? payload;
        const id = String(
          dados["id"] ?? dados["transactionId"] ?? dados["transaction_id"] ?? "",
        );
        const status = String(dados["status"] ?? payload["status"] ?? "");

        if (!id) return new Response("Transação não informada", { status: 400 });

        const { pagoNoGateway, consultarTransacao } = await import("@/lib/cashinpay.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Confirma direto na API antes de dar baixa (evita webhook forjado).
        const statusReal = (await consultarTransacao(id)) ?? status;
        if (!pagoNoGateway(statusReal)) return Response.json({ ok: true, ignorado: true });

        const { data: fatura } = await supabaseAdmin
          .from("faturas")
          .select("id")
          .eq("pix_txid", id)
          .maybeSingle();

        if (!fatura) return new Response("Fatura não encontrada", { status: 404 });

        await supabaseAdmin
          .from("pagamentos")
          .update({ status: "confirmado", pago_em: new Date().toISOString() })
          .eq("gateway_payment_id", id);

        await supabaseAdmin
          .from("faturas")
          .update({ status: "paga", data_pagamento: new Date().toISOString() })
          .eq("id", fatura.id);

        return Response.json({ ok: true });
      },
    },
  },
});
