-- Migration 056: Add guest_access_token to bookings for Phase 1 guest link hardening.
--
-- A random UUID is added as a second factor for guest links. Existing rows get
-- a token generated at migration time via gen_random_uuid(). The RPC and all
-- existing guest links are NOT changed in this migration — enforcement is Phase 3.

ALTER TABLE public.bookings
  ADD COLUMN guest_access_token UUID NOT NULL DEFAULT gen_random_uuid();
