CREATE POLICY "pix_generation_requests_service_only"
ON public.pix_generation_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);