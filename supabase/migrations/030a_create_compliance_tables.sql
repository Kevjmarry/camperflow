-- Migration 030a: Create compliance_types and vehicle_compliance
--
-- Sorts after 030_add_source_booking_id_to_vehicle_issues.sql and before
-- 031_fix_recompute_vehicle_readiness.sql, which is the first migration to
-- JOIN these tables inside recompute_vehicle_readiness().
--
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT
-- so this file is idempotent and safe to re-apply.
--
-- Columns deliberately excluded (added by later migrations):
--   compliance_types.warning_km_before        — migration 041 (ADD COLUMN IF NOT EXISTS)
--   vehicle_compliance.service_due_odometer_km — migration 041 (ADD COLUMN IF NOT EXISTS)
--   vehicle_compliance.warning_days_before_override — migration 042
--   vehicle_compliance.warning_km_before_override   — migration 042
--
-- System type seeds: 5 original types seeded here.
--   'engine-service' is seeded by migration 041 with ON CONFLICT DO NOTHING.

-- ── 1. compliance_types ───────────────────────────────────────────────────────
-- company_id is NULL for system-wide types and set for company-custom types.
-- slug carries a UNIQUE constraint; migration 041's ON CONFLICT (slug) target
-- depends on it.

CREATE TABLE IF NOT EXISTS public.compliance_types (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug                TEXT        NOT NULL UNIQUE,
  name                TEXT        NOT NULL,
  is_system           BOOLEAN     NOT NULL DEFAULT false,
  blocks_readiness    BOOLEAN     NOT NULL DEFAULT false,
  warning_days_before INT         NOT NULL DEFAULT 30,
  allow_multiple      BOOLEAN     NOT NULL DEFAULT false,
  sort_order          INT         NOT NULL DEFAULT 0,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  company_id          UUID        REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_types_company_id
  ON public.compliance_types(company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_types_is_active
  ON public.compliance_types(is_active);

ALTER TABLE public.compliance_types ENABLE ROW LEVEL SECURITY;

-- Staff see all system types (company_id IS NULL) plus their own company's
-- custom types.  No authenticated write policies: type rows are managed via
-- service role (initial seeds, admin tooling).
CREATE POLICY "Staff can view compliance types"
  ON public.compliance_types
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR company_id IN (
      SELECT company_id
      FROM   public.staff_profiles
      WHERE  auth_user_id = auth.uid()
    )
  );

-- ── 2. Seed the five original system compliance types ─────────────────────────
-- sort_order 1–5; migration 041 seeds engine-service at sort_order 6.
-- ON CONFLICT (slug) DO NOTHING makes this idempotent.

INSERT INTO public.compliance_types
  (slug, name, is_system, blocks_readiness, warning_days_before,
   allow_multiple, sort_order, is_active)
VALUES
  ('technical-inspection', 'Technical Inspection', true, true,  30, false, 1, true),
  ('insurance',            'Insurance',            true, true,  30, false, 2, true),
  ('gas-inspection',       'Gas Inspection',       true, true,  30, false, 3, true),
  ('habitation-service',   'Habitation Service',   true, false, 30, false, 4, true),
  ('general-service',      'General Service',      true, false, 30, false, 5, true)
ON CONFLICT (slug) DO NOTHING;

-- ── 3. vehicle_compliance ─────────────────────────────────────────────────────
-- expiry_date is DATE (compared with CURRENT_DATE in recompute_vehicle_readiness
-- and with a 'YYYY-MM-DD' string in PostgREST filters from the app).
-- last_completed_at records when the compliance item was last renewed/serviced.

CREATE TABLE IF NOT EXISTS public.vehicle_compliance (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id          UUID        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  compliance_type_id  UUID        NOT NULL REFERENCES public.compliance_types(id) ON DELETE CASCADE,
  expiry_date         DATE,
  last_completed_at   TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_compliance_vehicle_id
  ON public.vehicle_compliance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_compliance_type_id
  ON public.vehicle_compliance(compliance_type_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_compliance_expiry
  ON public.vehicle_compliance(vehicle_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

ALTER TABLE public.vehicle_compliance ENABLE ROW LEVEL SECURITY;

-- Staff access rows for vehicles that belong to their company.
-- Pattern mirrors migration 024 (vehicle_issues company scoping via
-- staff_profiles + vehicles join).

CREATE POLICY "Staff can view vehicle compliance"
  ON public.vehicle_compliance
  FOR SELECT TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert vehicle compliance"
  ON public.vehicle_compliance
  FOR INSERT TO authenticated
  WITH CHECK (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can update vehicle compliance"
  ON public.vehicle_compliance
  FOR UPDATE TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete vehicle compliance"
  ON public.vehicle_compliance
  FOR DELETE TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );
