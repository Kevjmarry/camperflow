-- Add admin close-backlog audit fields to bookings.
-- Mirrors the pattern in migration 012 (revert fields).
-- Written when an admin uses the "Close stale backlog" action.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS closed_reason TEXT;
