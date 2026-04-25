-- Migration 030: Add source_booking_id to vehicle_issues
--
-- When a cleaning/mechanical/prep checklist linked to booking B raises an issue,
-- we want to know which *prior* booking returned the vehicle before B's pickup.
-- source_booking_id stores the most recent prior booking for the same vehicle
-- with return_at < booking B pickup_at. Nullable; only set for prep-type checklists.

ALTER TABLE public.vehicle_issues
  ADD COLUMN IF NOT EXISTS source_booking_id UUID
    REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_issues_source_booking
  ON public.vehicle_issues (source_booking_id)
  WHERE source_booking_id IS NOT NULL;
