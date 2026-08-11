-- 1. Amplia o cadastro de gateways
ALTER TABLE public.gateways_config
  ADD COLUMN IF NOT EXISTS api_url text,
  ADD COLUMN IF NOT EXISTS ambiente text NOT NULL DEFAULT 'producao',
  ADD COLUMN IF NOT EXISTS limite_diario integer,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS secret_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS adapter text NOT NULL DEFAULT 'generico',
  ADD COLUMN IF NOT EXISTS observacoes text;

UPDATE public.gateways_config SET adapter = slug WHERE adapter = 'generico';

-- 2. Configuração do roteador
CREATE TABLE IF NOT EXISTS public.roteamento_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  estrategia text NOT NULL DEFAULT 'prioridade',
  gateway_fixa uuid REFERENCES public.gateways_config(id) ON DELETE SET NULL,
  ponteiro integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roteamento_config TO authenticated;
GRANT ALL ON public.roteamento_config TO service_role;
ALTER TABLE public.roteamento_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY roteamento_admin_select ON public.roteamento_config
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.roteamento_config (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TRIGGER trg_roteamento_updated BEFORE UPDATE ON public.roteamento_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Transações PIX
CREATE TABLE IF NOT EXISTS public.transacoes_pix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  gateway_slug text NOT NULL,
  gateway_id uuid REFERENCES public.gateways_config(id) ON DELETE SET NULL,
  transacao_gateway_id text,
  valor_centavos integer NOT NULL,
  copia_cola text,
  qrcode text,
  status text NOT NULL DEFAULT 'pendente',
  idempotency_key text NOT NULL UNIQUE,
  expira_em timestamptz,
  pago_em timestamptz,
  webhook_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transacoes_fatura ON public.transacoes_pix(fatura_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_gwid ON public.transacoes_pix(transacao_gateway_id);
GRANT SELECT ON public.transacoes_pix TO authenticated;
GRANT ALL ON public.transacoes_pix TO service_role;
ALTER TABLE public.transacoes_pix ENABLE ROW LEVEL SECURITY;
CREATE POLICY transacoes_admin_select ON public.transacoes_pix
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_transacoes_updated BEFORE UPDATE ON public.transacoes_pix
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Log de webhooks
CREATE TABLE IF NOT EXISTS public.webhooks_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_slug text NOT NULL,
  evento text,
  transacao_gateway_id text,
  assinatura_valida boolean NOT NULL DEFAULT false,
  resumo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_log_data ON public.webhooks_log(created_at DESC);
GRANT SELECT ON public.webhooks_log TO authenticated;
GRANT ALL ON public.webhooks_log TO service_role;
ALTER TABLE public.webhooks_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhooks_log_admin_select ON public.webhooks_log
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 5. Log de pagamentos / tentativas
CREATE TABLE IF NOT EXISTS public.pagamentos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_slug text NOT NULL,
  fatura_id uuid,
  nivel text NOT NULL DEFAULT 'erro',
  http_status integer,
  mensagem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_log_data ON public.pagamentos_log(created_at DESC);
GRANT SELECT ON public.pagamentos_log TO authenticated;
GRANT ALL ON public.pagamentos_log TO service_role;
ALTER TABLE public.pagamentos_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagamentos_log_admin_select ON public.pagamentos_log
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));