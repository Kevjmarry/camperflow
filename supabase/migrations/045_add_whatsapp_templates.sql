ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pre_arrival_whatsapp_template    text,
  ADD COLUMN IF NOT EXISTS return_prep_whatsapp_template    text,
  ADD COLUMN IF NOT EXISTS review_request_whatsapp_template text;
