import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Layers, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ativarTodos,
  atualizarGateway,
  listarGateways,
  usarSomente,
} from "@/lib/gateways.functions";

export const Route = createFileRoute("/_authenticated/admin/gateways")({
  head: () => ({
    meta: [
      { title: "Gateways de pagamento — Painel administrativo" },
      {
        name: "description",
        content: "Escolha qual gateway de pagamento PIX está ativo ou mantenha todos em rotação.",
      },
      { property: "og:title", content: "Gateways de pagamento — Painel administrativo" },
      {
        property: "og:description",
        content: "Controle de rotação de gateways PIX do sistema de faturas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaGateways,
});

function PaginaGateways() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarGateways);
  const salvar = useServerFn(atualizarGateway);
  const exclusivo = useServerFn(usarSomente);
  const todos = useServerFn(ativarTodos);

  const { data, isLoading } = useQuery({
    queryKey: ["gateways"],
    queryFn: () => buscar({ data: undefined }),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["gateways"] });

  const alternar = useMutation({
    mutationFn: (vars: { id: string; ativo: boolean }) => salvar({ data: vars }),
    onSuccess: () => {
      recarregar();
      toast.success("Configuração salva.");
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  const somente = useMutation({
    mutationFn: (id: string) => exclusivo({ data: { id } }),
    onSuccess: () => {
      recarregar();
      toast.success("Gateway definido como único ativo.");
    },
    onError: () => toast.error("Não foi possível ativar."),
  });

  const rotacao = useMutation({
    mutationFn: () => todos({ data: undefined }),
    onSuccess: () => {
      recarregar();
      toast.success("Todos os gateways estão ativos (rotação).");
    },
    onError: () => toast.error("Não foi possível ativar todos."),
  });

  const lista = data ?? [];
  const ativos = lista.filter((g) => g.ativo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gateways de pagamento</h1>
          <p className="text-sm text-muted-foreground">
            Escolha qual gateway gera o PIX. Com mais de um ativo, o sistema tenta na ordem de
            prioridade e usa o próximo caso o primeiro falhe.
          </p>
        </div>
        <Button onClick={() => rotacao.mutate()} disabled={rotacao.isPending}>
          <Layers className="size-4" />
          Ativar todos (rotação)
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Modo atual</CardTitle>
          <CardDescription>
            {ativos === 0
              ? "Nenhum gateway ativo — nenhum PIX será gerado."
              : ativos === 1
                ? "Gateway único ativo."
                : `Rotação com ${ativos} gateways ativos.`}
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-4">
          {lista.map((g) => (
            <Card key={g.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g.rotulo}</span>
                    {g.ativo ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                    <Badge variant="outline">Prioridade {g.prioridade}</Badge>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {g.configurado ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        Credenciais configuradas
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-3.5 text-amber-600" />
                        Credenciais pendentes — o gateway será ignorado
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => somente.mutate(g.id)}
                    disabled={somente.isPending}
                  >
                    <Zap className="size-4" />
                    Usar somente este
                  </Button>
                  <Switch
                    checked={g.ativo}
                    onCheckedChange={(v) => alternar.mutate({ id: g.id, ativo: v })}
                    aria-label={`Ativar ${g.rotulo}`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
