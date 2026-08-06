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

        const { data: fatura } = await supabaseAdmin
          .from("faturas")
          .select("id")
          .eq("pix_txid", txid)
          .maybeSingle();

        if (!fatura) return new Response("Fatura não encontrada", { status: 404 });

        const confirmado = status === "confirmado" || status === "pago";

        await supabaseAdmin
          .from("pagamentos")
          .update({
            status: confirmado ? "confirmado" : status === "falhou" ? "falhou" : "estornado",
            pago_em: confirmado ? new Date().toISOString() : null,
          })
          .eq("gateway_payment_id", txid);

        if (confirmado) {
          await supabaseAdmin.from("faturas").update({ status: "paga" }).eq("id", fatura.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
