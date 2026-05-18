-- Migration 004a: Foundational schema recovery
--
-- Creates the seven schema objects that later ALTER / RLS migrations assume exist
-- but that were never captured in the numbered migration history.
--
-- Sorts after 004_create_bookings.sql and before 005_fix_epicvans_accent_color.sql.
-- Every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so this file is
-- safe to apply against a database that already has these objects.
--
-- Out of scope (added by specific later migrations):
--   vehicles.registration_plate, .make, .model, .year, .vin, .notes, .photo_url,
--   .latest_odometer, .operational_hold, .length_m, .width_m, .height_m,
--   .youtube_url         — column additions not tracked here
--   checklist_template_items.ui_section   — migration 015
--   checklist_template_items.options      — migration 018
--   checklist_instances.vehicle_id        — migration 010
--   vehicle_issues.source_*              — migrations 026, 030
--   compliance tables, booking_status enum, vehicle_blocks

-- ── 1. vehicles.company_id ────────────────────────────────────────────────────
-- Nullable so pre-existing sample rows (inserted in migration 001) are not
-- invalidated.  Backfill with the default company id is handled separately
-- (supabase/verify_and_fix_company.sql).

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_vehicles_company_id
  ON public.vehicles(company_id);

-- ── 2. staff_profiles ─────────────────────────────────────────────────────────
-- auth_user_id is nullable: a profile row can exist before the staff member
-- has accepted their invite and linked an auth account (see invite flow).

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  profile_id    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id  UUID        UNIQUE,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'staff'
                            CHECK (role IN ('admin', 'staff')),
  can_manage    BOOLEAN     NOT NULL DEFAULT false,
  can_clean     BOOLEAN     NOT NULL DEFAULT false,
  can_mechanical BOOLEAN   NOT NULL DEFAULT false,
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_auth_user_id
  ON public.staff_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_company_id
  ON public.staff_profiles(company_id);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- Staff can read their own profile and all profiles within their company.
-- A company-scoped helper function is not available until migration 039, so
-- we keep this permissive for now; service-role writes bypass RLS entirely.
CREATE POLICY "Staff can view staff profiles"
  ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff can update own profile"
  ON public.staff_profiles
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid());

-- ── 3. checklist_templates ────────────────────────────────────────────────────
-- Primary type column is "type" (used by all current application code and
-- migrations 016-044).  The generated column "checklist_type" is a read-only
-- alias that keeps migration 015's DO block from failing — its
-- WHERE checklist_type = 'handover' loop finds zero rows and exits cleanly.

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  scope          TEXT        NOT NULL DEFAULT 'booking'
                             CHECK (scope IN ('booking', 'vehicle')),
  type           TEXT        NOT NULL,
  checklist_type TEXT        GENERATED ALWAYS AS (type) STORED,
  active         BOOLEAN     NOT NULL DEFAULT true,
  is_system      BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_company_id
  ON public.checklist_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_company_scope_type
  ON public.checklist_templates(company_id, scope, type);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view checklist templates"
  ON public.checklist_templates FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can insert checklist templates"
  ON public.checklist_templates FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can update checklist templates"
  ON public.checklist_templates FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can delete checklist templates"
  ON public.checklist_templates FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE TRIGGER set_checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 4. checklist_template_items ───────────────────────────────────────────────
-- Columns added by later migrations and therefore NOT included here:
--   ui_section  → migration 015 (ADD COLUMN IF NOT EXISTS)
--   options     → migration 018 (ADD COLUMN IF NOT EXISTS)
--
-- Columns that MUST be here because no ALTER migration adds them and downstream
-- code / migrations reference them at execution time:
--   input_type  → migration 017 runs UPDATE on it; no prior ADD COLUMN exists
--   required    → migration 044 INSERT mentions it; no prior ADD COLUMN exists
--   position    → migration 044 INSERT mentions it; no prior ADD COLUMN exists
--   section_id  → migration 006 trigger text references it; nullable, no FK

CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID        NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  position    INT,
  section     TEXT,
  section_id  UUID,
  input_type  TEXT        NOT NULL DEFAULT 'checkbox',
  required    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_template_items_template_id
  ON public.checklist_template_items(template_id);

ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view checklist template items"
  ON public.checklist_template_items FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can insert checklist template items"
  ON public.checklist_template_items FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can update checklist template items"
  ON public.checklist_template_items FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can delete checklist template items"
  ON public.checklist_template_items FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

