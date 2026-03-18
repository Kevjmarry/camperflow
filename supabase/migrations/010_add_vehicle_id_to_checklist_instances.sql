-- Add vehicle_id to checklist_instances to support vehicle-scope checklists.
-- Booking-scope checklists keep booking_id set and vehicle_id null.
-- Vehicle-scope checklists set vehicle_id and leave booking_id null.

ALTER TABLE public.checklist_instances
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_instances_vehicle_id
  ON public.checklist_instances(vehicle_id);
