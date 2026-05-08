-- Migration 040: Reclassify legacy return-template deposit items
--
-- Root cause: migration 015 defaulted all pre-existing items to
-- ui_section='checklist_actions'. When deposit_status was introduced,
-- only newly-created items received it; older return templates retained
-- checklist_actions on every deposit-related row.
--
-- Fix: expand the constraint to recognise the full set of valid values
-- (evidence, return_close_out, deposit_status were added out-of-band),
-- then reclassify deposit-label items in return templates.

BEGIN;

-- ── 1. Expand constraint ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname = 'checklist_template_items_ui_section_check'
  ) THEN
    ALTER TABLE public.checklist_template_items
      DROP CONSTRAINT checklist_template_items_ui_section_check;
  END IF;

  ALTER TABLE public.checklist_template_items
    ADD CONSTRAINT checklist_template_items_ui_section_check
    CHECK (ui_section IN (
      'checklist_actions',
      'office',
      'vehicle_data',
      'evidence',
      'return_close_out',
      'deposit_status'
    ));
END;
$$;

-- ── 2. Preview ─────────────────────────────────────────────────────────────────
--
-- Run this SELECT first to review exactly which rows will be reclassified.

SELECT
  ti.id,
  t.id            AS template_id,
  t.name          AS template_name,
  ti.label,
  ti.section,
  ti.ui_section   AS current_ui_section
FROM   public.checklist_template_items ti
JOIN   public.checklist_templates      t  ON t.id = ti.template_id
WHERE  t.type          = 'return'
  AND  ti.ui_section   = 'checklist_actions'
  AND  lower(ti.label) LIKE '%deposit%'
ORDER  BY t.name, ti.sort_order;

-- ── 3. Update ──────────────────────────────────────────────────────────────────

UPDATE public.checklist_template_items ti
SET    ui_section = 'deposit_status'
FROM   public.checklist_templates t
WHERE  t.id            = ti.template_id
  AND  t.type          = 'return'
  AND  ti.ui_section   = 'checklist_actions'
  AND  lower(ti.label) LIKE '%deposit%';

-- ── 4. Verification ────────────────────────────────────────────────────────────
--
-- Should return 0 rows. Any row here is a missed reclassification.

SELECT
  ti.id,
  t.name        AS template_name,
  ti.label,
  ti.ui_section
FROM   public.checklist_template_items ti
JOIN   public.checklist_templates      t  ON t.id = ti.template_id
WHERE  t.type          = 'return'
  AND  ti.ui_section   = 'checklist_actions'
  AND  lower(ti.label) LIKE '%deposit%';

COMMIT;
