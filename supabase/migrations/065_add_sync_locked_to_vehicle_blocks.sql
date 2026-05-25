-- Migration 065: Add sync_locked to vehicle_blocks
--
-- sync_locked = true marks a block that has been manually edited via the
-- CamperFlow UI after being imported. The import upsert skips overwriting
-- these rows so user edits survive future CSV/iCal syncs.
-- The block PATCH API always sets sync_locked = true on save.

ALTER TABLE public.vehicle_blocks
  ADD COLUMN IF NOT EXISTS sync_locked boolean NOT NULL DEFAULT false;
