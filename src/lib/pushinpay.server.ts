/**
 * Integração com o gateway PushinPay (https://api.pushinpay.com.br).
 * Autenticação: token Bearer em PUSHINPAY_TOKEN.
 * Os valores trafegam SEMPRE em centavos e SEMPRE com o valor com desconto.
 */

const BASE = "https://api.pushinpay.com.br/api";

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  status: string;
};

export function configurado(): boolean {
  return Boolean(process.env["PUSHINPAY_TOKEN"]);
}

export async function criarCobrancaPix(entrada: {
  centavos: number;
  webhookUrl?: string | null;
}): Promise<CobrancaPix | null> {
  const token = process.env["PUSHINPAY_TOKEN"];
  if (!token) return null;

  const centavos = Math.max(1, Math.trunc(entrada.centavos));
  const corpo: Record<string, unknown> = { value: centavos };
  if (entrada.webhookUrl) corpo["webhook_url"] = entrada.webhookUrl;

  try {
    const resposta = await fetch(`${BASE}/pix/cashIn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
    });

    const bruto = await resposta.text().catch(() => "");
    if (!resposta.ok) {
      console.error("[pushinpay] falha ao criar cobrança", resposta.status, bruto.slice(0, 300));
      return null;
    }

    const dados = JSON.parse(bruto) as Record<string, unknown>;
    const copiaCola =
      (typeof dados["qr_code"] === "string" && dados["qr_code"]) ||
      (typeof dados["qrcode"] === "string" && dados["qrcode"]) ||
      "";
    if (!copiaCola) return null;

    return {
      id: String(dados["id"] ?? ""),
      copia_cola: copiaCola,
      status: String(dados["status"] ?? "pending"),
    };
  } catch (erro) {
    console.error("[pushinpay] erro de rede", erro);
    return null;
  }
}

/** Consulta o status de uma transação. Devolve null se não conseguir consultar. */
export async function consultarTransacao(id: string): Promise<string | null> {
  const token = process.env["PUSHINPAY_TOKEN"];
  if (!token || !id) return null;
  try {
    const resposta = await fetch(`${BASE}/transactions/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { status?: unknown };
    return dados.status ? String(dados.status) : null;
  } catch {
    return null;
  }
}
