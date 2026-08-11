import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  txid: z.string().min(1),
  status: z.enum(["confirmado", "pago", "falhou", "estornado"]),
  valor: z.number().optional(),
});

/**
 * Webhook do gateway PIX. Ao receber a confirmação, marca o pagamento como
 * confirmado e a fatura como paga — a tela do cliente atualiza sozinha.
 */
export const Route = createFileRoute("/api/public/pix-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["PIX_WEBHOOK_SECRET"];
        if (!segredo) return new Response("Webhook não configurado", { status: 503 });
        if (request.headers.get("x-webhook-secret") !== segredo) {
          return new Response("Assinatura inválida", { status: 401 });
        }

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Payload inválido", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { txid, status } = parsed.data;

        const { data: transacao } = await supabaseAdmin
          .from("transacoes_pix")
          .select("id")
          .eq("transacao_gateway_id", txid)
          .maybeSingle();

        if (!transacao) return new Response("Transação não encontrada", { status: 404 });

        const confirmado = status === "confirmado" || status === "pago";

        if (confirmado) {
          const { confirmarPagamento } = await import("@/lib/payment-router.server");
          await confirmarPagamento(transacao.id);
        } else {
          await supabaseAdmin
            .from("transacoes_pix")
            .update({ status: status === "falhou" ? "falhou" : "estornada" })
            .eq("id", transacao.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
