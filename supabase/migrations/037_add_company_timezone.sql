ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS company_timezone TEXT NOT NULL DEFAULT 'Europe/Bratislava';
