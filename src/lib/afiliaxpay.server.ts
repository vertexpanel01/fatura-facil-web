/**
 * Integração com o gateway AfiliaxPay (PIX-IN).
 *
 * Documentação (painel AfiliaxPay):
 *   Base URL: https://app.afiliaxpay.com
 *   POST /api/wallet/deposit/payment  -> gera QrCode + Pix copia e cola
 *   POST /api/status                  -> consulta status da transação
 *
 * Credenciais (secrets):
 *  - AFILIAXPAY_TOKEN
 *  - AFILIAXPAY_SECRET
 *  - AFILIAXPAY_BASE_URL (opcional — padrão https://app.afiliaxpay.com)
 *
 * Os valores chegam SEMPRE em centavos (valor com desconto) e são enviados
 * em reais, conforme a documentação ("amount": 10).
 */

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  status: string;
};

function base(): string {
  return (process.env["AFILIAXPAY_BASE_URL"] ?? "https://app.afiliaxpay.com").replace(/\/+$/, "");
}

function credenciais(): { token: string; secret: string } | null {
  const token = process.env["AFILIAXPAY_TOKEN"];
  const secret = process.env["AFILIAXPAY_SECRET"];
  if (!token || !secret) return null;
  return { token, secret };
}

export function configurado(): boolean {
  return credenciais() !== null;
}

/** Procura o código copia-e-cola em qualquer formato de resposta. */
function extrairCopiaCola(valor: unknown, profundidade = 0): string {
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

function extrairId(dados: Record<string, unknown>): string {
  const direto =
    dados["idTransaction"] ??
    dados["transactionId"] ??
    dados["external_id"] ??
    dados["transaction_id"] ??
    dados["id"];
  if (direto != null && typeof direto !== "object") return String(direto);
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
  const cred = credenciais();
  if (!cred) return null;

  const centavos = Math.max(1, Math.trunc(entrada.centavos));
  const telefone = entrada.telefone.replace(/\D/g, "");
  const { documento } = await import("@/lib/cashinpay.server");
  const cpf = documento(entrada.documento, telefone);

  // Documentação: todos os campos são obrigatórios; amount em reais.
  const corpo: Record<string, unknown> = {
    token: cred.token,
    secret: cred.secret,
    amount: Number((centavos / 100).toFixed(2)),
    debtor_name: entrada.nome || "Cliente",
    email: entrada.email || `${telefone || "cliente"}@clarofatura.app`,
    debtor_document_number: cpf,
    phone: telefone,
    method_pay: "pix",
    postback: entrada.webhookUrl ?? "",
  };
  if (entrada.referencia) corpo["external_id"] = entrada.referencia;

  const caminho = process.env["AFILIAXPAY_ENDPOINT"] ?? "/api/wallet/deposit/payment";
  const url = `${base()}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo),
    });

    const bruto = await resposta.text().catch(() => "");

    if (!resposta.ok) {
      console.error("[afiliaxpay] falha", resposta.status, bruto.slice(0, 300));
      return null;
    }

    const dados = JSON.parse(bruto) as Record<string, unknown>;
    const copiaCola = extrairCopiaCola(dados);
    if (!copiaCola) {
      console.error("[afiliaxpay] resposta sem copia-e-cola", bruto.slice(0, 300));
      return null;
    }

    return {
      id: extrairId(dados) || String(entrada.referencia ?? ""),
      copia_cola: copiaCola,
      status: "pendente",
    };
  } catch (erro) {
    console.error("[afiliaxpay] erro de rede", erro);
    return null;
  }
}

/**
 * Consulta o status de um PIX-IN.
 * Resposta 200 -> { "status": "pago" } | 404 -> { "status": "not_found" }
 */
export async function consultarStatus(idTransaction: string): Promise<string | null> {
  const cred = credenciais();
  if (!cred || !idTransaction) return null;

  try {
    const resposta = await fetch(`${base()}/api/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: cred.token, secret: cred.secret, idTransaction }),
    });

    const bruto = await resposta.text().catch(() => "");
    if (!bruto.trim().startsWith("{")) return null;

    const dados = JSON.parse(bruto) as { status?: string };
    return dados.status ?? null;
  } catch {
    return null;
  }
}

/** Status internos da AfiliaxPay que significam pagamento aprovado. */
export function statusPago(status: string | null | undefined): boolean {
  if (!status) return false;
  return ["pago", "paid", "approved", "completed", "success", "succeeded", "done", "realizado", "finalizado"].includes(
    status.toLowerCase(),
  );
}
