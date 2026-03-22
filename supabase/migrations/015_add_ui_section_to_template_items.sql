-- Migration: Add ui_section to checklist_template_items
--
-- Allows handover templates to distinguish between items that appear in the
-- "Checklist Actions" audit block vs. the "Office" confirmations block.
--
-- Existing rows default to 'checklist_actions' — no existing behaviour changes.
-- The 5 standard office items are seeded into every handover template.
-- This is idempotent: re-running will not produce duplicate rows.
-- The existing boolean office columns on checklist_instances are NOT touched.

-- ── 1. Add column ─────────────────────────────────────────────────────────────

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS ui_section TEXT NOT NULL DEFAULT 'checklist_actions';

-- Add the constraint only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'checklist_template_items_ui_section_check'
  ) THEN
    ALTER TABLE public.checklist_template_items
      ADD CONSTRAINT checklist_template_items_ui_section_check
      CHECK (ui_section IN ('checklist_actions', 'office'));
  END IF;
END;
$$;

-- ── 2. Seed 5 office items into every handover template (idempotent) ──────────

DO $$
DECLARE
  office_items CONSTANT TEXT[][] := ARRAY[
    ARRAY['Contract signed',        '10'],
    ARRAY['ID verified',            '20'],
    ARRAY['Deposit collected',      '30'],
    ARRAY['Documents handed over',  '40'],
    ARRAY['Keys handed over',       '50']
  ];
  tpl   RECORD;
  entry TEXT[];
BEGIN
  FOR tpl IN
    SELECT id
    FROM   public.checklist_templates
    WHERE  checklist_type = 'handover'
  LOOP
    FOREACH entry SLICE 1 IN ARRAY office_items
    LOOP
      INSERT INTO public.checklist_template_items
        (template_id, label, sort_order, section, ui_section)
      SELECT
        tpl.id,
        entry[1],
        entry[2]::INT,
        NULL,
        'office'
      WHERE NOT EXISTS (
        SELECT 1
        FROM   public.checklist_template_items
        WHERE  template_id = tpl.id
          AND  ui_section  = 'office'
          AND  label       = entry[1]
      );
    END LOOP;
  END LOOP;
END;
$$;
