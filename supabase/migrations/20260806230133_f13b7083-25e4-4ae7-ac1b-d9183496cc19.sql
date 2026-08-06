CREATE TABLE public.acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_consultado text,
  data_hora timestamptz NOT NULL DEFAULT now(),
  pagina text NOT NULL,
  sucesso boolean NOT NULL DEFAULT false,
  valor_original numeric,
  valor_desconto numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.acessos TO authenticated;
GRANT ALL ON public.acessos TO service_role;

ALTER TABLE public.acessos ENABLE ROW LEVEL SECURITY;

CREATE POLICY acessos_admin_select ON public.acessos
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_acessos_data_hora ON public.acessos (data_hora DESC);
CREATE INDEX idx_acessos_telefone ON public.acessos (telefone_consultado);

CREATE OR REPLACE FUNCTION public.metricas_acessos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_inicio_dia timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_inicio_mes timestamptz := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  WITH base AS (
    SELECT * FROM public.acessos
  ),
  -- primeira consulta bem-sucedida de cada telefone (total)
  unicos_total AS (
    SELECT DISTINCT ON (telefone_consultado)
      telefone_consultado, valor_original, valor_desconto, data_hora
    FROM base
    WHERE sucesso AND telefone_consultado IS NOT NULL
    ORDER BY telefone_consultado, data_hora ASC
  ),
  unicos_dia AS (
    SELECT DISTINCT ON (telefone_consultado)
      telefone_consultado, valor_original, valor_desconto
    FROM base
    WHERE sucesso AND telefone_consultado IS NOT NULL AND data_hora >= v_inicio_dia
    ORDER BY telefone_consultado, data_hora ASC
  ),
  unicos_mes AS (
    SELECT DISTINCT ON (telefone_consultado)
      telefone_consultado, valor_original, valor_desconto
    FROM base
    WHERE sucesso AND telefone_consultado IS NOT NULL AND data_hora >= v_inicio_mes
    ORDER BY telefone_consultado, data_hora ASC
  )
  SELECT jsonb_build_object(
    'clientes_total',        (SELECT count(*) FROM unicos_total),
    'clientes_hoje',         (SELECT count(*) FROM unicos_dia),
    'clientes_mes',          (SELECT count(*) FROM unicos_mes),
    'valor_desconto_total',  (SELECT COALESCE(sum(valor_desconto), 0) FROM unicos_total),
    'valor_desconto_hoje',   (SELECT COALESCE(sum(valor_desconto), 0) FROM unicos_dia),
    'valor_desconto_mes',    (SELECT COALESCE(sum(valor_desconto), 0) FROM unicos_mes),
    'valor_aberto_total',    (SELECT COALESCE(sum(valor_original), 0) FROM unicos_total),
    'valor_aberto_hoje',     (SELECT COALESCE(sum(valor_original), 0) FROM unicos_dia),
    'valor_aberto_mes',      (SELECT COALESCE(sum(valor_original), 0) FROM unicos_mes),
    'acessos_hoje',          (SELECT count(*) FROM base WHERE data_hora >= v_inicio_dia),
    'acessos_mes',           (SELECT count(*) FROM base WHERE data_hora >= v_inicio_mes),
    'acessos_total',         (SELECT count(*) FROM base),
    'consultas_total',       (SELECT count(*) FROM base WHERE telefone_consultado IS NOT NULL),
    'consultas_hoje',        (SELECT count(*) FROM base WHERE telefone_consultado IS NOT NULL AND data_hora >= v_inicio_dia)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.metricas_acessos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_acessos() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.acessos;