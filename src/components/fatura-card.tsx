import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { iniciarPagamentoPix } from "@/lib/consulta.functions";
import type { FaturaPublica } from "@/lib/consulta.functions";
import { formatarData, formatarMoeda, formatarTelefone } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
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

export function Campo({
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

export function CardFatura({
  fatura,
  nome,
  telefone,
}: {
  fatura: FaturaPublica;
  nome: string;
  telefone: string;
}) {
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
        <Campo rotulo="Valor total da fatura" valor={formatarMoeda(fatura.valor_original)} riscado />
        <Campo rotulo="Valor com desconto à vista" valor={formatarMoeda(desconto)} destaque />
      </dl>

      <div className="space-y-4 px-5 py-5">
        <p className="text-sm text-muted-foreground">
          {fatura.descricao}
          {fatura.referencia ? ` · ${fatura.referencia}` : ""}
          {economia > 0 ? ` · economia de ${formatarMoeda(economia)}` : ""}
        </p>
        {fatura.status !== "paga" ? (
          <Button
            size="lg"
            className="h-14 w-full rounded-full bg-cta text-base font-bold text-cta-foreground hover:bg-cta/90"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="size-5 animate-spin" /> : <Zap className="size-5" />}
            Pagar Agora
          </Button>
        ) : (
          <p className="rounded-full bg-success/10 py-3 text-center text-sm font-semibold text-success">
            Fatura quitada
          </p>
        )}
      </div>
    </div>
  );
}
