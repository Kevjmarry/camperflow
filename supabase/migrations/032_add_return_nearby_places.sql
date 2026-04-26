ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS return_nearby_places JSONB;
