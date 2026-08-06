import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Coins,
  FileText,
  ReceiptText,
  Users,
  UserCheck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { obterMetricasAcessos } from "@/lib/acessos.functions";
import { formatarData, formatarMoeda, formatarTelefone } from "@/lib/format";

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Administração de Faturas" },
      { name: "description", content: "Resumo de clientes, faturas e pagamentos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [clientes, faturas, pagamentos] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }),
        supabase.from("faturas").select("id, status, valor_original, valor_desconto, vencimento, clientes(nome, telefone)"),
        supabase.from("pagamentos").select("valor, status"),
      ]);
      const listaFaturas = faturas.data ?? [];
      const emAberto = listaFaturas.filter((f) => f.status === "em_aberto" || f.status === "vencida");
      const pagas = listaFaturas.filter((f) => f.status === "paga");
      const recebido = (pagamentos.data ?? [])
        .filter((p) => p.status === "confirmado")
        .reduce((s, p) => s + Number(p.valor), 0);
      return {
        totalClientes: clientes.count ?? 0,
        totalFaturas: listaFaturas.length,
        emAberto,
        totalPagas: pagas.length,
        valorEmAberto: emAberto.reduce(
          (s, f) => s + (Number(f.valor_desconto) || Number(f.valor_original)),
          0,
        ),
        recebido,
        recentes: [...listaFaturas]
          .sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1))
          .slice(0, 6),
      };
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo geral de clientes, faturas e pagamentos.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Clientes" valor={String(data?.totalClientes ?? 0)} icone={Users} carregando={isLoading} />
        <Cartao titulo="Faturas" valor={String(data?.totalFaturas ?? 0)} icone={FileText} carregando={isLoading} />
        <Cartao
          titulo="Em aberto"
          valor={formatarMoeda(data?.valorEmAberto ?? 0)}
          descricao={`${data?.emAberto.length ?? 0} fatura(s)`}
          icone={ReceiptText}
          carregando={isLoading}
        />
        <Cartao
          titulo="Recebido"
          valor={formatarMoeda(data?.recebido ?? 0)}
          descricao={`${data?.totalPagas ?? 0} fatura(s) paga(s)`}
          icone={CircleDollarSign}
          carregando={isLoading}
        />
      </div>

      <section className="rounded-2xl border border-border bg-card shadow-card">
        <h2 className="border-b border-border px-5 py-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Faturas recentes
        </h2>
        <div className="divide-y divide-border">
          {(data?.recentes ?? []).map((f) => {
            const cliente = f.clientes as unknown as { nome: string; telefone: string } | null;
            return (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium text-foreground">{cliente?.nome ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {cliente ? formatarTelefone(cliente.telefone) : "—"} · vence {formatarData(f.vencimento)}
                  </p>
                </div>
                <p className="font-semibold text-foreground">
                  {formatarMoeda(Number(f.valor_desconto) || Number(f.valor_original))}
                </p>
              </div>
            );
          })}
          {!isLoading && !(data?.recentes ?? []).length ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma fatura cadastrada ainda.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  descricao,
  icone: Icone,
  carregando,
}: {
  titulo: string;
  valor: string;
  descricao?: string;
  icone: React.ComponentType<{ className?: string }>;
  carregando?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <Icone className="size-5 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{carregando ? "…" : valor}</p>
      {descricao ? <p className="mt-1 text-xs text-muted-foreground">{descricao}</p> : null}
    </div>
  );
}
