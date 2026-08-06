-- Índices para busca rápida com grandes volumes
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON public.clientes (telefone);
CREATE INDEX IF NOT EXISTS idx_clientes_nome_lower ON public.clientes (lower(nome));
CREATE INDEX IF NOT EXISTS idx_faturas_cliente_id ON public.faturas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_faturas_status ON public.faturas (status);

-- Garante unicidade do telefone (necessário para o upsert em lote)
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_telefone ON public.clientes (telefone);

CREATE OR REPLACE FUNCTION public.importar_faturas_lote(
  p_registros jsonb,
  p_vencimento date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clientes_afetados int := 0;
  v_faturas_criadas int := 0;
  v_faturas_atualizadas int := 0;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem importar faturas.';
  END IF;

  IF p_vencimento IS NULL THEN
    RAISE EXCEPTION 'Informe a data de vencimento.';
  END IF;

  CREATE TEMP TABLE tmp_import ON COMMIT DROP AS
  SELECT DISTINCT ON (telefone)
    telefone,
    nome,
    email,
    documento,
    observacoes,
    valor_original,
    valor_desconto
  FROM (
    SELECT
      regexp_replace(COALESCE(r->>'telefone',''), '\D', '', 'g') AS telefone,
      NULLIF(btrim(COALESCE(r->>'nome','')), '')                 AS nome,
      NULLIF(btrim(COALESCE(r->>'email','')), '')                AS email,
      NULLIF(btrim(COALESCE(r->>'documento','')), '')            AS documento,
      NULLIF(btrim(COALESCE(r->>'observacoes','')), '')          AS observacoes,
      COALESCE((r->>'valor_original')::numeric, 0)               AS valor_original,
      COALESCE((r->>'valor_desconto')::numeric, 0)               AS valor_desconto
    FROM jsonb_array_elements(p_registros) AS r
  ) s
  WHERE length(s.telefone) BETWEEN 10 AND 13;

  WITH upserted AS (
    INSERT INTO public.clientes (nome, telefone, email, documento, observacoes)
    SELECT COALESCE(nome, telefone), telefone, email, documento, observacoes
    FROM tmp_import
    ON CONFLICT (telefone) DO UPDATE SET
      nome        = COALESCE(EXCLUDED.nome, public.clientes.nome),
      email       = COALESCE(EXCLUDED.email, public.clientes.email),
      documento   = COALESCE(EXCLUDED.documento, public.clientes.documento),
      observacoes = COALESCE(EXCLUDED.observacoes, public.clientes.observacoes),
      updated_at  = now()
    RETURNING id, telefone
  )
  SELECT count(*) INTO v_clientes_afetados FROM upserted;

  CREATE TEMP TABLE tmp_alvo ON COMMIT DROP AS
  SELECT
    c.id AS cliente_id,
    GREATEST(t.valor_original, t.valor_desconto) AS valor_original,
    t.valor_desconto,
    (
      SELECT f.id FROM public.faturas f
      WHERE f.cliente_id = c.id
        AND f.status IN ('em_aberto','vencida','expirada','falhou','em_processamento')
      ORDER BY f.vencimento DESC
      LIMIT 1
    ) AS fatura_id
  FROM tmp_import t
  JOIN public.clientes c ON c.telefone = t.telefone
  WHERE t.valor_original > 0 OR t.valor_desconto > 0;

  WITH atualizadas AS (
    UPDATE public.faturas f
    SET valor_original = a.valor_original,
        valor_desconto = a.valor_desconto,
        vencimento     = p_vencimento,
        status         = 'em_aberto',
        updated_at     = now()
    FROM tmp_alvo a
    WHERE f.id = a.fatura_id
    RETURNING f.id
  )
  SELECT count(*) INTO v_faturas_atualizadas FROM atualizadas;

  WITH criadas AS (
    INSERT INTO public.faturas (cliente_id, descricao, valor_original, valor_desconto, vencimento, status)
    SELECT a.cliente_id, 'Fatura importada', a.valor_original, a.valor_desconto, p_vencimento, 'em_aberto'
    FROM tmp_alvo a
    WHERE a.fatura_id IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_faturas_criadas FROM criadas;

  DROP TABLE IF EXISTS tmp_import;
  DROP TABLE IF EXISTS tmp_alvo;

  RETURN jsonb_build_object(
    'clientes', v_clientes_afetados,
    'faturas_criadas', v_faturas_criadas,
    'faturas_atualizadas', v_faturas_atualizadas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.importar_faturas_lote(jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_faturas_lote(jsonb, date) TO authenticated, service_role;