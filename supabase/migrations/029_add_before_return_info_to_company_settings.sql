ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS before_return_info TEXT;
