-- Add latest_odometer to vehicles
-- Stores the most recently recorded odometer reading from the handover or return checklist flow.
-- Nullable — no value until a checklist km is saved for that vehicle.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS latest_odometer INTEGER;

COMMENT ON COLUMN public.vehicles.latest_odometer IS
  'Most recent odometer reading recorded during a handover or return checklist. Updated automatically when km is saved in the checklist flow.';
