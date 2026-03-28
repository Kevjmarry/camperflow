-- Migration 023: Ensure booking-driven checklist_instances always carry the
-- booking's vehicle_id.
--
-- Background (migration 010):
--   "Booking-scope checklists keep booking_id set and vehicle_id null."
-- That design is now incorrect: Operations queries vehicle_issues and
-- checklist_instance_items using vehicle_id, so a null there silently hides
-- all flags surfaced from booking checklists.
--
-- Three-part fix:
--   1. Backfill – patch every existing booking-scope instance whose
--      vehicle_id is NULL but whose booking has a vehicle_id.
--   2. INSERT trigger – any new checklist_instance created with a booking_id
--      but no explicit vehicle_id gets vehicle_id copied from the booking row.
--   3. UPDATE trigger – if a booking's vehicle_id changes, propagate the new
--      value to all linked checklist_instances immediately.

-- ── 1. Backfill existing rows ─────────────────────────────────────────────────

UPDATE public.checklist_instances ci
SET    vehicle_id = b.vehicle_id
FROM   public.bookings b
WHERE  ci.booking_id   = b.id
  AND  ci.vehicle_id   IS NULL
  AND  b.vehicle_id    IS NOT NULL;

-- ── 2. INSERT trigger: copy vehicle_id from booking ───────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_checklist_instance_inherit_vehicle()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when a booking_id is present but vehicle_id was not supplied.
  IF NEW.booking_id IS NOT NULL AND NEW.vehicle_id IS NULL THEN
    SELECT vehicle_id
    INTO   NEW.vehicle_id
    FROM   public.bookings
    WHERE  id = NEW.booking_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_checklist_instance_inherit_vehicle
  ON public.checklist_instances;

CREATE TRIGGER trg_checklist_instance_inherit_vehicle
  BEFORE INSERT ON public.checklist_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_checklist_instance_inherit_vehicle();

-- ── 3. UPDATE trigger: propagate booking vehicle changes to instances ──────────

CREATE OR REPLACE FUNCTION public.trg_fn_booking_vehicle_sync_to_checklists()
RETURNS TRIGGER AS $$
BEGIN
  -- Only run when vehicle_id actually changed.
  IF OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id THEN
    UPDATE public.checklist_instances
    SET    vehicle_id = NEW.vehicle_id
    WHERE  booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_booking_vehicle_sync_to_checklists
  ON public.bookings;

CREATE TRIGGER trg_booking_vehicle_sync_to_checklists
  AFTER UPDATE OF vehicle_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_booking_vehicle_sync_to_checklists();
