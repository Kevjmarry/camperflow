-- Add staff-managed metadata columns to bookings.
-- source_metadata (already present) is owned by the import pipeline and may be
-- overwritten on every re-import.  staff_metadata and internal_notes are owned
-- exclusively by staff via the detail UI and are never touched by imports.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS staff_metadata JSONB,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;
