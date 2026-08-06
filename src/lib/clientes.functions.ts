import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clienteImportSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(10).max(15),
  email: z.string().email().nullable().optional(),
  documento: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

const importarClientesSchema = z.object({
  clientes: z.array(clienteImportSchema).min(1).max(1000),
});

export const importarClientes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => importarClientesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    if (!isAdmin) {
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

    const unicoTelefones = new Set(payload.map((c) => c.telefone));
    const afetados = resultado?.length ?? 0;

    return {
      importados: afetados,
      telefones: Array.from(unicoTelefones),
    };
  });
