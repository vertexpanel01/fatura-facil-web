ALTER TABLE public.roteamento_config
  ADD COLUMN IF NOT EXISTS novo_pix_por_acesso boolean NOT NULL DEFAULT true;

ALTER TABLE public.transacoes_pix
  ADD COLUMN IF NOT EXISTS valor_pago_centavos integer,
  ADD COLUMN IF NOT EXISTS substituida_em timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_transacoes_fatura_created
  ON public.transacoes_pix (fatura_id, created_at DESC);