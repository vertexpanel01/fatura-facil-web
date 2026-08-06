import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_FATURA, formatarData, formatarMoeda, formatarTelefone, somenteDigitos } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/faturas")({
  head: () => ({
    meta: [
      { title: "Faturas — Administração de Faturas" },
      { name: "description", content: "Cadastro, edição e alteração de status das faturas." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaginaFaturas,
});

type StatusFatura = "em_aberto" | "em_processamento" | "paga" | "vencida" | "expirada" | "falhou" | "cancelada";

type Fatura = {
  id: string;
  cliente_id: string;
  descricao: string;
  referencia: string | null;
  valor_original: number;
  valor_desconto: number;
  vencimento: string;
  status: string;
  pix_copia_cola: string | null;
  clientes: { nome: string; telefone: string } | null;
};

const vazio = {
  cliente_id: "",
  descricao: "Fatura mensal",
  referencia: "",
  valor_original: "",
  valor_desconto: "",
  vencimento: "",
  status: "em_aberto",
  pix_copia_cola: "",
};

function PaginaFaturas() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Fatura | null>(null);
  const [form, setForm] = useState(vazio);

  const { data: faturas = [], isLoading } = useQuery({
    queryKey: ["faturas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturas")
        .select("*, clientes(nome, telefone)")
        .order("vencimento", { ascending: false });
      if (error) throw error;
      return data as unknown as Fatura[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id, nome, telefone").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.cliente_id) throw new Error("Selecione o cliente.");
      if (!form.vencimento) throw new Error("Informe a data de vencimento.");
      const payload = {
        cliente_id: form.cliente_id,
        descricao: form.descricao.trim() || "Fatura",
        referencia: form.referencia.trim() || null,
        valor_original: Number(form.valor_original) || 0,
        valor_desconto: Number(form.valor_desconto) || 0,
        vencimento: form.vencimento,
        status: form.status as StatusFatura,
        pix_copia_cola: form.pix_copia_cola.trim() || null,
      };
      const resposta = editando
        ? await supabase.from("faturas").update(payload).eq("id", editando.id)
        : await supabase.from("faturas").insert(payload);
      if (resposta.error) throw new Error(resposta.error.message);
    },
    onSuccess: () => {
      toast.success(editando ? "Fatura atualizada." : "Fatura cadastrada.");
      setAberto(false);
      setEditando(null);
      setForm(vazio);
      void queryClient.invalidateQueries({ queryKey: ["faturas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusFatura }) => {
      const { error } = await supabase.from("faturas").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
      if (status === "paga") {
        const fatura = faturas.find((f) => f.id === id);
        if (fatura) {
          await supabase.from("pagamentos").insert({
            fatura_id: fatura.id,
            cliente_id: fatura.cliente_id,
            valor: Number(fatura.valor_desconto) || Number(fatura.valor_original),
            metodo: "manual",
            status: "confirmado",
            pago_em: new Date().toISOString(),
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Status atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["faturas"] });
      void queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const termo = somenteDigitos(busca);
  const filtradas = faturas.filter((f) =>
    termo
      ? (f.clientes?.telefone ?? "").includes(termo)
      : (f.clientes?.nome ?? "").toLowerCase().includes(busca.trim().toLowerCase()),
  );

  function abrirNova() {
    setEditando(null);
    setForm(vazio);
    setAberto(true);
  }

  function abrirEdicao(f: Fatura) {
    setEditando(f);
    setForm({
      cliente_id: f.cliente_id,
      descricao: f.descricao,
      referencia: f.referencia ?? "",
      valor_original: String(f.valor_original),
      valor_desconto: String(f.valor_desconto),
      vencimento: f.vencimento,
      status: f.status,
      pix_copia_cola: f.pix_copia_cola ?? "",
    });
    setAberto(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Faturas</h1>
          <p className="text-sm text-muted-foreground">Cadastre, edite e altere o status das faturas.</p>
        </div>
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogTrigger asChild>
            <Button onClick={abrirNova}>
              <Plus className="size-4" />
              Nova fatura
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar fatura" : "Nova fatura"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} — {formatarTelefone(c.telefone)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="desc">Descrição</Label>
                  <Input id="desc" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ref">Referência</Label>
                  <Input id="ref" placeholder="Ex.: 08/2026" value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vo">Valor original (R$)</Label>
                  <Input id="vo" type="number" step="0.01" value={form.valor_original} onChange={(e) => setForm({ ...form, valor_original: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vd">Valor com desconto (R$)</Label>
                  <Input id="vd" type="number" step="0.01" value={form.valor_desconto} onChange={(e) => setForm({ ...form, valor_desconto: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="venc">Vencimento</Label>
                  <Input id="venc" type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_FATURA).map(([valor, rotulo]) => (
                        <SelectItem key={valor} value={valor}>
                          {rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pix">Código PIX copia e cola (opcional)</Label>
                <Input id="pix" value={form.pix_copia_cola} onChange={(e) => setForm({ ...form, pix_copia_cola: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          {filtradas.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-[180px]">
                <p className="font-medium text-foreground">{f.clientes?.nome ?? "—"}</p>
                <p className="text-sm text-muted-foreground">
                  {f.clientes ? formatarTelefone(f.clientes.telefone) : "—"} · vence {formatarData(f.vencimento)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground line-through">{formatarMoeda(f.valor_original)}</p>
                <p className="font-semibold text-primary">
                  {formatarMoeda(Number(f.valor_desconto) || Number(f.valor_original))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={f.status} onValueChange={(v) => alterarStatus.mutate({ id: f.id, status: v as StatusFatura })}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_FATURA).map(([valor, rotulo]) => (
                      <SelectItem key={valor} value={valor}>
                        {rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(f)}>
                  <Pencil className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {!isLoading && !filtradas.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
