-- Migration 049a: Slot 3 schema recovery
--
-- Sorts after 049_add_guest_feedback_table.sql and before
-- 050_source_control_ops_bookings_view.sql, which requires all three
-- objects defined here to compile successfully.
--
-- Objects created:
--   1. booking_status enum          — migration 050 VIEW uses ::booking_status casts
--   2. vehicles.operational_hold    — migration 050 VIEW selects v.operational_hold
--      vehicles.hold_reason         — paired column; no ALTER migration adds it
--   3. vehicle_blocks table         — import route, sync route, ops snapshot query

-- ── 1. booking_status enum ────────────────────────────────────────────────────
-- bookings.status remains VARCHAR(20) — creating the type is sufficient for
-- migration 050's '…'::booking_status casts, because PostgreSQL's implicit
-- enum→text cast lets the view's comparisons resolve without a column type change.
-- Values mirror the CHECK constraint on bookings.status from migration 004.

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM (
    'draft',
    'confirmed',
    'on_rent',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 1b. bookings.status column type promotion ────────────────────────────────
-- migration 050's VIEW uses '…'::booking_status casts in CASE expressions.
-- PostgreSQL has no = operator for (character varying, booking_status), so
-- bookings.status must be the enum type for the view to compile.
--
-- Step A: drop the inline CHECK constraint added by migration 004 (the enum
-- type enforces the same invariant). Name is auto-generated; confirmed as
-- bookings_status_check. DO block is a no-op if already gone.
DO $$ DECLARE r record; BEGIN
  SELECT constraint_name INTO r
  FROM   information_schema.table_constraints
  WHERE  table_schema    = 'public'
    AND  table_name      = 'bookings'
    AND  constraint_type = 'CHECK'
    AND  constraint_name LIKE '%status%'
  LIMIT 1;
  IF FOUND THEN
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', r.constraint_name);
  END IF;
END $$;

-- Step B: drop the text default so the type change is not blocked by an
-- uncastable DEFAULT expression, then retype the column, then restore the
-- default as the enum literal.
ALTER TABLE public.bookings
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.bookings
  ALTER COLUMN status TYPE public.booking_status
  USING status::text::public.booking_status;

ALTER TABLE public.bookings
  ALTER COLUMN status SET DEFAULT 'confirmed'::public.booking_status;

-- ── 2. vehicles.operational_hold + hold_reason ────────────────────────────────
-- operational_hold: migration 050 VIEW projects it; getOpsVehiclesPreparing reads
--   it; new/edit vehicle pages write it.  No numbered ALTER migration adds it.
-- hold_reason: always paired with operational_hold in every TS interface and form;
--   no numbered ALTER migration adds it.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS operational_hold BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hold_reason      TEXT;

CREATE INDEX IF NOT EXISTS idx_vehicles_operational_hold
  ON public.vehicles(operational_hold)
  WHERE operational_hold = true;

-- ── 3. vehicle_blocks ─────────────────────────────────────────────────────────
-- Stores calendar-imported unavailability blocks (iCal VEVENT rows that are
-- not bookings — e.g. maintenance periods from Bookingmood).
--
-- UNIQUE (company_id, source_type, source_booking_id) is the upsert conflict
-- target used by the booking import route:
--   .upsert({ ... }, { onConflict: 'company_id,source_type,source_booking_id' })
--
-- updated_at is set explicitly by the caller (import route passes updated_at: now)
-- rather than via trigger, so no trigger is attached.
-- import_last_seen_at tracks the most recent sync run that included this block;
-- the sync route uses it to prune stale blocks.

CREATE TABLE IF NOT EXISTS public.vehicle_blocks (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_id          UUID        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  source_type         TEXT        NOT NULL,
  source_booking_id   TEXT        NOT NULL,
  source_reference    TEXT,
  label               TEXT,
  start_at            TIMESTAMPTZ NOT NULL,
  end_at              TIMESTAMPTZ NOT NULL,
  source_metadata     JSONB,
  import_last_seen_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_type, source_booking_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_blocks_company_id
  ON public.vehicle_blocks(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_blocks_vehicle_id
  ON public.vehicle_blocks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_blocks_window
  ON public.vehicle_blocks(company_id, start_at, end_at);

ALTER TABLE public.vehicle_blocks ENABLE ROW LEVEL SECURITY;

-- Scope by company_id directly (table carries it) via staff_profiles lookup.
CREATE POLICY "Staff can view vehicle blocks"
  ON public.vehicle_blocks
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM   public.staff_profiles
      WHERE  auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert vehicle blocks"
  ON public.vehicle_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM   public.staff_profiles
      WHERE  auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can update vehicle blocks"
  ON public.vehicle_blocks
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM   public.staff_profiles
      WHERE  auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete vehicle blocks"
  ON public.vehicle_blocks
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM   public.staff_profiles
      WHERE  auth_user_id = auth.uid()
    )
  );
