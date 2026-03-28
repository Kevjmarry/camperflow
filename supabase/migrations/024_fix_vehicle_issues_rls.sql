-- Migration 024: Fix vehicle_issues RLS policies
--
-- Problem: Existing policies (vehicle_issues_select, vehicle_issues_insert,
-- vehicle_issues_update) scope rows using:
--   company_id = ((auth.jwt() ->> 'company_id')::uuid)
-- 'company_id' is not a custom JWT claim → always NULL → USING never satisfied
-- → zero rows returned silently, no error thrown.
--
-- Fix: Replace all policies with subquery-based scoping via staff_profiles +
-- vehicles, matching the pattern used by every operations loader.
--
-- Scope rule: a staff user may access a vehicle_issues row when the row's
-- vehicle_id belongs to a vehicle whose company_id matches the user's own
-- company_id as recorded in staff_profiles.

-- ── Drop real existing policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS vehicle_issues_select ON public.vehicle_issues;
DROP POLICY IF EXISTS vehicle_issues_insert ON public.vehicle_issues;
DROP POLICY IF EXISTS vehicle_issues_update ON public.vehicle_issues;

-- ── Drop any older human-readable aliases (safe no-ops if absent) ─────────────

DROP POLICY IF EXISTS "Staff can view vehicle issues"   ON public.vehicle_issues;
DROP POLICY IF EXISTS "Staff can select vehicle issues" ON public.vehicle_issues;
DROP POLICY IF EXISTS "Staff can read vehicle issues"   ON public.vehicle_issues;
DROP POLICY IF EXISTS "Staff can insert vehicle issues" ON public.vehicle_issues;
DROP POLICY IF EXISTS "Staff can update vehicle issues" ON public.vehicle_issues;
DROP POLICY IF EXISTS "Staff can delete vehicle issues" ON public.vehicle_issues;

-- ── Recreate with staff_profiles / vehicles join ──────────────────────────────

CREATE POLICY "Staff can view vehicle issues"
  ON public.vehicle_issues
  FOR SELECT
  TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert vehicle issues"
  ON public.vehicle_issues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can update vehicle issues"
  ON public.vehicle_issues
  FOR UPDATE
  TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete vehicle issues"
  ON public.vehicle_issues
  FOR DELETE
  TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );
