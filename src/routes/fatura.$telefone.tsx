import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, SearchX, ShieldCheck } from "lucide-react";

import logo from "@/assets/logo-claro.png";
import { CardFatura } from "@/components/fatura-card";
import { Button } from "@/components/ui/button";
import { consultarFaturas } from "@/lib/consulta.functions";
import { formatarTelefone } from "@/lib/format";

export const Route = createFileRoute("/fatura/$telefone")({
  loader: ({ params }) => consultarFaturas({ data: { telefone: params.telefone } }),
  head: () => ({
    meta: [
      { title: "Sua fatura — Negocia Fácil" },
      {
        name: "description",
        content:
          "Veja os detalhes da sua fatura: nome do cliente, telefone, valor total, valor com desconto à vista, vencimento e status.",
      },
      { property: "og:title", content: "Sua fatura — Negocia Fácil" },
      {
        property: "og:description",
        content: "Detalhes da fatura consultada pelo telefone, com valor com desconto e opção de pagar agora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <Aviso
      titulo="Não foi possível consultar"
      texto="Verifique o número informado (com DDD) e tente novamente em instantes."
    />
  ),
  notFoundComponent: () => (
    <Aviso titulo="Telefone não localizado" texto="Confira o número digitado ou fale com o atendimento." />
  ),
  component: PaginaFatura,
});

function Cabecalho() {
  return (
    <header className="sticky top-0 z-30 bg-primary">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to="/">
          <img
            src={logo}
            alt="Logo da operadora Claro"
            width={140}
            height={38}
            className="h-9 w-auto rounded-md bg-card px-3 py-1"
          />
        </Link>
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold text-primary-foreground/90 transition-opacity hover:opacity-75"
        >
          <ArrowLeft className="size-4" />
          Nova consulta
        </Link>
      </div>
    </header>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-background">
      <Cabecalho />
      <section className="mx-auto mt-16 max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <SearchX className="mx-auto size-10 text-primary" />
        <h1 className="mt-4 text-xl font-bold text-foreground">{titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
        <Button asChild className="mt-6 rounded-full bg-cta text-cta-foreground hover:bg-cta/90">
          <Link to="/">Consultar outro telefone</Link>
        </Button>
      </section>
    </div>
  );
}

function PaginaFatura() {
  const resultado = Route.useLoaderData();
  const { telefone } = Route.useParams();

  if (!resultado.encontrado || !resultado.cliente) {
    return (
      <Aviso
        titulo="Telefone não localizado"
        texto={`Não encontramos cadastro para ${formatarTelefone(telefone)}. Confira o número (com DDD) ou fale com o atendimento.`}
      />
    );
  }

  const faturas = resultado.faturas ?? [];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Cabecalho />

      <section className="bg-primary px-4 py-10 text-primary-foreground">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Resultado da consulta</p>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Olá, {resultado.cliente.nome}!</h1>
          <p className="mt-2 text-sm opacity-90">
            Telefone consultado: {formatarTelefone(resultado.cliente.telefone)}
          </p>
        </div>
      </section>

      <main className="mx-auto mt-10 max-w-4xl space-y-5 px-4">
        <h2 className="text-lg font-bold text-foreground">
          {faturas.length ? "Suas faturas" : "Nenhuma fatura encontrada"}
        </h2>

        {faturas.length ? (
          faturas.map((f) => (
            <CardFatura
              key={f.id}
              fatura={f}
              nome={resultado.cliente!.nome}
              telefone={resultado.cliente!.telefone}
            />
          ))
        ) : (
          <p className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
            Não há faturas registradas para este telefone.
          </p>
        )}

        <p className="flex items-center gap-2 pt-4 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" />
          Exibimos somente os dados vinculados ao telefone informado.
        </p>
      </main>
    </div>
  );
}
