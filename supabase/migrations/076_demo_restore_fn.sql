-- Migration 076: Remove unsafe demo_restore_alpine_clean function
--
-- The original version of this migration created demo_restore_alpine_clean(),
-- which deleted vehicles in one transaction and relied on route-level inserts
-- in a separate transaction to put them back.  That split left a window where
-- Alpine had zero vehicles if the insert phase failed.
--
-- The restore logic now lives entirely in the route handler, which upserts
-- vehicles (never deletes them) and deletes only operational child data.
-- This function is therefore not needed.

DROP FUNCTION IF EXISTS public.demo_restore_alpine_clean(uuid);
