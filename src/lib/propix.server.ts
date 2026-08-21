/**
 * Integração com o gateway ProPix (https://api.propixbr.com/api/v1).
 */
import { registrarLog } from "./payment-router.server";

const BASE = "https://api.propixbr.com/api/v1";

function credenciais() {
  const clientId = process.env["PROPIX_CLIENT_ID"];
  const clientSecret = process.env["PROPIX_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais ProPix (CLIENT_ID/SECRET) não configuradas.");
  }
  return { clientId, clientSecret };
}

function headers() {
  const { clientId, clientSecret } = credenciais();
  return {
    "Content-Type": "application/json",
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
  };
}

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  qrcode: string | null;
  status: string;
};

/**
 * Cria uma cobrança PIX dinâmica na ProPix.
 */
export async function criarCobrancaPix(entrada: {
  centavos: number;
  nome: string;
  telefone: string;
  documento?: string | null;
  descricao: string;
  referencia?: string | null;
}): Promise<CobrancaPix | null> {
  const reais = Number((entrada.centavos / 100).toFixed(2));
  const cpf = (entrada.documento ?? "").replace(/\D/g, "");

  const corpo = {
    amount: reais,
    description: entrada.descricao || `Pagamento #${entrada.referencia}`,
    payerName: entrada.nome || "Cliente",
    payerDocument: cpf,
  };

  try {
    console.log(`[propix] criando depósito de R$ ${reais} para ${entrada.referencia}`);
    const resposta = await fetch(`${BASE}/deposit`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(corpo),
    });

    const bruto = await resposta.text();
    console.log(`[propix] status: ${resposta.status}, resposta: ${bruto.slice(0, 500)}`);

    const json = JSON.parse(bruto);

    if (!resposta.ok || !json.success) {
      console.error("[propix] erro ao criar cobrança:", bruto);
      await registrarLog({
        gateway_slug: "propix",
        fatura_id: entrada.referencia ?? null,
        http_status: resposta.status,
        mensagem: `Erro ProPix: ${bruto.slice(0, 450)}`,
      }).catch(() => {});
      return null;
    }

    // O QR Code vem com prefixo "base64:", que tratamos aqui
    let qrcode = json.qrcodeUrl || null;
    if (qrcode && qrcode.startsWith("base64:")) {
      qrcode = qrcode.replace("base64:", "");
    }

    return {
      id: json.transactionId,
      copia_cola: json.copyPaste,
      qrcode: qrcode,
      status: json.status || "PENDENTE",
    };
  } catch (e) {
    console.error("[propix] erro de rede/processamento:", e);
    return null;
  }
}

/**
 * Consulta o status de uma transação.
 */
export async function consultarTransacao(id: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${BASE}/check`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ transactionId: id }),
    });

    const json = await resposta.json();
    if (!resposta.ok || !json.transaction) {
      console.error("[propix] erro ao consultar transação:", id, json);
      return null;
    }

    return json.transaction.transactionState; // Ex: "COMPLETO", "PENDENTE"
  } catch (e) {
    console.error("[propix] erro ao consultar status ProPix:", e);
    return null;
  }
}

/**
 * Normaliza status ProPix para boolean pago.
 */
export function pagoNoGateway(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return ["COMPLETO", "APROVADO", "PAID", "SUCCESS"].includes(s);
}
