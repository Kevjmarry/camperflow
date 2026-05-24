-- Migration 062: Add block_type to vehicle_blocks
--
-- Adds a typed classification column so callers can distinguish why a block
-- exists without parsing free-text label or opaque source_metadata JSON.
--
-- Valid values:
--   unavailable   — generic / unclassified unavailability (import default)
--   maintenance   — service, repair, or mechanical work
--   work          — operational work (cleaning, prep, transfer, etc.)
--   owner_use     — owner / personal reservation
--   manual_note   — staff-entered note that blocks the calendar
--   external_hold — hold placed by an external booking platform
--
-- Backfill heuristic: pattern-match label first, then fall through to
-- source_metadata->>'type' if label gives no signal.  Any row that still
-- can't be classified defaults to 'unavailable' so the CHECK never blocks
-- existing data.

-- ── 1. Column ─────────────────────────────────────────────────────────────────
ALTER TABLE public.vehicle_blocks
  ADD COLUMN IF NOT EXISTS block_type TEXT;

-- ── 2. Backfill ───────────────────────────────────────────────────────────────
UPDATE public.vehicle_blocks
SET block_type = CASE
  -- label-based signals (case-insensitive, most-specific first)
  WHEN label ILIKE '%maintenance%'
    OR label ILIKE '%service%'
    OR label ILIKE '%repair%'   THEN 'maintenance'

  WHEN label ILIKE '%owner%'
    OR label ILIKE '%personal%' THEN 'owner_use'

  WHEN label ILIKE '%hold%'
    OR label ILIKE '%external%' THEN 'external_hold'

  WHEN label ILIKE '%note%'     THEN 'manual_note'

  WHEN label ILIKE '%work%'
    OR label ILIKE '%clean%'
    OR label ILIKE '%prep%'     THEN 'work'

  -- source_metadata->>'type' fallback
  WHEN source_metadata->>'type' ILIKE '%maintenance%' THEN 'maintenance'
  WHEN source_metadata->>'type' ILIKE '%owner%'       THEN 'owner_use'
  WHEN source_metadata->>'type' ILIKE '%hold%'        THEN 'external_hold'
  WHEN source_metadata->>'type' ILIKE '%work%'        THEN 'work'
  WHEN source_metadata->>'type' ILIKE '%note%'        THEN 'manual_note'

  ELSE 'unavailable'
END
WHERE block_type IS NULL;

-- ── 3. CHECK constraint (idempotent) ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema    = 'public'
      AND  table_name      = 'vehicle_blocks'
      AND  constraint_name = 'vehicle_blocks_block_type_check'
  ) THEN
    ALTER TABLE public.vehicle_blocks
      ADD CONSTRAINT vehicle_blocks_block_type_check
        CHECK (block_type IN (
          'unavailable',
          'maintenance',
          'work',
          'owner_use',
          'manual_note',
          'external_hold'
        ));
  END IF;
END $$;
