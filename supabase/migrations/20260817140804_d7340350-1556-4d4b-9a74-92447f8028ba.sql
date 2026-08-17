-- Hardening: ensure anon has no access to acessos (realtime) or pagamentos
REVOKE ALL ON public.acessos FROM anon;
REVOKE ALL ON public.pagamentos FROM anon;

GRANT SELECT ON public.acessos TO authenticated;
GRANT ALL ON public.acessos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagamentos TO authenticated;
GRANT ALL ON public.pagamentos TO service_role;

-- Restrictive guard: only admins (or service role, which bypasses RLS) may write payments
DROP POLICY IF EXISTS pagamentos_admin_only_writes ON public.pagamentos;
CREATE POLICY pagamentos_admin_only_writes
ON public.pagamentos
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Restrictive guard: acessos readable only by admins
DROP POLICY IF EXISTS acessos_admin_only ON public.acessos;
CREATE POLICY acessos_admin_only
ON public.acessos
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));