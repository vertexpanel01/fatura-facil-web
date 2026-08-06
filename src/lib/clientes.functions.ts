import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clienteImportSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(10).max(15),
  email: z.string().email().nullable().optional(),
  documento: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  valor_original: z.number().nonnegative().nullable().optional(),
  valor_desconto: z.number().nonnegative().nullable().optional(),
  vencimento: z.string().nullable().optional(),
});

const importarClientesSchema = z.object({
  clientes: z.array(clienteImportSchema).min(1).max(1000),
});

export const importarClientes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => importarClientesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleRow) {
      throw new Error("Apenas administradores podem importar clientes.");
    }

    const payload = data.clientes.map((c) => ({
      nome: c.nome.trim(),
      telefone: c.telefone.replace(/\D/g, ""),
      email: c.email?.trim() || null,
      documento: c.documento?.trim() || null,
      observacoes: c.observacoes?.trim() || null,
    }));

    const { data: resultado, error } = await supabase
      .from("clientes")
      .upsert(payload, { onConflict: "telefone", ignoreDuplicates: false })
      .select("id, telefone");

    if (error) {
      throw new Error(error.message);
    }

    const idPorTelefone = new Map((resultado ?? []).map((r) => [r.telefone, r.id]));

    const faturas = data.clientes
      .filter((c) => (c.valor_original ?? 0) > 0)
      .map((c) => {
        const telefone = c.telefone.replace(/\D/g, "");
        const clienteId = idPorTelefone.get(telefone);
        if (!clienteId) return null;
        const vencimento =
          c.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)
            ? c.vencimento
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return {
          cliente_id: clienteId,
          descricao: "Fatura importada",
          valor_original: c.valor_original ?? 0,
          valor_desconto: c.valor_desconto ?? 0,
          vencimento,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    let faturasCriadas = 0;
    if (faturas.length) {
      const { data: fatRes, error: fatErro } = await supabase.from("faturas").insert(faturas).select("id");
      if (fatErro) throw new Error(fatErro.message);
      faturasCriadas = fatRes?.length ?? 0;
    }

    const unicoTelefones = new Set(payload.map((c) => c.telefone));
    const afetados = resultado?.length ?? 0;

    return {
      importados: afetados,
      faturasCriadas,
      telefones: Array.from(unicoTelefones),
    };
  });
