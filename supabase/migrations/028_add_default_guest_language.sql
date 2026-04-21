ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_guest_language TEXT DEFAULT NULL
  CONSTRAINT company_settings_default_guest_language_check
    CHECK (default_guest_language IS NULL OR default_guest_language IN ('en', 'de'));
