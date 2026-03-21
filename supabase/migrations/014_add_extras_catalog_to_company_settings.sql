ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS extras_catalog jsonb DEFAULT NULL;
