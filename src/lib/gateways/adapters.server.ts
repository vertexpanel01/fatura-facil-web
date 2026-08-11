/**
 * Registro de adaptadores de gateway.
 * Cada adaptador implementa o contrato `GatewayAdapter` (types.ts).
 */
import type {
  CriarPixEntrada,
  GatewayAdapter,
  GatewayRegistro,
  PixCriado,
  WebhookLido,
} from "./types";

/** Procura o código copia-e-cola em qualquer formato de resposta. */
export function extrairCopiaCola(valor: unknown, profundidade = 0): string {
  if (profundidade > 6 || valor == null) return "";
  if (typeof valor === "string") {
    return valor.replace(/\s/g, "").startsWith("00020") ? valor.trim() : "";
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achado = extrairCopiaCola(item, profundidade + 1);
      if (achado) return achado;
    }
    return "";
  }
  if (typeof valor === "object") {
    for (const item of Object.values(valor as Record<string, unknown>)) {
      const achado = extrairCopiaCola(item, profundidade + 1);
      if (achado) return achado;
    }
  }
  return "";
}

function busca(objeto: unknown, chaves: string[], profundidade = 0): string | null {
  if (profundidade > 6 || !objeto || typeof objeto !== "object") return null;
  const registro = objeto as Record<string, unknown>;
  for (const chave of chaves) {
    const v = registro[chave];
    if (v != null && typeof v !== "object") return String(v);
  }
  for (const v of Object.values(registro)) {
    const achado = busca(v, chaves, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

const PAGO = new Set([
  "pago",
  "paid",
  "approved",
  "completed",
  "success",
  "succeeded",
  "done",
  "confirmado",
  "realizado",
  "finalizado",
]);

function statusPago(status: string | null | undefined): boolean {
  return PAGO.has((status ?? "").toString().trim().toLowerCase());
}

// ---------------------------------------------------------------- CashinPay
const cashinpay: GatewayAdapter = {
  nome: "cashinpay",
  configurado: () => Boolean(process.env["CASHINPAY_SECRET_KEY"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const { criarCobrancaPix } = await import("@/lib/cashinpay.server");
    const c = await criarCobrancaPix({
      centavos: e.centavos,
      nome: e.nome,
      telefone: e.telefone,
      email: e.email ?? null,
      documento: e.documento ?? null,
      descricao: e.descricao,
      referencia: e.referencia,
      webhookUrl: e.webhookUrl,
    });
    if (!c) throw new Error("CashinPay não retornou a cobrança.");
    return { transacaoId: c.id, copiaCola: c.copia_cola, status: c.status };
  },
  async consultarStatus(id) {
    const { consultarTransacao } = await import("@/lib/cashinpay.server");
    return consultarTransacao(id);
  },
  pago: statusPago,
  async lerWebhook(_request, corpoBruto): Promise<WebhookLido> {
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }
    return {
      valido: true,
      transacaoId: busca(corpo, ["transaction_id", "transactionId", "external_id", "id"]),
      status: busca(corpo, ["status", "payment_status"]),
      evento: busca(corpo, ["event", "type"]),
    };
  },
};

// --------------------------------------------------------------- AfiliaxPay
const afiliaxpay: GatewayAdapter = {
  nome: "afiliaxpay",
  configurado: () =>
    Boolean(process.env["AFILIAXPAY_TOKEN"] && process.env["AFILIAXPAY_SECRET"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const { criarCobrancaPix } = await import("@/lib/afiliaxpay.server");
    const c = await criarCobrancaPix({
      centavos: e.centavos,
      nome: e.nome,
      telefone: e.telefone,
      email: e.email ?? null,
      documento: e.documento ?? null,
      descricao: e.descricao,
      referencia: e.referencia,
      webhookUrl: e.webhookUrl,
    });
    if (!c) throw new Error("AfiliaxPay não retornou a cobrança.");
    return { transacaoId: c.id, copiaCola: c.copia_cola, status: c.status };
  },
  async consultarStatus(id) {
    const { consultarStatus } = await import("@/lib/afiliaxpay.server");
    return consultarStatus(id);
  },
  pago: statusPago,
  async lerWebhook(_request, corpoBruto): Promise<WebhookLido> {
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }
    return {
      valido: true,
      transacaoId: busca(corpo, ["idTransaction", "transactionId", "transaction_id", "id"]),
      status: busca(corpo, ["status"]),
      evento: busca(corpo, ["event", "type"]),
    };
  },
};

// ------------------------------------------------------------- PIX estático
const pixEstatico: GatewayAdapter = {
  nome: "pix-estatico",
  configurado: () => Boolean(process.env["PIX_CHAVE"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const chave = process.env["PIX_CHAVE"];
    if (!chave) throw new Error("PIX_CHAVE não configurada.");
    const { gerarBrCode, novoTxid } = await import("@/lib/pix.server");
    const txid = novoTxid();
    return {
      transacaoId: txid,
      copiaCola: gerarBrCode({
        chave,
        valor: e.centavos / 100,
        nome: process.env["PIX_RECEBEDOR"] ?? process.env["PIX_NOME"] ?? "FATURA MOVEL",
        cidade: process.env["PIX_CIDADE"] ?? "SAO PAULO",
        txid,
      }),
      status: "pendente",
    };
  },
  // O PIX estático não tem consulta de status: a baixa só ocorre manualmente
  // ou por outro gateway.
  consultarStatus: async () => null,
  pago: statusPago,
  lerWebhook: (): WebhookLido => ({
    valido: false,
    transacaoId: null,
    status: null,
    evento: null,
  }),
};

// ------------------------------------------------------------ REST genérico
/**
 * Adaptador genérico para gateways REST que ainda serão contratadas.
 * Usa a URL cadastrada no painel e os segredos informados em `secret_names`
 * (o primeiro é o token/API key, o segundo o secret, quando houver).
 */
const generico: GatewayAdapter = {
  nome: "generico",
  configurado: (gw) =>
    Boolean(gw.api_url) &&
    gw.secret_names.length > 0 &&
    gw.secret_names.every((n) => Boolean(process.env[n])),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const gw = e.gateway;
    if (!gw.api_url) throw new Error("URL da API não configurada.");
    const token = gw.secret_names[0] ? process.env[gw.secret_names[0]] : undefined;
    const secret = gw.secret_names[1] ? process.env[gw.secret_names[1]] : undefined;
    if (!token) throw new Error("Credencial não configurada.");

    const resposta = await fetch(gw.api_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(secret ? { "x-secret-key": secret } : {}),
      },
      body: JSON.stringify({
        amount: Number((e.centavos / 100).toFixed(2)),
        amount_cents: e.centavos,
        method_pay: "pix",
        payment_method: "pix",
        description: e.descricao,
        external_id: e.referencia,
        postback: e.webhookUrl,
        webhook_url: e.webhookUrl,
        customer: {
          name: e.nome || "Cliente",
          email: e.email || `${e.telefone || "cliente"}@clarofatura.app`,
          phone: e.telefone,
          document: e.documento ?? "",
        },
      }),
    });

    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    let dados: unknown = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new Error("Resposta inválida da gateway.");
    }
    const copiaCola = extrairCopiaCola(dados);
    const id = busca(dados, ["idTransaction", "transaction_id", "transactionId", "id"]);
    if (!copiaCola || !id) throw new Error("Gateway não devolveu o código PIX.");
    return {
      transacaoId: id,
      copiaCola,
      qrcode: busca(dados, ["qrcode_image", "qr_code_base64", "qrCodeImage"]),
      status: busca(dados, ["status"]) ?? "pendente",
      expiraEm: busca(dados, ["expires_at", "expiration", "expiraEm"]),
    };
  },
  async consultarStatus() {
    return null;
  },
  pago: statusPago,
  async lerWebhook(request, corpoBruto, gw): Promise<WebhookLido> {
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }
    // Quando houver um segredo de webhook cadastrado, exige o cabeçalho.
    const nomeSegredo = gw.secret_names.find((n) => n.toUpperCase().includes("WEBHOOK"));
    const esperado = nomeSegredo ? process.env[nomeSegredo] : undefined;
    const enviado =
      request.headers.get("x-webhook-secret") ?? request.headers.get("x-signature") ?? "";
    const valido = esperado ? enviado === esperado : true;
    return {
      valido,
      transacaoId: busca(corpo, ["idTransaction", "transaction_id", "transactionId", "id"]),
      status: busca(corpo, ["status", "payment_status"]),
      evento: busca(corpo, ["event", "type"]),
    };
  },
};

const REGISTRO: Record<string, GatewayAdapter> = {
  cashinpay,
  afiliaxpay,
  "pix-estatico": pixEstatico,
  generico,
};

export function adaptadorDe(gw: GatewayRegistro): GatewayAdapter {
  return REGISTRO[gw.adapter] ?? REGISTRO[gw.slug] ?? generico;
}

export const ADAPTADORES = Object.keys(REGISTRO);
