ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS pix_valor_centavos integer;

UPDATE public.faturas
SET pix_txid = NULL, pix_copia_cola = NULL, pix_valor_centavos = NULL
WHERE status <> 'paga';