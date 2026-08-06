import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const querySchema = z.object({
  telefone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11, { message: "Informe um telefone válido com DDD (11 dígitos)." }),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/faturas")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({ telefone: url.searchParams.get("telefone") ?? "" });

        if (!parsed.success) {
          return Response.json(
            { erro: parsed.error.issues[0]?.message ?? "Parâmetro inválido." },
            { status: 400, headers: cors },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("faturas_por_telefone")
          .select("telefone, valor_em_aberto, valor_com_desconto")
          .eq("telefone", parsed.data.telefone)
          .maybeSingle();

        if (error) {
          return Response.json(
            { erro: "Não foi possível consultar no momento." },
            { status: 500, headers: cors },
          );
        }

        if (!data) {
          return Response.json(
            { erro: "Nenhuma fatura encontrada para este telefone." },
            { status: 404, headers: cors },
          );
        }

        return Response.json(
          {
            telefone: data.telefone,
            valor_em_aberto: Number(data.valor_em_aberto),
            valor_com_desconto: Number(data.valor_com_desconto),
          },
          { headers: cors },
        );
      },
    },
  },
});
