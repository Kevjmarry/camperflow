ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS final_payment_urgent_days integer DEFAULT 14;
