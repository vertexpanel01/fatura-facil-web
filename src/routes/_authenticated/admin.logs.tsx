import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listarLogs } from "@/lib/transacoes.functions";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  head: () => ({
    meta: [
      { title: "Logs de pagamento e webhooks — Painel administrativo" },
      {
        name: "description",
        content:
          "Auditoria das chamadas às gateways de pagamento e dos webhooks recebidos, com status e mensagens.",
      },
      { property: "og:title", content: "Logs de pagamento e webhooks — Painel administrativo" },
      {
        property: "og:description",
        content: "Registros técnicos das cobranças PIX para diagnóstico rápido de falhas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaLogs,
});

function dataHora(valor: string): string {
  return new Date(valor).toLocaleString("pt-BR");
}

function PaginaLogs() {
  const buscar = useServerFn(listarLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["logs"],
    queryFn: () => buscar({ data: undefined }),
    refetchInterval: 20000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Últimos 100 registros de chamadas às gateways e de webhooks recebidos.
        </p>
      </div>

      <Tabs defaultValue="pagamentos">
        <TabsList>
          <TabsTrigger value="pagamentos">Cobranças</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="pagamentos" className="space-y-3 pt-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
          {(data?.pagamentos ?? []).map((l) => (
            <Card key={l.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={l.nivel === "erro" ? "destructive" : "secondary"}>{l.nivel}</Badge>
                  <span>{l.gateway_slug}</span>
                  {l.http_status ? <Badge variant="outline">HTTP {l.http_status}</Badge> : null}
                </CardTitle>
                <CardDescription>{dataHora(l.created_at)}</CardDescription>
              </CardHeader>
              <CardContent className="break-words text-xs text-muted-foreground">
                {l.mensagem}
              </CardContent>
            </Card>
          ))}
          {!isLoading && (data?.pagamentos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-3 pt-4">
          {(data?.webhooks ?? []).map((l) => (
            <Card key={l.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={l.assinatura_valida ? "secondary" : "destructive"}>
                    {l.assinatura_valida ? "assinatura válida" : "assinatura inválida"}
                  </Badge>
                  <span>{l.gateway_slug}</span>
                  {l.evento ? <Badge variant="outline">{l.evento}</Badge> : null}
                </CardTitle>
                <CardDescription>{dataHora(l.created_at)}</CardDescription>
              </CardHeader>
              <CardContent className="break-words text-xs text-muted-foreground">
                {l.transacao_gateway_id ? `ID: ${l.transacao_gateway_id} — ` : ""}
                {l.resumo ?? "—"}
              </CardContent>
            </Card>
          ))}
          {!isLoading && (data?.webhooks ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro.</p>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
