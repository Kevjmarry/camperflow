-- Migration 044: Provision default checklist templates function
--
-- Creates public.provision_default_checklist_templates(p_company_id UUID)
-- which inserts the canonical set of system templates + items for a company.
--
-- Idempotent: each template block is guarded by NOT EXISTS on
-- (company_id, scope, type, is_system=TRUE).
-- Re-running on a company that already has templates is a no-op.
--
-- Called from app/api/signup/route.ts after company + staff creation.
--
-- Item data is derived from:
--   migrations 015 (office items), 016 (vehicle_data + checklist_actions),
--   017 (input_type corrections), 018 (options for dropdown items),
--   040 (return template ui_section taxonomy).

CREATE OR REPLACE FUNCTION public.provision_default_checklist_templates(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN

  -- ── 1. Pickup ─────────────────────────────────────────────────────────────────
  -- Full item set: vehicle_data + checklist_actions + office.
  -- Canonical items from migrations 015/016/017/018.

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_templates
    WHERE  company_id = p_company_id
      AND  scope      = 'booking'
      AND  type       = 'pickup'
      AND  is_system  = TRUE
  ) THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Pickup', 'booking', 'pickup', TRUE, TRUE)
    RETURNING id INTO v_id;

    INSERT INTO public.checklist_template_items
      (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
    VALUES
      -- vehicle_data block (sort 10–30, position 1–3)
      (v_id, 'Kilometers',   10, 1, NULL, 'vehicle_data', 'number',   FALSE, NULL),
      (v_id, 'Fuel level',   20, 2, NULL, 'vehicle_data', 'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
      (v_id, 'AdBlue level', 30, 3, NULL, 'vehicle_data', 'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
      -- checklist_actions block (sort 100–140, position 4–8)
      (v_id, 'Exterior condition checked',      100, 4, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      (v_id, 'Interior condition checked',      110, 5, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      (v_id, 'Key systems explained',           120, 6, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      (v_id, 'Equipment present and confirmed', 130, 7, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      (v_id, 'Customer questions answered',     140, 8, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      -- office block (sort 200–240, position 9–13)
      (v_id, 'Contract signed',       200,  9, NULL, 'office', 'checkbox', FALSE, NULL),
      (v_id, 'ID verified',           210, 10, NULL, 'office', 'checkbox', FALSE, NULL),
      (v_id, 'Deposit collected',     220, 11, NULL, 'office', 'checkbox', FALSE, NULL),
      (v_id, 'Documents handed over', 230, 12, NULL, 'office', 'checkbox', FALSE, NULL),
      (v_id, 'Keys handed over',      240, 13, NULL, 'office', 'checkbox', FALSE, NULL);
  END IF;

  -- ── 2. Return ─────────────────────────────────────────────────────────────────
  -- vehicle_data + checklist_actions + return_close_out + deposit_status.
  -- ui_section taxonomy from migration 040.

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_templates
    WHERE  company_id = p_company_id
      AND  scope      = 'booking'
      AND  type       = 'return'
      AND  is_system  = TRUE
  ) THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Return', 'booking', 'return', TRUE, TRUE)
    RETURNING id INTO v_id;

    INSERT INTO public.checklist_template_items
      (template_id, label, sort_order, position, section, ui_section, input_type, required, options)
    VALUES
      -- vehicle_data block (sort 10–30, position 1–3)
      (v_id, 'Kilometers',   10, 1, NULL, 'vehicle_data', 'number',   FALSE, NULL),
      (v_id, 'Fuel level',   20, 2, NULL, 'vehicle_data', 'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
      (v_id, 'AdBlue level', 30, 3, NULL, 'vehicle_data', 'dropdown', FALSE, '["Full","3/4","1/2","1/4","Empty"]'::jsonb),
      -- checklist_actions block (sort 100–120, position 4–6)
      (v_id, 'Exterior checked for new damage', 100, 4, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      (v_id, 'Interior checked for damage',     110, 5, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      (v_id, 'Equipment returned and verified', 120, 6, NULL, 'checklist_actions', 'checkbox', FALSE, NULL),
      -- return_close_out block (sort 300–320, position 7–9)
      (v_id, 'Keys received',      300, 7, NULL, 'return_close_out', 'checkbox', FALSE, NULL),
      (v_id, 'Documents received', 310, 8, NULL, 'return_close_out', 'checkbox', FALSE, NULL),
      (v_id, 'Contract closed',    320, 9, NULL, 'return_close_out', 'checkbox', FALSE, NULL),
      -- deposit_status block (sort 400, position 10)
      (v_id, 'Deposit decision made', 400, 10, NULL, 'deposit_status', 'checkbox', FALSE, NULL);
  END IF;

  -- ── 3. Cleaning ───────────────────────────────────────────────────────────────
  -- Template row only — items are company-specific.

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_templates
    WHERE  company_id = p_company_id
      AND  scope      = 'booking'
      AND  type       = 'cleaning'
      AND  is_system  = TRUE
  ) THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Cleaning', 'booking', 'cleaning', TRUE, TRUE);
  END IF;

  -- ── 4. Mechanical ─────────────────────────────────────────────────────────────

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_templates
    WHERE  company_id = p_company_id
      AND  scope      = 'booking'
      AND  type       = 'mechanical'
      AND  is_system  = TRUE
  ) THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Mechanical', 'booking', 'mechanical', TRUE, TRUE);
  END IF;

  -- ── 5. Pre-Season (vehicle) ───────────────────────────────────────────────────

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_templates
    WHERE  company_id = p_company_id
      AND  scope      = 'vehicle'
      AND  type       = 'pre_season'
      AND  is_system  = TRUE
  ) THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Pre-Season', 'vehicle', 'pre_season', TRUE, TRUE);
  END IF;

  -- ── 6. Post-Season (vehicle) ──────────────────────────────────────────────────

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_templates
    WHERE  company_id = p_company_id
      AND  scope      = 'vehicle'
      AND  type       = 'post_season'
      AND  is_system  = TRUE
  ) THEN
    INSERT INTO public.checklist_templates
      (id, company_id, name, scope, type, active, is_system)
    VALUES
      (gen_random_uuid(), p_company_id, 'Post-Season', 'vehicle', 'post_season', TRUE, TRUE);
  END IF;

END;
$$;

-- Allow the authenticated role (and service role) to call this function.
GRANT EXECUTE ON FUNCTION public.provision_default_checklist_templates(UUID) TO authenticated;
