-- Migration 044: Provision default checklist templates function
--
-- Creates public.provision_default_checklist_templates(p_company_id UUID)
-- which inserts the canonical set of system templates + items for a company.
--
-- Idempotent at both the template level and the item level:
--   - Templates are looked up by (company_id, scope, type, is_system=TRUE);
--     a new template is only inserted when none exists.
--   - Items are inserted only when (template_id, label) is not already present,
--     so re-running adds missing canonical items without touching existing rows.
--
-- Called from app/api/signup/route.ts after company + staff creation.
--
-- Item counts mirror Epic Vans system defaults:
--   cleaning 7, mechanical 6, pickup 13, return 16, pre_season 7, post_season 7.

CREATE OR REPLACE FUNCTION public.provision_default_checklist_templates(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN

  -- ── 1. Pickup ─────────────────────────────────────────────────────────────────

  SELECT id INTO v_id FROM public.checklist_templates
  WHERE  company_id = p_company_id
    AND  scope      = 'booking'
    AND  type       = 'pickup'
    AND  is_system  = TRUE
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Pickup Checklist', 'booking', 'pickup', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.checklist_template_items
    (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
  SELECT v_id, v.label, v.sort_order, v.position, v.section, v.ui_section, v.input_type, v.required, v.options
  FROM (VALUES
    -- vehicle_data block (sort 10–30, position 1–3)
    ('Kilometers',                        10,  1, NULL::text, 'vehicle_data',      'number',   FALSE, NULL::jsonb),
    ('Fuel level',                        20,  2, NULL,       'vehicle_data',      'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
    ('AdBlue level',                      30,  3, NULL,       'vehicle_data',      'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
    -- checklist_actions block (sort 100–140, position 4–8)
    ('Exterior condition checked',       100,  4, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Interior condition checked',       110,  5, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Key systems explained',            120,  6, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Equipment present and confirmed',  130,  7, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Customer questions answered',      140,  8, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    -- office block (sort 200–240, position 9–13)
    ('Contract signed',                  200,  9, NULL,       'office',            'checkbox', FALSE, NULL),
    ('ID verified',                      210, 10, NULL,       'office',            'checkbox', FALSE, NULL),
    ('Deposit collected',                220, 11, NULL,       'office',            'checkbox', FALSE, NULL),
    ('Documents handed over',            230, 12, NULL,       'office',            'checkbox', FALSE, NULL),
    ('Keys handed over',                 240, 13, NULL,       'office',            'checkbox', FALSE, NULL)
  ) AS v(label, sort_order, position, section, ui_section, input_type, required, options)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items i
    WHERE i.template_id = v_id AND i.label = v.label
  );

  -- ── 2. Return ─────────────────────────────────────────────────────────────────

  SELECT id INTO v_id FROM public.checklist_templates
  WHERE  company_id = p_company_id
    AND  scope      = 'booking'
    AND  type       = 'return'
    AND  is_system  = TRUE
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Return Checklist', 'booking', 'return', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.checklist_template_items
    (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
  SELECT v_id, v.label, v.sort_order, v.position, v.section, v.ui_section, v.input_type, v.required, v.options
  FROM (VALUES
    -- vehicle_data block (sort 10–30, position 1–3)
    ('Kilometers',                               10,  1, NULL::text, 'vehicle_data',      'number',   FALSE, NULL::jsonb),
    ('Fuel level',                               20,  2, NULL,       'vehicle_data',      'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
    ('AdBlue level',                             30,  3, NULL,       'vehicle_data',      'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
    -- checklist_actions block (sort 100–160, position 4–10)
    ('Exterior checked for new damage',         100,  4, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Awning, bike rack, and bumper checked',   110,  5, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Exterior cleaned',                         120,  6, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Interior cleaned and checked for damage', 130,  7, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Cassette toilet and grey water emptied',  140,  8, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Equipment returned and verified',         150,  9, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Return completed and customer signed off',160, 10, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    -- return_close_out block (sort 300–320, position 11–13)
    ('Keys received',                           300, 11, NULL,       'return_close_out',  'checkbox', FALSE, NULL),
    ('Documents received',                      310, 12, NULL,       'return_close_out',  'checkbox', FALSE, NULL),
    ('Contract closed',                         320, 13, NULL,       'return_close_out',  'checkbox', FALSE, NULL),
    -- deposit_status block (sort 400–420, position 14–16)
    ('Returned to customer',                    400, 14, NULL,       'deposit_status',    'checkbox', FALSE, NULL),
    ('Pending admin return',                    410, 15, NULL,       'deposit_status',    'checkbox', FALSE, NULL),
    ('Held for damage',                         420, 16, NULL,       'deposit_status',    'checkbox', FALSE, NULL)
  ) AS v(label, sort_order, position, section, ui_section, input_type, required, options)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items i
    WHERE i.template_id = v_id AND i.label = v.label
  );

  -- ── 3. Cleaning ───────────────────────────────────────────────────────────────

  SELECT id INTO v_id FROM public.checklist_templates
  WHERE  company_id = p_company_id
    AND  scope      = 'booking'
    AND  type       = 'cleaning'
    AND  is_system  = TRUE
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Cleaning Checklist', 'booking', 'cleaning', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.checklist_template_items
    (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
  SELECT v_id, v.label, v.sort_order, v.position, v.section, v.ui_section, v.input_type, v.required, v.options
  FROM (VALUES
    ('Interior cleaned (living + cab)',               10, 1, NULL::text, 'checklist_actions', 'checkbox', FALSE, NULL::jsonb),
    ('Kitchen cleaned',                               20, 2, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Bathroom cleaned',                              30, 3, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Waste emptied (bins, toilet, water if needed)', 40, 4, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Linen handled (removed / replaced)',            50, 5, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Final visual check complete',                   60, 6, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('New item',                                      70, 7, NULL,       'checklist_actions', 'checkbox', FALSE, NULL)
  ) AS v(label, sort_order, position, section, ui_section, input_type, required, options)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items i
    WHERE i.template_id = v_id AND i.label = v.label
  );

  -- ── 4. Mechanical ─────────────────────────────────────────────────────────────

  SELECT id INTO v_id FROM public.checklist_templates
  WHERE  company_id = p_company_id
    AND  scope      = 'booking'
    AND  type       = 'mechanical'
    AND  is_system  = TRUE
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Mechanical Checklist', 'booking', 'mechanical', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.checklist_template_items
    (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
  SELECT v_id, v.label, v.sort_order, v.position, v.section, v.ui_section, v.input_type, v.required, v.options
  FROM (VALUES
    ('Vehicle safe to drive (tyres, fluids, warnings checked)', 10, 1, NULL::text, 'checklist_actions', 'checkbox', FALSE, NULL::jsonb),
    ('Lights and signals working',                              20, 2, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Battery / electrical systems OK',                         30, 3, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Water / gas systems functional',                          40, 4, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('No active warning lights or issues',                      50, 5, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Vehicle ready for next rental',                           60, 6, NULL,       'checklist_actions', 'checkbox', FALSE, NULL)
  ) AS v(label, sort_order, position, section, ui_section, input_type, required, options)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items i
    WHERE i.template_id = v_id AND i.label = v.label
  );

  -- ── 5. Pre-Season (vehicle) ───────────────────────────────────────────────────

  SELECT id INTO v_id FROM public.checklist_templates
  WHERE  company_id = p_company_id
    AND  scope      = 'vehicle'
    AND  type       = 'pre_season'
    AND  is_system  = TRUE
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Pre-Season Checklist', 'vehicle', 'pre_season', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.checklist_template_items
    (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
  SELECT v_id, v.label, v.sort_order, v.position, v.section, v.ui_section, v.input_type, v.required, v.options
  FROM (VALUES
    ('Check battery condition',               10, 1, NULL::text, 'checklist_actions', 'checkbox', FALSE, NULL::jsonb),
    ('Inspect tyres and pressure',            20, 2, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Test water system (pump, leaks)',        30, 3, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Check gas system and connections',       40, 4, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Test appliances (fridge, hob, heating)', 50, 5, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Inspect seals and exterior',            60, 6, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Check electrical system (12V / 230V)',  70, 7, NULL,       'checklist_actions', 'checkbox', FALSE, NULL)
  ) AS v(label, sort_order, position, section, ui_section, input_type, required, options)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items i
    WHERE i.template_id = v_id AND i.label = v.label
  );

  -- ── 6. Post-Season (vehicle) ──────────────────────────────────────────────────

  SELECT id INTO v_id FROM public.checklist_templates
  WHERE  company_id = p_company_id
    AND  scope      = 'vehicle'
    AND  type       = 'post_season'
    AND  is_system  = TRUE
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Post-Season Checklist', 'vehicle', 'post_season', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.checklist_template_items
    (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
  SELECT v_id, v.label, v.sort_order, v.position, v.section, v.ui_section, v.input_type, v.required, v.options
  FROM (VALUES
    ('Deep clean interior and bathroom',          10, 1, NULL::text, 'checklist_actions', 'checkbox', FALSE, NULL::jsonb),
    ('Empty and clean water systems',             20, 2, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Inspect for damage needing repair',         30, 3, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Check tyres and note wear',                 40, 4, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Check battery condition / storage charge',  50, 5, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Remove food and consumables',               60, 6, NULL,       'checklist_actions', 'checkbox', FALSE, NULL),
    ('Inspect seals and exterior before storage', 70, 7, NULL,       'checklist_actions', 'checkbox', FALSE, NULL)
  ) AS v(label, sort_order, position, section, ui_section, input_type, required, options)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items i
    WHERE i.template_id = v_id AND i.label = v.label
  );

END;
$$;

-- Allow the authenticated role (and service role) to call this function.
GRANT EXECUTE ON FUNCTION public.provision_default_checklist_templates(UUID) TO authenticated;
