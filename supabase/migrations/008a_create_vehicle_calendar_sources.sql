-- Migration 008a: Create vehicle_calendar_sources
--
-- Sorts after 008_add_staff_metadata_to_bookings.sql and before
-- 009_vehicle_calendar_sources_sync_fields.sql, which ALTERs this table
-- to add sync_interval, last_synced_at, last_sync_status, last_sync_error.
--
-- Columns deliberately excluded (added by migration 009):
--   sync_interval, last_synced_at, last_sync_status, last_sync_error
--
-- vehicle_id is the PRIMARY KEY and the upsert conflict target used by every
-- caller: onConflict: 'vehicle_id' in the import page, edit page, and sync route.

CREATE TABLE IF NOT EXISTS public.vehicle_calendar_sources (
  vehicle_id  UUID        PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  ical_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_calendar_sources_vehicle_id
  ON public.vehicle_calendar_sources(vehicle_id);

ALTER TABLE public.vehicle_calendar_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view vehicle calendar sources"
  ON public.vehicle_calendar_sources
  FOR SELECT TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert vehicle calendar sources"
  ON public.vehicle_calendar_sources
  FOR INSERT TO authenticated
  WITH CHECK (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can update vehicle calendar sources"
  ON public.vehicle_calendar_sources
  FOR UPDATE TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete vehicle calendar sources"
  ON public.vehicle_calendar_sources
  FOR DELETE TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id
      FROM   public.vehicles       v
      JOIN   public.staff_profiles sp ON sp.company_id = v.company_id
      WHERE  sp.auth_user_id = auth.uid()
    )
  );
