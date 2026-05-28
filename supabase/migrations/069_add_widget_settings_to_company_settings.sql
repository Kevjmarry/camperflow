-- Add availability widget configuration columns to company_settings.
-- widget_public_enabled: whether the public embed is live
-- widget_vehicle_ids: which vehicles are shown in the widget (null = all)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS widget_public_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS widget_vehicle_ids    uuid[]  DEFAULT NULL;
