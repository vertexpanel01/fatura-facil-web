UPDATE public.gateways_config
SET slug = 'afiliaxpay', rotulo = 'AfiliaxPay', updated_at = now()
WHERE slug = 'pushinpay';

INSERT INTO public.gateways_config (slug, rotulo, ativo, prioridade)
VALUES ('afiliaxpay', 'AfiliaxPay', false, 20)
ON CONFLICT (slug) DO NOTHING;