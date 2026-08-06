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
  // Data de vencimento única escolhida no calendário: quando informada,
  // vale para TODAS as faturas da importação.
  vencimento_global: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
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
    const idsClientes = Array.from(idPorTelefone.values());

    // Faturas já existentes e ainda não pagas — atualizamos em vez de duplicar.
    const { data: existentes } = idsClientes.length
      ? await supabase
          .from("faturas")
          .select("id, cliente_id, status")
          .in("cliente_id", idsClientes)
          .in("status", ["em_aberto", "vencida", "expirada", "falhou", "em_processamento"])
      : { data: [] as { id: string; cliente_id: string; status: string }[] };

    const faturaAbertaPorCliente = new Map<string, string>();
    for (const f of existentes ?? []) {
      if (!faturaAbertaPorCliente.has(f.cliente_id)) faturaAbertaPorCliente.set(f.cliente_id, f.id);
    }

    const novasFaturas: {
      cliente_id: string;
      descricao: string;
      valor_original: number;
      valor_desconto: number;
      vencimento: string;
      status: "em_aberto";
    }[] = [];
    const atualizacoes: { id: string; valor_original: number; valor_desconto: number; vencimento: string }[] = [];

    for (const c of data.clientes) {
      const valorOriginal = c.valor_original ?? 0;
      const valorDesconto = c.valor_desconto ?? 0;
      if (valorOriginal <= 0 && valorDesconto <= 0) continue;

      const telefone = c.telefone.replace(/\D/g, "");
      const clienteId = idPorTelefone.get(telefone);
      if (!clienteId) continue;

      const vencimento =
        c.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)
          ? c.vencimento
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const faturaExistente = faturaAbertaPorCliente.get(clienteId);
      if (faturaExistente) {
        atualizacoes.push({
          id: faturaExistente,
          valor_original: valorOriginal || valorDesconto,
          valor_desconto: valorDesconto,
          vencimento,
        });
      } else {
        novasFaturas.push({
          cliente_id: clienteId,
          descricao: "Fatura importada",
          valor_original: valorOriginal || valorDesconto,
          valor_desconto: valorDesconto,
          vencimento,
          status: "em_aberto",
        });
      }
    }

    let faturasCriadas = 0;
    if (novasFaturas.length) {
      const { data: fatRes, error: fatErro } = await supabase.from("faturas").insert(novasFaturas).select("id");
      if (fatErro) throw new Error(fatErro.message);
      faturasCriadas = fatRes?.length ?? 0;
    }

    let faturasAtualizadas = 0;
    for (const a of atualizacoes) {
      const { error: updErro } = await supabase
        .from("faturas")
        .update({
          valor_original: a.valor_original,
          valor_desconto: a.valor_desconto,
          vencimento: a.vencimento,
          status: "em_aberto",
        })
        .eq("id", a.id);
      if (updErro) throw new Error(updErro.message);
      faturasAtualizadas += 1;
    }


    const unicoTelefones = new Set(payload.map((c) => c.telefone));
    const afetados = resultado?.length ?? 0;

    return {
      importados: afetados,
      faturasCriadas,
      faturasAtualizadas,
      telefones: Array.from(unicoTelefones),
    };
  });
