import * as XLSX from "xlsx";

const dados = [
  ["Nome", "Telefone", "Email", "CPF/CNPJ", "Observacoes"],
  ["Maria Silva", "11999999999", "maria@email.com", "12345678900", "Cliente ativo"],
  ["Joao Souza", "21988888888", "joao@email.com", "", ""],
  ["", "123", "email-invalido", "", ""], // linha invalida
];

const ws = XLSX.utils.aoa_to_sheet(dados);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Clientes");
const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

const wb2 = XLSX.read(buf, { type: "array" });
const sheet = wb2.Sheets[wb2.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

console.log("raw rows:", raw.length);
console.log("header:", raw[0]);

const COLUNAS_ESPERADAS = [
  { chaves: ["nome", "name", "cliente"], campo: "nome" },
  { chaves: ["telefone", "tel", "celular", "phone", "whatsapp"], campo: "telefone" },
  { chaves: ["email", "e-mail", "mail"], campo: "email" },
  { chaves: ["documento", "cpf", "cnpj", "cpf/cnpj", "doc"], campo: "documento" },
  { chaves: ["observacoes", "observações", "obs", "notas"], campo: "observacoes" },
];

function normalizarChave(chave) {
  return String(chave).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

const cabecalhos = raw[0].map((h) => String(h ?? ""));
const mapa = {};
for (const col of COLUNAS_ESPERADAS) {
  const idx = cabecalhos.findIndex((h) => col.chaves.includes(normalizarChave(h)));
  if (idx >= 0) mapa[col.campo] = idx;
}

console.log("mapa:", mapa);

function validar(linha, numero) {
  const nome = String(linha[mapa.nome] ?? "").trim();
  const tel = String(linha[mapa.telefone] ?? "").replace(/\D/g, "");
  const email = String(linha[mapa.email] ?? "").trim() || null;
  const erros = [];
  if (!nome) erros.push("nome obrigatorio");
  if (tel.length < 10 || tel.length > 11) erros.push("telefone invalido");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push("email invalido");
  return { nome, tel, email, erros };
}

const processadas = raw.slice(1).map((l, i) => validar(l, i + 2));
console.log("processadas:", processadas);
console.log("validas:", processadas.filter((p) => p.erros.length === 0).length);
console.log("invalidas:", processadas.filter((p) => p.erros.length > 0).length);
