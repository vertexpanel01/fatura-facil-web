import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  BarChart3,
  CalendarDays,
  Coins,
  ReceiptText,
  Trash2,
  Users,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { limparAcessos, obterMetricasAcessos } from "@/lib/acessos.functions";
import { formatarData, formatarMoeda, formatarTelefone } from "@/lib/format";



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
      const [clientes, faturas] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }),
        supabase.from("faturas").select("id, status, valor_original, valor_desconto, vencimento, clientes(nome, telefone)"),
      ]);
      const listaFaturas = faturas.data ?? [];
      const emAberto = listaFaturas.filter((f) => f.status === "em_aberto" || f.status === "vencida");
      return {
        totalClientes: clientes.count ?? 0,
        emAberto,
        valorEmAberto: emAberto.reduce(
          (s, f) => s + (Number(f.valor_desconto) || Number(f.valor_original)),
          0,
        ),
        recentes: [...listaFaturas]
          .sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1))
          .slice(0, 6),
      };
    },
  });

  const queryClient = useQueryClient();
  const { data: metricas, isLoading: carregandoMetricas } = useQuery({
    queryKey: ["metricas-acessos"],
    queryFn: () => obterMetricasAcessos(),
    refetchInterval: 30000,
  });

  // Atualização em tempo real conforme novos acessos chegam.
  useEffect(() => {
    const canal = supabase
      .channel("acessos-dashboard")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "acessos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["metricas-acessos"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [queryClient]);


  const limpar = useMutation({
    mutationFn: () => limparAcessos(),
    onSuccess: (res) => {
      toast.success(`Histórico limpo: ${res.removidos} registro(s) removido(s).`);
      queryClient.invalidateQueries({ queryKey: ["metricas-acessos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível limpar o histórico."),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo geral de clientes, faturas e pagamentos.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cartao titulo="Clientes" valor={String(data?.totalClientes ?? 0)} icone={Users} carregando={isLoading} />
        <Cartao
          titulo="Em aberto"
          valor={formatarMoeda(data?.valorEmAberto ?? 0)}
          descricao={`${data?.emAberto.length ?? 0} fatura(s)`}
          icone={ReceiptText}
          carregando={isLoading}
        />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Métricas de acesso</h2>
            <p className="text-sm text-muted-foreground">
              Atualização em tempo real · visível apenas aqui no painel administrativo.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={limpar.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Apagar todo o histórico de consultas e visitas do site? Esta ação é irreversível.",
                )
              ) {
                limpar.mutate();
              }
            }}
          >
            <Trash2 className="size-4" />
            {limpar.isPending ? "Limpando..." : "Limpar histórico"}
          </Button>
        </div>


        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cartao
            titulo="Clientes que acessaram"
            valor={(metricas?.clientes_total ?? 0).toLocaleString("pt-BR")}
            descricao={`${(metricas?.clientes_mes ?? 0).toLocaleString("pt-BR")} no mês · telefones únicos`}
            icone={UserCheck}
            carregando={carregandoMetricas}
          />
          <Cartao
            titulo="Faturas visualizadas (com desconto)"
            valor={formatarMoeda(metricas?.valor_desconto_total ?? 0)}
            descricao={`Hoje ${formatarMoeda(metricas?.valor_desconto_hoje ?? 0)} · Mês ${formatarMoeda(metricas?.valor_desconto_mes ?? 0)}`}
            icone={Coins}
            carregando={carregandoMetricas}
          />
          <Cartao
            titulo="Total em aberto consultado"
            valor={formatarMoeda(metricas?.valor_aberto_total ?? 0)}
            descricao={`Hoje ${formatarMoeda(metricas?.valor_aberto_hoje ?? 0)} · Mês ${formatarMoeda(metricas?.valor_aberto_mes ?? 0)}`}
            icone={BarChart3}
            carregando={carregandoMetricas}
          />
          <Cartao
            titulo="Acessos hoje"
            valor={(metricas?.acessos_hoje ?? 0).toLocaleString("pt-BR")}
            descricao={`${(metricas?.clientes_hoje ?? 0).toLocaleString("pt-BR")} cliente(s) · ${(metricas?.consultas_hoje ?? 0).toLocaleString("pt-BR")} consulta(s)`}
            icone={CalendarDays}
            carregando={carregandoMetricas}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Cartao
            titulo="Acessos no mês"
            valor={(metricas?.acessos_mes ?? 0).toLocaleString("pt-BR")}
            icone={CalendarDays}
            carregando={carregandoMetricas}
          />
          <Cartao
            titulo="Acessos totais"
            valor={(metricas?.acessos_total ?? 0).toLocaleString("pt-BR")}
            icone={BarChart3}
            carregando={carregandoMetricas}
          />
          <Cartao
            titulo="Consultas realizadas"
            valor={(metricas?.consultas_total ?? 0).toLocaleString("pt-BR")}
            descricao="Quando o cliente pesquisou um telefone"
            icone={ReceiptText}
            carregando={carregandoMetricas}
          />
        </div>

      </section>



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
