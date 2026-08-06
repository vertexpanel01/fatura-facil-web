import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Search, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo-claro.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consultarFaturas, iniciarPagamentoPix } from "@/lib/consulta.functions";
import type { ConsultaResultado, FaturaPublica } from "@/lib/consulta.functions";
import { formatarData, formatarMoeda, formatarTelefone, somenteDigitos } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Consulta de Faturas — 2ª via e pagamento por telefone" },
      {
        name: "description",
        content:
          "Consulte sua fatura pelo número de telefone, veja o valor com desconto, a data de vencimento e pague na hora com PIX.",
      },
      { property: "og:title", content: "Consulta de Faturas — 2ª via e pagamento" },
      {
        property: "og:description",
        content:
          "Digite seu telefone e veja sua fatura: valor original, valor com desconto, vencimento e status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaginaConsulta,
});

function StatusBadge({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    paga: "bg-success/12 text-success border-success/25",
    em_aberto: "bg-warning/15 text-warning-foreground border-warning/40",
    vencida: "bg-destructive/10 text-destructive border-destructive/25",
  };
  const rotulos: Record<string, string> = {
    paga: "Paga",
    em_aberto: "Em aberto",
    vencida: "Vencida",
    cancelada: "Cancelada",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
        estilos[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {rotulos[status] ?? status}
    </span>
  );
}

function CardFatura({ fatura, nome, telefone }: { fatura: FaturaPublica; nome: string; telefone: string }) {
  const pagar = useServerFn(iniciarPagamentoPix);
  const mutation = useMutation({
    mutationFn: () => pagar({ data: { fatura_id: fatura.id } }),
    onSuccess: (res) => {
      if (res.integrado && res.pix_copia_cola) {
        void navigator.clipboard?.writeText(res.pix_copia_cola);
        toast.success("Código PIX copiado!", { description: "Cole no app do seu banco para pagar." });
      } else {
        toast.info("Pagamento registrado", {
          description:
            "O gateway PIX ainda será integrado. Sua solicitação de pagamento foi registrada para o atendimento.",
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desconto = fatura.valor_desconto > 0 ? fatura.valor_desconto : fatura.valor_original;
  const economia = fatura.valor_original - desconto;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/60 px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cliente</p>
          <p className="text-base font-semibold text-foreground">{nome}</p>
        </div>
        <StatusBadge status={fatura.status} />
      </div>

      <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
        <Campo rotulo="Telefone" valor={formatarTelefone(telefone)} />
        <Campo rotulo="Vencimento" valor={formatarData(fatura.vencimento)} />
        <Campo rotulo="Valor original" valor={formatarMoeda(fatura.valor_original)} riscado />
        <Campo rotulo="Valor com desconto" valor={formatarMoeda(desconto)} destaque />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-muted-foreground">
          {fatura.descricao}
          {fatura.referencia ? ` · ${fatura.referencia}` : ""}
          {economia > 0 ? ` · economia de ${formatarMoeda(economia)}` : ""}
        </p>
        {fatura.status !== "paga" ? (
          <Button size="lg" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            Pagar Agora
          </Button>
        ) : (
          <span className="text-sm font-semibold text-success">Fatura quitada</span>
        )}
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  destaque,
  riscado,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  riscado?: boolean;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd
        className={
          destaque
            ? "mt-1 text-2xl font-bold text-primary"
            : riscado
              ? "mt-1 text-lg font-medium text-muted-foreground line-through"
              : "mt-1 text-lg font-semibold text-foreground"
        }
      >
        {valor}
      </dd>
    </div>
  );
}

function PaginaConsulta() {
  const [telefone, setTelefone] = useState("");
  const [resultado, setResultado] = useState<ConsultaResultado | null>(null);
  const consultar = useServerFn(consultarFaturas);

  const mutation = useMutation({
    mutationFn: () => consultar({ data: { telefone } }),
    onSuccess: (res) => {
      setResultado(res);
      if (!res.encontrado) {
        toast.error("Nenhum cadastro encontrado para este telefone.");
      }
    },
    onError: () => toast.error("Informe um telefone válido com DDD."),
  });

  const digitos = somenteDigitos(telefone);
  const podeConsultar = digitos.length >= 10 && !mutation.isPending;

  return (
    <div className="min-h-screen bg-soft-gradient">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <img src={logo} alt="Logo da operadora" width={160} height={44} className="h-10 w-auto" />
          <Link
            to="/auth"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Área administrativa
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20">
        <section className="mt-8 overflow-hidden rounded-3xl bg-hero-gradient px-6 py-12 text-primary-foreground shadow-elevated sm:px-12">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-80">Autoatendimento</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">
            Consulte sua fatura pelo número de telefone
          </h1>
          <p className="mt-4 max-w-xl text-base opacity-90">
            Sem cadastro e sem senha. Veja o valor com desconto, o vencimento e pague na hora.
          </p>
        </section>

        <section className="-mt-8 rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (podeConsultar) mutation.mutate();
            }}
          >
            <div className="flex-1">
              <Label htmlFor="telefone" className="text-sm font-medium">
                Número de telefone
              </Label>
              <div className="relative mt-2">
                <Smartphone className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="telefone"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  value={telefone}
                  onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                  className="h-14 pl-11 text-lg"
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="h-14 px-8 text-base" disabled={!podeConsultar}>
              {mutation.isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Search className="size-5" />
              )}
              Consultar Fatura
            </Button>
          </form>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-success" />
            Consulta segura: mostramos apenas os dados vinculados ao telefone informado.
          </p>
        </section>

        {resultado?.encontrado && resultado.cliente ? (
          <section className="mt-10 space-y-5">
            <h2 className="text-xl font-semibold text-foreground">Faturas encontradas</h2>
            {resultado.faturas?.length ? (
              resultado.faturas.map((f) => (
                <CardFatura
                  key={f.id}
                  fatura={f}
                  nome={resultado.cliente!.nome}
                  telefone={resultado.cliente!.telefone}
                />
              ))
            ) : (
              <p className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
                Nenhuma fatura registrada para este telefone.
              </p>
            )}
          </section>
        ) : null}

        {resultado && !resultado.encontrado ? (
          <section className="mt-10 rounded-xl border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">Telefone não localizado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Confira o número digitado (com DDD) ou entre em contato com o atendimento.
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
