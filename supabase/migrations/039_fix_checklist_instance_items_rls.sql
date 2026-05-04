-- Migration 039: Fix checklist_instance_items RLS policies
--
-- Problem: Existing SELECT/INSERT/UPDATE policies on checklist_instance_items
-- scope rows using:
--   company_id = ((auth.jwt() ->> 'company_id')::uuid)
-- 'company_id' is not a custom JWT claim → always NULL → USING never satisfied
-- → zero rows returned silently, no error thrown.
--
-- Fix: Create/replace the current_staff_company_id() helper (looks up
-- staff_profiles by auth.uid()) and rewrite all three policies to scope
-- via checklist_instances.company_id instead.

-- ── Helper: current_staff_company_id() ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_staff_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM   public.staff_profiles
  WHERE  auth_user_id = auth.uid()
  LIMIT  1
$$;

-- ── Drop existing broken policies (all known name variants) ──────────────────

DROP POLICY IF EXISTS checklist_instance_items_select ON public.checklist_instance_items;
DROP POLICY IF EXISTS checklist_instance_items_insert ON public.checklist_instance_items;
DROP POLICY IF EXISTS checklist_instance_items_update ON public.checklist_instance_items;

DROP POLICY IF EXISTS "Staff can view checklist instance items"   ON public.checklist_instance_items;
DROP POLICY IF EXISTS "Staff can select checklist instance items" ON public.checklist_instance_items;
DROP POLICY IF EXISTS "Staff can read checklist instance items"   ON public.checklist_instance_items;
DROP POLICY IF EXISTS "Staff can insert checklist instance items" ON public.checklist_instance_items;
DROP POLICY IF EXISTS "Staff can update checklist instance items" ON public.checklist_instance_items;

-- ── Recreate with current_staff_company_id() via checklist_instances ─────────

CREATE POLICY "Staff can view checklist instance items"
  ON public.checklist_instance_items
  FOR SELECT
  TO authenticated
  USING (
    instance_id IN (
      SELECT id
      FROM   public.checklist_instances
      WHERE  company_id = public.current_staff_company_id()
    )
  );

CREATE POLICY "Staff can insert checklist instance items"
  ON public.checklist_instance_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    instance_id IN (
      SELECT id
      FROM   public.checklist_instances
      WHERE  company_id = public.current_staff_company_id()
    )
  );

CREATE POLICY "Staff can update checklist instance items"
  ON public.checklist_instance_items
  FOR UPDATE
  TO authenticated
  USING (
    instance_id IN (
      SELECT id
      FROM   public.checklist_instances
      WHERE  company_id = public.current_staff_company_id()
    )
  )
  WITH CHECK (
    instance_id IN (
      SELECT id
      FROM   public.checklist_instances
      WHERE  company_id = public.current_staff_company_id()
    )
  );
