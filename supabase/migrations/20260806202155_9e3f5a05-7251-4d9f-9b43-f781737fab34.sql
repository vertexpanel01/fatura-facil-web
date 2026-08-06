CREATE OR REPLACE VIEW public.faturas_por_telefone
WITH (security_invoker = on) AS
SELECT
  c.telefone AS telefone,
  COALESCE(SUM(f.valor_original) FILTER (WHERE f.status IN ('em_aberto','vencida')), 0)::numeric AS valor_em_aberto,
  COALESCE(SUM(f.valor_desconto) FILTER (WHERE f.status IN ('em_aberto','vencida')), 0)::numeric AS valor_com_desconto
FROM public.clientes c
LEFT JOIN public.faturas f ON f.cliente_id = c.id
GROUP BY c.telefone;

REVOKE ALL ON public.faturas_por_telefone FROM anon;
GRANT SELECT ON public.faturas_por_telefone TO authenticated;
GRANT SELECT ON public.faturas_por_telefone TO service_role;