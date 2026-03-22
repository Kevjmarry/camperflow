-- Migration: Set correct input_type for vehicle_data template items
--
-- Migration 016 seeded Kilometers, Fuel level, and AdBlue level without an
-- explicit input_type, so they defaulted to 'checkbox'.
--
-- Correct types:
--   Kilometers  → number   (numeric entry field)
--   Fuel level  → dropdown (Full / 3/4 / Half / 1/4 / Empty)
--   AdBlue level → dropdown
--
-- Safe to re-run: UPDATE is idempotent.

UPDATE public.checklist_template_items
SET input_type = 'number'
WHERE ui_section = 'vehicle_data'
  AND label = 'Kilometers';

UPDATE public.checklist_template_items
SET input_type = 'dropdown'
WHERE ui_section = 'vehicle_data'
  AND label IN ('Fuel level', 'AdBlue level');
