-- Migration: Add options column to checklist_template_items
--
-- Stores dropdown option labels for items with input_type = 'dropdown'.
-- Nullable — null means "use the runtime default list".
-- Re-running is safe: ADD COLUMN IF NOT EXISTS + UPDATE only where null.

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS options JSONB;

-- Seed default options for existing Fuel / AdBlue vehicle_data items
-- so they carry the same options the runtime currently hardcodes.
UPDATE public.checklist_template_items
SET options = '["Full", "3/4", "1/2", "1/4", "Empty"]'::jsonb
WHERE ui_section = 'vehicle_data'
  AND label IN ('Fuel level', 'AdBlue level')
  AND options IS NULL;
