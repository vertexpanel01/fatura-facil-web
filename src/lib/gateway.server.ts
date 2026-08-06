/**
 * Adaptador de gateway de pagamento.
 *
 * Hoje gera PIX estático (BR Code) localmente e não emite boleto.
 * Para plugar Asaas, Stripe ou Mercado Pago basta implementar a mesma
 * interface aqui e trocar `gatewayAtual` — nenhum outro arquivo muda.
 */
import { gerarBrCode, novoTxid } from "./pix.server";

export type CobrancaEntrada = {
  faturaId: string;
  valor: number; // sempre o valor COM desconto
  nomeCliente: string;
  telefone: string;
  vencimento: string;
};

export type CobrancaGerada = {
  pix_copia_e_cola: string | null;
  pix_txid: string | null;
  boleto_codigo: string | null;
  boleto_url: string | null;
  gateway: string;
};

export interface GatewayPagamento {
  nome: string;
  gerar(entrada: CobrancaEntrada): Promise<CobrancaGerada>;
}

const gatewayLocal: GatewayPagamento = {
  nome: "pix-estatico",
  async gerar(entrada) {
    const chave = process.env["PIX_CHAVE"] ?? "00000000000";
    const nomeRecebedor = process.env["PIX_NOME"] ?? "FATURA EM DIA";
    const cidade = process.env["PIX_CIDADE"] ?? "SAO PAULO";
    const txid = novoTxid();

    return {
      pix_copia_e_cola: gerarBrCode({
        chave,
        valor: entrada.valor,
        nome: nomeRecebedor,
        cidade,
        txid,
      }),
      pix_txid: txid,
      boleto_codigo: null,
      boleto_url: null,
      gateway: "pix-estatico",
    };
  },
};

export const gatewayAtual: GatewayPagamento = gatewayLocal;
