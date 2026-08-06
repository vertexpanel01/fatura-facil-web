import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clienteImportSchema = z.object({
  // Nome é opcional: planilhas com apenas telefone + valores são aceitas.
  nome: z.string().nullable().optional(),
  telefone: z.string().min(10).max(15),
  email: z.string().email().nullable().optional(),
  documento: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  valor_original: z.number().nonnegative().nullable().optional(),
  valor_desconto: z.number().nonnegative().nullable().optional(),
});

const importarClientesSchema = z.object({
  // Lotes de até 500 linhas por chamada — o cliente divide a planilha.
  clientes: z.array(clienteImportSchema).min(1).max(500),
  // Data de vencimento única escolhida no calendário: vale para TODAS as faturas.
  vencimento_global: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

    const registros = data.clientes.map((c) => ({
      nome: c.nome?.trim() || null,
      telefone: c.telefone.replace(/\D/g, ""),
      email: c.email?.trim() || null,
      documento: c.documento?.trim() || null,
      observacoes: c.observacoes?.trim() || null,
      valor_original: c.valor_original ?? 0,
      valor_desconto: c.valor_desconto ?? 0,
    }));

    const { data: resultado, error } = await supabase.rpc("importar_faturas_lote", {
      p_registros: registros,
      p_vencimento: data.vencimento_global,
    });

    if (error) throw new Error(error.message);

    const r = (resultado ?? {}) as {
      clientes?: number;
      faturas_criadas?: number;
      faturas_atualizadas?: number;
    };

    return {
      importados: r.clientes ?? 0,
      faturasCriadas: r.faturas_criadas ?? 0,
      faturasAtualizadas: r.faturas_atualizadas ?? 0,
    };
  });
