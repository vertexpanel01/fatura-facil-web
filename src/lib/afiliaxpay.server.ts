/**
 * Integração com o gateway AfiliaxPay (https://app.afiliaxpay.com).
 *
 * Credenciais (secrets):
 *  - AFILIAXPAY_TOKEN     (token público / chave de identificação)
 *  - AFILIAXPAY_SECRET    (chave secreta)
 *  - AFILIAXPAY_BASE_URL  (opcional — padrão https://api.afiliaxpay.com)
 *
 * Os valores trafegam SEMPRE em centavos e SEMPRE com o valor com desconto.
 */

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  status: string;
};

function base(): string {
  return (process.env["AFILIAXPAY_BASE_URL"] ?? "https://api.afiliaxpay.com").replace(/\/+$/, "");
}

function credenciais(): { token: string; secret: string } | null {
  const token = process.env["AFILIAXPAY_TOKEN"];
  const secret = process.env["AFILIAXPAY_SECRET"];
  if (!token || !secret) return null;
  return { token, secret };
}

/** Cabeçalhos aceitos pelos formatos mais comuns dessa família de gateways. */
function cabecalhos(): Record<string, string> | null {
  const cred = credenciais();
  if (!cred) return null;
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${cred.token}:${cred.secret}`).toString("base64")}`,
    "x-public-key": cred.token,
    "x-secret-key": cred.secret,
    "x-api-token": cred.token,
  };
}

export function configurado(): boolean {
  return credenciais() !== null;
}


/** Procura o código copia-e-cola em qualquer formato de resposta. */
function extrairCopiaCola(valor: unknown, profundidade = 0): string {
  if (profundidade > 6 || valor == null) return "";
  if (typeof valor === "string") {
    return valor.startsWith("00020") ? valor : "";
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

function extrairId(dados: Record<string, unknown>): string {
  const direto = dados["id"] ?? dados["transaction_id"] ?? dados["transactionId"];
  if (direto != null) return String(direto);
  const interno = dados["data"];
  if (interno && typeof interno === "object") {
    return extrairId(interno as Record<string, unknown>);
  }
  return "";
}

export async function criarCobrancaPix(entrada: {
  centavos: number;
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  descricao: string;
  referencia?: string | null;
  webhookUrl?: string | null;
}): Promise<CobrancaPix | null> {
  const headers = cabecalhos();
  if (!headers) return null;

  const centavos = Math.max(1, Math.trunc(entrada.centavos));
  const telefone = entrada.telefone.replace(/\D/g, "");
  const { documento } = await import("@/lib/cashinpay.server");

  const corpo = {
    amount: centavos,
    currency: "BRL",
    paymentMethod: "PIX",
    payment_method: "pix",
    description: entrada.descricao,
    externalRef: entrada.referencia ?? undefined,
    external_reference: entrada.referencia ?? undefined,
    postbackUrl: entrada.webhookUrl ?? undefined,
    webhook_url: entrada.webhookUrl ?? undefined,
    customer: {
      name: entrada.nome || "Cliente",
      email: entrada.email || `${telefone || "cliente"}@clarofatura.app`,
      phone: telefone,
      document: {
        number: documento(entrada.documento, telefone),
        type: "CPF",
      },
      documento: documento(entrada.documento, telefone),
    },
    items: [
      {
        title: entrada.descricao || "Fatura",
        unitPrice: centavos,
        quantity: 1,
        tangible: false,
      },
    ],
  };

  // AFILIAXPAY_ENDPOINT permite apontar para o caminho exato da API sem alterar código.
  const custom = process.env["AFILIAXPAY_ENDPOINT"];
  const caminhos = custom
    ? [custom.startsWith("/") ? custom : `/${custom}`]
    : ["/api/v1/transactions", "/v1/transactions", "/api/v1/pix/charges"];

  for (const caminho of caminhos) {
    try {
      const resposta = await fetch(`${base()}${caminho}`, {
        method: "POST",
        headers,
        body: JSON.stringify(corpo),
      });

      const bruto = await resposta.text().catch(() => "");

      if (resposta.status === 404 || resposta.status === 405) continue;

      if (!resposta.ok) {
        console.error("[afiliaxpay] falha", caminho, resposta.status, bruto.slice(0, 300));
        continue;
      }

      const dados = JSON.parse(bruto) as Record<string, unknown>;
      const copiaCola = extrairCopiaCola(dados);
      if (!copiaCola) {
        console.error("[afiliaxpay] resposta sem copia-e-cola", bruto.slice(0, 300));
        continue;
      }

      return {
        id: extrairId(dados) || String(entrada.referencia ?? ""),
        copia_cola: copiaCola,
        status: "pending",
      };
    } catch (erro) {
      console.error("[afiliaxpay] erro de rede", caminho, erro);
    }
  }

  return null;
}
