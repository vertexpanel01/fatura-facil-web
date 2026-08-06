import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ImportarClientesDialog } from "@/components/importar-clientes";
import { formatarTelefone, somenteDigitos } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Administração de Faturas" },
      { name: "description", content: "Cadastro, edição e exclusão de clientes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaginaClientes,
});

type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  documento: string | null;
  observacoes: string | null;
};

const vazio = { nome: "", telefone: "", email: "", documento: "", observacoes: "" };

function PaginaClientes() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState(vazio);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        telefone: somenteDigitos(form.telefone),
        email: form.email.trim() || null,
        documento: form.documento.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      if (!payload.nome) throw new Error("Informe o nome do cliente.");
      if (payload.telefone.length < 10) throw new Error("Informe um telefone válido com DDD.");
      const resposta = editando
        ? await supabase.from("clientes").update(payload).eq("id", editando.id)
        : await supabase.from("clientes").insert(payload);
      if (resposta.error) throw new Error(resposta.error.message);
    },
    onSuccess: () => {
      toast.success(editando ? "Cliente atualizado." : "Cliente cadastrado.");
      setAberto(false);
      setEditando(null);
      setForm(vazio);
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cliente excluído.");
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const termo = somenteDigitos(busca);
  const filtrados = clientes.filter((c) =>
    termo
      ? c.telefone.includes(termo)
      : c.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  function abrirNovo() {
    setEditando(null);
    setForm(vazio);
    setAberto(true);
  }

  function abrirEdicao(c: Cliente) {
    setEditando(c);
    setForm({
      nome: c.nome,
      telefone: formatarTelefone(c.telefone),
      email: c.email ?? "",
      documento: c.documento ?? "",
      observacoes: c.observacoes ?? "",
    });
    setAberto(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastre, edite e pesquise clientes pelo telefone.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportarClientesDialog onSuccess={() => queryClient.invalidateQueries({ queryKey: ["clientes"] })}>
            <Button size="lg" className="text-base font-semibold shadow-sm">
              <Upload className="size-5" />
              Importar Planilha
            </Button>
          </ImportarClientesDialog>
          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button onClick={abrirNovo}>
                <Plus className="size-4" />
                Novo cliente
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tel">Telefone</Label>
                <Input
                  id="tel"
                  inputMode="numeric"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: formatarTelefone(e.target.value) })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mail">E-mail</Label>
                  <Input id="mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc">CPF/CNPJ</Label>
                  <Input id="doc" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="obs">Observações</Label>
                <Textarea id="obs" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
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
    </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por telefone ou nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="divide-y divide-border">
          {filtrados.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium text-foreground">{c.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {formatarTelefone(c.telefone)}
                  {c.email ? ` · ${c.email}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(c)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Excluir ${c.nome}? As faturas dele também serão removidas.`)) {
                      excluir.mutate(c.id);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {!isLoading && !filtrados.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
