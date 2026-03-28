ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pre_arrival_reminders_enabled  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS return_prep_reminders_enabled  boolean DEFAULT true;
