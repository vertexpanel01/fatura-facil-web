/**
 * Roteador de gateways de pagamento.
 * Lê a configuração em public.gateways_config e tenta cada gateway ativo,
 * em ordem de prioridade, até que uma cobrança PIX seja criada com sucesso.
 * Com apenas um gateway ativo, o comportamento é "gateway único";
 * com vários ativos, funciona como rotação/contingência automática.
 */

export type CobrancaGateway = {
  gateway: string;
  id: string;
  copia_cola: string;
  status: string;
};

export type DadosCobranca = {
  centavos: number;
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  descricao: string;
  referencia?: string | null;
  baseUrl: string;
};

async function gatewaysAtivos(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("gateways_config")
    .select("slug, ativo, prioridade")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });

  const slugs = (data ?? []).map((g) => g.slug);
  return slugs.length > 0 ? slugs : ["cashinpay"];
}

async function tentar(slug: string, dados: DadosCobranca): Promise<CobrancaGateway | null> {
  if (slug === "cashinpay") {
    const { criarCobrancaPix } = await import("@/lib/cashinpay.server");
    const cobranca = await criarCobrancaPix({
      centavos: dados.centavos,
      nome: dados.nome,
      telefone: dados.telefone,
      email: dados.email ?? null,
      documento: dados.documento ?? null,
      descricao: dados.descricao,
      referencia: dados.referencia ?? null,
      webhookUrl: `${dados.baseUrl}/api/public/cashinpay-webhook`,
    });
    return cobranca ? { gateway: slug, ...cobranca } : null;
  }

  if (slug === "afiliaxpay") {
    const { criarCobrancaPix } = await import("@/lib/afiliaxpay.server");
    const cobranca = await criarCobrancaPix({
      centavos: dados.centavos,
      nome: dados.nome,
      telefone: dados.telefone,
      email: dados.email ?? null,
      documento: dados.documento ?? null,
      descricao: dados.descricao,
      referencia: dados.referencia ?? null,
      webhookUrl: `${dados.baseUrl}/api/public/pix-webhook`,
    });
    return cobranca ? { gateway: slug, ...cobranca } : null;
  }


  if (slug === "pix-estatico") {
    const chave = process.env["PIX_CHAVE"];
    if (!chave) return null;
    const { gerarBrCode, novoTxid } = await import("@/lib/pix.server");
    const txid = novoTxid();
    return {
      gateway: slug,
      id: txid,
      copia_cola: gerarBrCode({
        chave,
        valor: dados.centavos / 100,
        nome: process.env["PIX_RECEBEDOR"] ?? "FATURA MOVEL",
        cidade: process.env["PIX_CIDADE"] ?? "SAO PAULO",
        txid,
      }),
      status: "pending",
    };
  }

  return null;
}

/** Cria a cobrança usando o primeiro gateway ativo que responder. */
export async function criarCobranca(dados: DadosCobranca): Promise<CobrancaGateway | null> {
  const ativos = await gatewaysAtivos();
  for (const slug of ativos) {
    const cobranca = await tentar(slug, dados);
    if (cobranca) return cobranca;
    console.error("[gateways] gateway indisponível, tentando o próximo:", slug);
  }
  return null;
}
