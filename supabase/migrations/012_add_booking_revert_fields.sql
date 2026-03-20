-- Add revert audit fields to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reverted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reverted_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revert_reason TEXT;
