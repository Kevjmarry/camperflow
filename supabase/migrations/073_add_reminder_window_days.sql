ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pre_arrival_days_before_pickup  INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS return_prep_days_before_return  INTEGER NOT NULL DEFAULT 3;
