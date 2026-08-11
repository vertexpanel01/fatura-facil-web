CREATE TABLE IF NOT EXISTS public.gateways_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  rotulo text NOT NULL,
  ativo boolean NOT NULL DEFAULT false,
  prioridade integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateways_config TO authenticated;
GRANT ALL ON public.gateways_config TO service_role;

ALTER TABLE public.gateways_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gerenciam gateways" ON public.gateways_config;
CREATE POLICY "admins gerenciam gateways" ON public.gateways_config
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.gateways_config (slug, rotulo, ativo, prioridade) VALUES
  ('cashinpay', 'CashinPay BR', true, 10),
  ('pushinpay', 'PushinPay', false, 20),
  ('pix-estatico', 'PIX estático (chave própria)', false, 90)
ON CONFLICT (slug) DO NOTHING;