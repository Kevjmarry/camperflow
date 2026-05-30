ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS widget_show_header     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS widget_header_title    TEXT    DEFAULT 'Vehicle Availability',
  ADD COLUMN IF NOT EXISTS widget_header_subtitle TEXT    DEFAULT 'Select dates to request availability';
