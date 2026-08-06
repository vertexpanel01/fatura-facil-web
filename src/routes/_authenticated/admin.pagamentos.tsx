import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_PAGAMENTO,
  formatarDataHora,
  formatarMoeda,
  formatarTelefone,
  somenteDigitos,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos — Administração de Faturas" },
      { name: "description", content: "Histórico completo de pagamentos registrados." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaginaPagamentos,
});

type Pagamento = {
  id: string;
  valor: number;
  metodo: string;
  status: string;
  gateway: string | null;
  pago_em: string | null;
  created_at: string;
  clientes: { nome: string; telefone: string } | null;
  faturas: { descricao: string; referencia: string | null } | null;
};

function PaginaPagamentos() {
  const [busca, setBusca] = useState("");

  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ["pagamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagamentos")
        .select("*, clientes(nome, telefone), faturas(descricao, referencia)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Pagamento[];
    },
  });

  const termo = somenteDigitos(busca);
  const filtrados = pagamentos.filter((p) =>
    termo
      ? (p.clientes?.telefone ?? "").includes(termo)
      : (p.clientes?.nome ?? "").toLowerCase().includes(busca.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de pagamentos</h1>
        <p className="text-sm text-muted-foreground">Todos os pagamentos registrados no sistema.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por telefone ou nome do cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="divide-y divide-border">
          {filtrados.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium text-foreground">{p.clientes?.nome ?? "—"}</p>
                <p className="text-sm text-muted-foreground">
                  {p.clientes ? formatarTelefone(p.clientes.telefone) : "—"} ·{" "}
                  {p.faturas?.descricao ?? "Fatura"}
                  {p.faturas?.referencia ? ` (${p.faturas.referencia})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.metodo.toUpperCase()} · {formatarDataHora(p.pago_em ?? p.created_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{formatarMoeda(p.valor)}</p>
                <p
                  className={`text-xs font-medium ${
                    p.status === "confirmado" ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {STATUS_PAGAMENTO[p.status] ?? p.status}
                </p>
              </div>
            </div>
          ))}
          {!isLoading && !filtrados.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
