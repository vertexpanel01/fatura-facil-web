CREATE TABLE public.pix_generation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text NOT NULL UNIQUE,
  fatura_id uuid NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'concluida', 'falhou')),
  transacao_id uuid REFERENCES public.transacoes_pix(id) ON DELETE SET NULL,
  erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.pix_generation_requests TO service_role;

ALTER TABLE public.pix_generation_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_pix_generation_requests_fatura_created
  ON public.pix_generation_requests (fatura_id, created_at DESC);

CREATE TRIGGER trg_pix_generation_requests_updated
  BEFORE UPDATE ON public.pix_generation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();