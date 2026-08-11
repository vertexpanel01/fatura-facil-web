/**
 * Integração com o gateway CashinPay BR (https://api.cashinpaybr.com/api/v1).
 * Autenticação: apenas a Secret Key (CASHINPAY_SECRET_KEY), via Bearer.
 * Os valores trafegam SEMPRE em centavos e SEMPRE com o valor com desconto.
 */

const BASE = "https://api.cashinpaybr.com/api/v1";

function chave(): string {
  const k = process.env["CASHINPAY_SECRET_KEY"];
  if (!k) throw new Error("CASHINPAY_SECRET_KEY não configurada.");
  return k;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${chave()}`,
  };
}

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  status: string;
};

/** Só dígitos; garante um CPF de fallback quando o cliente não tem documento. */
function documento(valor: string | null | undefined): string {
  const d = (valor ?? "").replace(/\D/g, "");
  return d.length === 11 || d.length === 14 ? d : "12345678909";
}

function primeiroCampo(obj: unknown, campos: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const registro = obj as Record<string, unknown>;
  for (const campo of campos) {
    const v = registro[campo];
    if (typeof v === "string" && v.length > 0) return v;
    if (v && typeof v === "object") {
      const aninhado = primeiroCampo(v, campos);
      if (aninhado) return aninhado;
    }
  }
  return null;
}

/**
 * Cria uma cobrança PIX dinâmica. Devolve null quando o gateway está
 * indisponível — nesse caso o sistema cai no PIX estático de contingência.
 */
export async function criarCobrancaPix(entrada: {
  centavos: number; // valor com desconto, já em centavos (inteiro)
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  descricao: string;
  webhookUrl?: string | null;
}): Promise<CobrancaPix | null> {
  const centavos = Math.max(1, Math.trunc(entrada.centavos));


  const corpo: Record<string, unknown> = {
    amount: centavos,
    paymentMethod: "PIX",
    customer: {
      name: entrada.nome || "Cliente",
      email: entrada.email || "cliente@clarofatura.app",
      phone: entrada.telefone.replace(/\D/g, "") || "11999999999",
      document: { number: documento(entrada.documento), type: "CPF" },
    },
    items: [
      { title: entrada.descricao, unitPrice: centavos, quantity: 1, tangible: false },
    ],
  };
  if (entrada.webhookUrl) corpo["postbackUrl"] = entrada.webhookUrl;

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}/transactions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(corpo),
    });
  } catch {
    return null;
  }

  const bruto = await resposta.text().catch(() => "");
  const json = (() => {
    try {
      return JSON.parse(bruto) as { success?: boolean; data?: unknown; error?: { message?: string } };
    } catch {
      return null;
    }
  })();

  if (!resposta.ok || !json?.success) {
    console.error("[cashinpay] falha ao criar cobrança", resposta.status, bruto.slice(0, 500));
    return null;
  }


  const dados = (json.data ?? json) as Record<string, unknown>;
  const copiaCola = primeiroCampo(dados, [
    "qrcode",
    "qrCode",
    "pixCode",
    "copyPaste",
    "emv",
    "payload",
    "brcode",
  ]);
  const id = primeiroCampo(dados, ["id", "transactionId", "transaction_id"]);

  if (!copiaCola || !id) return null;

  return {
    id,
    copia_cola: copiaCola,
    status: String((dados as { status?: unknown }).status ?? "pending"),
  };
}

/** Consulta o status de uma transação. Devolve null se não conseguir consultar. */
export async function consultarTransacao(id: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${BASE}/transactions/${encodeURIComponent(id)}`, {
      headers: headers(),
    });
    const json = (await resposta.json().catch(() => null)) as
      | { success?: boolean; data?: Record<string, unknown> }
      | null;
    if (!resposta.ok || !json?.success) return null;
    const status = (json.data as { status?: unknown } | undefined)?.status;
    return typeof status === "string" ? status : null;
  } catch {
    return null;
  }
}

/** Normaliza os diferentes rótulos de status do gateway. */
export function pagoNoGateway(status: string | null | undefined): boolean {
  if (!status) return false;
  return ["paid", "approved", "completed", "confirmed", "pago", "aprovado"].includes(
    status.toLowerCase(),
  );
}
