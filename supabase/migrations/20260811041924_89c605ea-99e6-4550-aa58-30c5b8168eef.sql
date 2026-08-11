CREATE OR REPLACE FUNCTION public.avancar_ponteiro_gateway(p_total integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual integer;
BEGIN
  IF p_total IS NULL OR p_total <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.roteamento_config
  SET ponteiro = (ponteiro + 1) % p_total,
      updated_at = now()
  WHERE id = true
  RETURNING (ponteiro - 1 + p_total) % p_total INTO v_atual;

  RETURN COALESCE(v_atual, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.avancar_ponteiro_gateway(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.avancar_ponteiro_gateway(integer) FROM anon;
REVOKE ALL ON FUNCTION public.avancar_ponteiro_gateway(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.avancar_ponteiro_gateway(integer) TO service_role;