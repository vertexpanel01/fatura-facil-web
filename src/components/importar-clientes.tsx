import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { importarClientes } from "@/lib/clientes.functions";
import { somenteDigitos, formatarTelefone, formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";


type LinhaPlanilha = {
  nome: string;
  telefone: string;
  email: string | null;
  documento: string | null;
  observacoes: string | null;
  valorOriginal: number | null;
  valorDesconto: number | null;
  vencimento: string | null;
  linha: number;
  erros: string[];
};

const COLUNAS_ESPERADAS = [
  { chaves: ["nome", "name", "cliente"], campo: "nome" as const },
  { chaves: ["telefone", "tel", "celular", "phone", "whatsapp"], campo: "telefone" as const },
  { chaves: ["email", "e-mail", "mail"], campo: "email" as const },
  { chaves: ["documento", "cpf", "cnpj", "cpf/cnpj", "doc"], campo: "documento" as const },
  { chaves: ["observacoes", "observações", "obs", "notas"], campo: "observacoes" as const },
  {
    chaves: ["valororiginal", "valoremaberto", "valor", "valoraberto", "valordafatura", "valorfatura"],
    campo: "valorOriginal" as const,
  },
  {
    chaves: ["valorcomdesconto", "valordesconto", "desconto", "valorpromocional"],
    campo: "valorDesconto" as const,
  },
  { chaves: ["vencimento", "datavencimento", "datadevencimento"], campo: "vencimento" as const },
];

function parseMoeda(valor: string): number | null {
  if (!valor) return null;
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function parseData(valor: string): string | null {
  if (!valor) return null;
  const br = valor.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = valor.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const serial = Number(valor);
  if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizarChave(chave: string): string {
  return chave
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function mapearColunas(cabecalhos: string[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const col of COLUNAS_ESPERADAS) {
    const idx = cabecalhos.findIndex((h) => col.chaves.includes(normalizarChave(h)));
    if (idx >= 0) mapa[col.campo] = idx;
  }
  return mapa;
}

function extrairValor(linha: (string | number | null | undefined)[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const val = linha[idx];
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function normalizarTelefone(valor: string): string {
  const digitos = somenteDigitos(String(valor));
  if (digitos.length === 11 && digitos.startsWith("55")) return digitos.slice(2);
  return digitos;
}

function validarLinha(
  linha: (string | number | null | undefined)[],
  mapa: Record<string, number>,
  numeroLinha: number,
): LinhaPlanilha {
  const nome = extrairValor(linha, mapa["nome"]);
  const telefone = normalizarTelefone(extrairValor(linha, mapa["telefone"]));
  const email = extrairValor(linha, mapa["email"]) || null;
  const documento = extrairValor(linha, mapa["documento"]) || null;
  const observacoes = extrairValor(linha, mapa["observacoes"]) || null;
  const valorOriginal = parseMoeda(extrairValor(linha, mapa["valorOriginal"]));
  const valorDesconto = parseMoeda(extrairValor(linha, mapa["valorDesconto"]));
  const vencimento = parseData(extrairValor(linha, mapa["vencimento"]));
  const erros: string[] = [];

  if (telefone.length < 10 || telefone.length > 11) erros.push("Telefone inválido (informe DDD + número).");


  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    erros.push("E-mail inválido.");
  }

  if (valorDesconto !== null && valorOriginal !== null && valorDesconto > valorOriginal) {
    erros.push("Valor com desconto maior que o valor em aberto.");
  }

  return {
    nome,
    telefone,
    email,
    documento,
    observacoes,
    valorOriginal,
    valorDesconto,
    vencimento,
    linha: numeroLinha,
    erros,
  };
}

export function gerarModeloPlanilha() {
  const dados = [
    ["Nome", "Telefone", "Email", "CPF/CNPJ", "Valor em aberto", "Valor com desconto", "Vencimento", "Observacoes"],
    ["Maria Silva", "11999999999", "maria@email.com", "12345678900", 1200.5, 499.9, "31/12/2026", "Cliente ativo"],
    ["Joao Souza", "21988888888", "joao@email.com", "", 800, 350, "15/01/2027", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  XLSX.writeFile(wb, "modelo-clientes.xlsx");
}

export function ImportarClientesDialog({
  onSuccess,
  children,
}: {
  onSuccess: () => void;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<LinhaPlanilha[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [carregandoLeitura, setCarregandoLeitura] = useState(false);
  const [vencimentoGlobal, setVencimentoGlobal] = useState<Date | undefined>();
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importar = useMutation({
    mutationFn: async () => {
      const validas = linhas.filter((l) => l.erros.length === 0);
      if (!validas.length) throw new Error("Nenhuma linha válida para importar.");
      if (!vencimentoGlobal) throw new Error("Escolha a data de vencimento das faturas.");

      const vencimento = format(vencimentoGlobal, "yyyy-MM-dd");
      const TAMANHO_LOTE = 500;
      const totais = { importados: 0, faturasCriadas: 0, faturasAtualizadas: 0 };

      setProgresso({ feitos: 0, total: validas.length });

      for (let i = 0; i < validas.length; i += TAMANHO_LOTE) {
        const lote = validas.slice(i, i + TAMANHO_LOTE).map((l) => ({
          nome: l.nome || null,
          telefone: l.telefone,
          email: l.email,
          documento: l.documento,
          observacoes: l.observacoes,
          valor_original: l.valorOriginal,
          valor_desconto: l.valorDesconto,
        }));

        const res = await importarClientes({
          data: { clientes: lote, vencimento_global: vencimento },
        });

        totais.importados += res.importados;
        totais.faturasCriadas += res.faturasCriadas;
        totais.faturasAtualizadas += res.faturasAtualizadas;
        setProgresso({ feitos: Math.min(i + TAMANHO_LOTE, validas.length), total: validas.length });
      }

      return totais;
    },
    onSuccess: (res) => {
      const partes = [`${res.importados} clientes importados`];
      if (res.faturasCriadas) partes.push(`${res.faturasCriadas} faturas criadas`);
      if (res.faturasAtualizadas) partes.push(`${res.faturasAtualizadas} faturas atualizadas`);
      toast.success(`${partes.join(" · ")}.`);
      setLinhas([]);
      setNomeArquivo(null);
      setProgresso(null);
      setAberto(false);
      onSuccess();
    },
    onError: (e: Error) => {
      setProgresso(null);
      toast.error(e.message);
    },
  });


  function processarArquivo(file: File) {
    setCarregandoLeitura(true);
    setNomeArquivo(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          toast.error("Nenhuma aba encontrada na planilha.");
          setLinhas([]);
          setCarregandoLeitura(false);
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        if (!sheet) {
          toast.error("Não foi possível ler a aba da planilha.");
          setLinhas([]);
          setCarregandoLeitura(false);
          return;
        }
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as (
          | string
          | number
          | null
          | undefined
        )[][];

        if (raw.length < 2) {
          toast.error("A planilha deve conter pelo menos uma linha de cabeçalho e uma linha de dados.");
          setLinhas([]);
          setCarregandoLeitura(false);
          return;
        }

        const firstRow = raw[0];
        if (!firstRow) {
          toast.error("Cabeçalho da planilha está vazio.");
          setLinhas([]);
          setCarregandoLeitura(false);
          return;
        }
        const cabecalhos = firstRow.map((h) => String(h ?? ""));
        const mapa = mapearColunas(cabecalhos);

        if (mapa["telefone"] === undefined) {
          toast.error("Coluna obrigatória não encontrada: telefone.");
          setLinhas([]);
          setCarregandoLeitura(false);
          return;
        }


        const processadas = raw
          .slice(1)
          .map((linha, idx) => validarLinha(linha, mapa, idx + 2))
          .filter((l) => l.nome || l.telefone || l.email || l.documento || l.observacoes || l.valorOriginal !== null);

        setLinhas(processadas);
      } catch (err) {
        toast.error("Erro ao ler planilha. Verifique o formato e tente novamente.");
      } finally {
        setCarregandoLeitura(false);
      }
    };

    reader.onerror = () => {
      toast.error("Não foi possível ler o arquivo.");
      setCarregandoLeitura(false);
    };

    reader.readAsArrayBuffer(file);
  }

  function limpar() {
    setLinhas([]);
    setNomeArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const validas = linhas.filter((l) => l.erros.length === 0);
  const invalidas = linhas.filter((l) => l.erros.length > 0);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={gerarModeloPlanilha}>
              <Download className="mr-2 size-4" />
              Baixar modelo
            </Button>
            <p className="text-xs text-muted-foreground">Arquivos .xlsx ou .csv com as colunas Nome, Telefone, Valor em aberto, Valor com desconto, Vencimento, Email, CPF/CNPJ e Observações.</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">Data de vencimento das faturas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Todas as faturas desta importação receberão esta mesma data.
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "mt-3 w-full justify-start text-left font-normal sm:w-72",
                    !vencimentoGlobal && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {vencimentoGlobal
                    ? format(vencimentoGlobal, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : "Escolher data no calendário"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={vencimentoGlobal}
                  onSelect={setVencimentoGlobal}
                  locale={ptBR}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>



          <div
            className="rounded-2xl border-2 border-dashed border-border bg-muted/40 p-8 text-center transition-colors hover:bg-muted/60"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) processarArquivo(file);
            }}
          >
            <FileSpreadsheet className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">
              Arraste uma planilha ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground">.xlsx, .csv</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processarArquivo(file);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => inputRef.current?.click()}
              disabled={carregandoLeitura}
            >
              <Upload className="mr-2 size-4" />
              Selecionar arquivo
            </Button>
          </div>

          {nomeArquivo && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
              <span className="truncate pr-4">{nomeArquivo}</span>
              <button onClick={limpar} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )}

          {linhas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-green-600" />
                <span>{validas.length} linhas válidas</span>
                {invalidas.length > 0 && (
                  <>
                    <AlertCircle className="ml-4 size-4 text-destructive" />
                    <span className="text-destructive">{invalidas.length} linhas com erro</span>
                  </>
                )}
              </div>

              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Telefone</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Em aberto</th>
                      <th className="px-3 py-2">Com desconto</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhas.slice(0, 50).map((l, idx) => (
                      <tr key={idx} className={l.erros.length > 0 ? "bg-destructive/10" : ""}>
                        <td className="px-3 py-2">{l.nome}</td>
                        <td className="px-3 py-2">{formatarTelefone(l.telefone)}</td>
                        <td className="px-3 py-2">{l.email || "—"}</td>
                        <td className="px-3 py-2">
                          {l.valorOriginal !== null ? formatarMoeda(l.valorOriginal) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {l.valorDesconto !== null ? formatarMoeda(l.valorDesconto) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {l.erros.length > 0 ? (
                            <span className="text-xs text-destructive" title={l.erros.join(" ")}>
                              {l.erros[0]}
                              {l.erros.length > 1 && ` (+${l.erros.length - 1})`}
                            </span>
                          ) : (
                            <CheckCircle2 className="size-4 text-green-600" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {linhas.length > 50 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Exibindo 50 de {linhas.length} registros. Todas as linhas válidas serão importadas.
                  </p>
                )}
              </div>

              {!vencimentoGlobal && (
                <p className="text-xs text-destructive">
                  Escolha a data de vencimento acima para liberar a importação.
                </p>
              )}
              <Button
                className="w-full"
                disabled={!validas.length || !vencimentoGlobal || importar.isPending}
                onClick={() => importar.mutate()}
              >
                {importar.isPending ? "Importando..." : `Importar ${validas.length} clientes`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
