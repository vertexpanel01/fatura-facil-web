ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS boleto_codigo text,
  ADD COLUMN IF NOT EXISTS boleto_url text,
  ADD COLUMN IF NOT EXISTS data_pagamento timestamptz;

DROP VIEW IF EXISTS public.faturas_por_telefone;

CREATE VIEW public.faturas_por_telefone
WITH (security_invoker = on) AS
SELECT DISTINCT ON (c.telefone)
  c.telefone AS telefone,
  c.nome AS nome,
  f.id AS fatura_id,
  COALESCE(f.valor_original, 0)::numeric AS valor_em_aberto,
  COALESCE(f.valor_desconto, 0)::numeric AS valor_com_desconto,
  f.status::text AS status,
  f.vencimento AS data_vencimento,
  f.pix_copia_cola AS pix_copia_e_cola,
  f.boleto_codigo AS boleto_codigo,
  f.boleto_url AS boleto_url,
  f.data_pagamento AS data_pagamento
FROM public.clientes c
LEFT JOIN public.faturas f ON f.cliente_id = c.id
ORDER BY
  c.telefone,
  (f.status IN ('em_aberto','vencida')) DESC NULLS LAST,
  f.vencimento DESC NULLS LAST;

GRANT SELECT ON public.faturas_por_telefone TO authenticated;
GRANT SELECT ON public.faturas_por_telefone TO service_role;