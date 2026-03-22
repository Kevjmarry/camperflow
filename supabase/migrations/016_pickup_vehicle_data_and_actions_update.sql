-- Migration: Pickup template — vehicle_data ui_section + default items update
--
-- 1. Extends the ui_section CHECK constraint to accept 'vehicle_data'.
-- 2. Seeds 3 vehicle_data fields into every pickup template (idempotent).
-- 3. For SYSTEM pickup templates only:
--    a. Removes the 3 checklist_actions items that are no longer part of the
--       default (Fuel / fluids level confirmed, Documents + contacts provided,
--       Handover completed and customer ready to depart).
--    b. Idempotently seeds the 5 correct default checklist_actions items.
-- Non-system (company-created) pickup templates are not modified.

-- ── 1. Extend ui_section constraint ──────────────────────────────────────────

DO $$
BEGIN
  -- Drop the old constraint if it exists (it only allowed 'checklist_actions' | 'office')
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checklist_template_items_ui_section_check'
  ) THEN
    ALTER TABLE public.checklist_template_items
      DROP CONSTRAINT checklist_template_items_ui_section_check;
  END IF;

  ALTER TABLE public.checklist_template_items
    ADD CONSTRAINT checklist_template_items_ui_section_check
    CHECK (ui_section IN ('checklist_actions', 'office', 'vehicle_data'));
END;
$$;

-- ── 2. Seed vehicle_data items into every pickup template (idempotent) ────────

DO $$
DECLARE
  vehicle_fields CONSTANT TEXT[][] := ARRAY[
    ARRAY['Kilometers',  '10'],
    ARRAY['Fuel level',  '20'],
    ARRAY['AdBlue level','30']
  ];
  tpl   RECORD;
  entry TEXT[];
BEGIN
  FOR tpl IN
    SELECT id
    FROM   public.checklist_templates
    WHERE  type = 'pickup'
  LOOP
    FOREACH entry SLICE 1 IN ARRAY vehicle_fields
    LOOP
      INSERT INTO public.checklist_template_items
        (template_id, label, sort_order, section, ui_section)
      SELECT
        tpl.id,
        entry[1],
        entry[2]::INT,
        NULL,
        'vehicle_data'
      WHERE NOT EXISTS (
        SELECT 1
        FROM   public.checklist_template_items
        WHERE  template_id = tpl.id
          AND  ui_section  = 'vehicle_data'
          AND  label       = entry[1]
      );
    END LOOP;
  END LOOP;
END;
$$;

-- ── 3a. Remove unwanted default checklist_actions items from SYSTEM pickup
--        templates only.  Uses the exact English labels that the app seeded. ──

DELETE FROM public.checklist_template_items
WHERE template_id IN (
  SELECT id FROM public.checklist_templates
  WHERE  type = 'pickup' AND is_system = TRUE
)
AND ui_section = 'checklist_actions'
AND label IN (
  'Fuel / fluids level confirmed',
  'Documents + contacts provided',
  'Handover completed and customer ready to depart'
);

-- ── 3b. Seed the 5 correct checklist_actions items into SYSTEM pickup
--        templates (idempotent). ───────────────────────────────────────────────

DO $$
DECLARE
  action_items CONSTANT TEXT[][] := ARRAY[
    ARRAY['Exterior condition checked',        '100'],
    ARRAY['Interior condition checked',        '110'],
    ARRAY['Key systems explained',             '120'],
    ARRAY['Equipment present and confirmed',   '130'],
    ARRAY['Customer questions answered',       '140']
  ];
  tpl   RECORD;
  entry TEXT[];
BEGIN
  FOR tpl IN
    SELECT id
    FROM   public.checklist_templates
    WHERE  type = 'pickup' AND is_system = TRUE
  LOOP
    FOREACH entry SLICE 1 IN ARRAY action_items
    LOOP
      INSERT INTO public.checklist_template_items
        (template_id, label, sort_order, section, ui_section)
      SELECT
        tpl.id,
        entry[1],
        entry[2]::INT,
        NULL,
        'checklist_actions'
      WHERE NOT EXISTS (
        SELECT 1
        FROM   public.checklist_template_items
        WHERE  template_id = tpl.id
          AND  ui_section  = 'checklist_actions'
          AND  label       = entry[1]
      );
    END LOOP;
  END LOOP;
END;
$$;
