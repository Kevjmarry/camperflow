ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS map_link                text,
  ADD COLUMN IF NOT EXISTS arrival_instructions    text,
  ADD COLUMN IF NOT EXISTS parking_instructions    text,
  ADD COLUMN IF NOT EXISTS deposit_instructions    text,
  ADD COLUMN IF NOT EXISTS handover_duration       text;
