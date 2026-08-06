ALTER TYPE public.fatura_status ADD VALUE IF NOT EXISTS 'expirada';
ALTER TYPE public.fatura_status ADD VALUE IF NOT EXISTS 'falhou';
ALTER TYPE public.fatura_status ADD VALUE IF NOT EXISTS 'em_processamento';