import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GatewayConfig = {
  id: string;
  slug: string;
  rotulo: string;
  ativo: boolean;
  prioridade: number;
  configurado: boolean;
};

function estaConfigurado(slug: string): boolean {
  if (slug === "cashinpay") return Boolean(process.env["CASHINPAY_SECRET_KEY"]);
  if (slug === "afiliaxpay")
    return Boolean(process.env["AFILIAXPAY_TOKEN"] && process.env["AFILIAXPAY_SECRET"]);
  if (slug === "pix-estatico") return Boolean(process.env["PIX_CHAVE"]);
  return false;
}

export const listarGateways = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GatewayConfig[]> => {
    const { data, error } = await context.supabase
      .from("gateways_config")
      .select("id, slug, rotulo, ativo, prioridade")
      .order("prioridade", { ascending: true });

    if (error) throw new Error("Não foi possível carregar os gateways.");

    return (data ?? []).map((g) => ({
      id: g.id,
      slug: g.slug,
      rotulo: g.rotulo,
      ativo: g.ativo,
      prioridade: g.prioridade,
      configurado: estaConfigurado(g.slug),
    }));
  });

const atualizarSchema = z.object({
  id: z.string().uuid(),
  ativo: z.boolean().optional(),
  prioridade: z.number().int().min(1).max(999).optional(),
});

export const atualizarGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => atualizarSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: {
      updated_at: string;
      ativo?: boolean;
      prioridade?: number;
    } = { updated_at: new Date().toISOString() };
    if (typeof data.ativo === "boolean") patch.ativo = data.ativo;
    if (typeof data.prioridade === "number") patch.prioridade = data.prioridade;

    const { error } = await context.supabase
      .from("gateways_config")
      .update(patch)
      .eq("id", data.id);

    if (error) throw new Error("Não foi possível salvar a alteração.");
    return { ok: true };
  });

/** Define um único gateway ativo (modo exclusivo). */
export const usarSomente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await context.supabase
      .from("gateways_config")
      .update({ ativo: false })
      .neq("id", data.id);
    const { error } = await context.supabase
      .from("gateways_config")
      .update({ ativo: true })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível ativar o gateway.");
    return { ok: true };
  });

/** Ativa todos os gateways (modo rotação). */
export const ativarTodos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("gateways_config")
      .update({ ativo: true })
      .neq("slug", "");
    if (error) throw new Error("Não foi possível ativar os gateways.");
    return { ok: true };
  });
