export function somenteDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

export function formatarTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatarMoeda(valor: number | string | null | undefined): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return "—";
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const STATUS_FATURA: Record<string, string> = {
  em_aberto: "Em aberto",
  paga: "Paga",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

export const STATUS_PAGAMENTO: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  falhou: "Falhou",
  estornado: "Estornado",
};