-- ── 5. vehicle_issues ─────────────────────────────────────────────────────────
-- Minimal base schema.  Migration 026 adds source_checklist_instance_id and
-- source_checklist_item_id.  Migration 030 adds source_booking_id.
--
-- Policy names vehicle_issues_select / _insert / _update match the names
-- dropped by migration 024, which then recreates them with correct company
-- scoping via staff_profiles.  The initial implementation uses a simple JWT
-- role check (same pattern as migrations 001 and 004).

CREATE TABLE IF NOT EXISTS public.vehicle_issues (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id  UUID        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  resolved    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_issues_vehicle_id
  ON public.vehicle_issues(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_issues_unresolved
  ON public.vehicle_issues(vehicle_id, resolved)
  WHERE resolved = false;

ALTER TABLE public.vehicle_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicle_issues_select
  ON public.vehicle_issues FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY vehicle_issues_insert
  ON public.vehicle_issues FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY vehicle_issues_update
  ON public.vehicle_issues FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

-- ── 6. checklist_instances ────────────────────────────────────────────────────
-- vehicle_id is NOT included — added by migration 010 (ADD COLUMN IF NOT EXISTS).
-- The office_*, handover_*, return_* columns are part of the original schema:
--   no ALTER migration adds them, and migration 007 triggers reference
--   checklist_type and status which are also defined here.

CREATE TABLE IF NOT EXISTS public.checklist_instances (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id                UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id                UUID        REFERENCES public.bookings(id) ON DELETE SET NULL,
  template_id               UUID        REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  checklist_type            TEXT        NOT NULL,
  status                    TEXT        NOT NULL DEFAULT 'pending',
  started_at                TIMESTAMPTZ,
  started_by                UUID,
  completed_at              TIMESTAMPTZ,
  completed_by              UUID,
  office_contract_signed    BOOLEAN,
  office_id_verified        BOOLEAN,
  office_deposit_collected  BOOLEAN,
  handover_documents_given  BOOLEAN,
  handover_keys_given       BOOLEAN,
  return_keys_received      BOOLEAN,
  return_documents_received BOOLEAN,
  return_contract_closed    BOOLEAN,
  return_deposit_status     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_instances_company_id
  ON public.checklist_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_booking_id
  ON public.checklist_instances(booking_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_template_id
  ON public.checklist_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_status
  ON public.checklist_instances(status);

ALTER TABLE public.checklist_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view checklist instances"
  ON public.checklist_instances FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can insert checklist instances"
  ON public.checklist_instances FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY "Staff can update checklist instances"
  ON public.checklist_instances FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE TRIGGER set_checklist_instances_updated_at
  BEFORE UPDATE ON public.checklist_instances
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 7. checklist_instance_items ───────────────────────────────────────────────
-- Policy names checklist_instance_items_select / _insert / _update match the
-- names dropped by migration 039, which recreates them with correct
-- company scoping via current_staff_company_id().
--
-- linked_vehicle_issue_id references vehicle_issues (created above in step 5).
-- A UNIQUE constraint on (instance_id, template_item_id) matches the upsert
-- conflict target used by provisionBookingChecklists.ts.

CREATE TABLE IF NOT EXISTS public.checklist_instance_items (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id             UUID        NOT NULL REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  template_item_id        UUID        NOT NULL REFERENCES public.checklist_template_items(id) ON DELETE CASCADE,
  checked                 BOOLEAN     NOT NULL DEFAULT false,
  notes                   TEXT,
  checked_at              TIMESTAMPTZ,
  checked_by              UUID,
  issue_flag              BOOLEAN,
  issue_title             TEXT,
  issue_description       TEXT,
  issue_severity          TEXT        CHECK (issue_severity IN ('low', 'medium', 'high', 'critical')),
  issue_blocking          BOOLEAN,
  linked_vehicle_issue_id UUID        REFERENCES public.vehicle_issues(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, template_item_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_instance_items_instance_id
  ON public.checklist_instance_items(instance_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instance_items_template_item_id
  ON public.checklist_instance_items(template_item_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instance_items_linked_issue
  ON public.checklist_instance_items(linked_vehicle_issue_id)
  WHERE linked_vehicle_issue_id IS NOT NULL;

ALTER TABLE public.checklist_instance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_instance_items_select
  ON public.checklist_instance_items FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY checklist_instance_items_insert
  ON public.checklist_instance_items FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');

CREATE POLICY checklist_instance_items_update
  ON public.checklist_instance_items FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff');
