-- Migration 054: Fire recompute_vehicle_readiness when latest_odometer changes.
--
-- Gap 4 from Phase 4 audit: updating a vehicle's odometer did not automatically
-- feed back into vehicle readiness (compliance km-threshold blocker, migration 041).
--
-- AFTER UPDATE OF latest_odometer is intentionally column-specific:
--   recompute_vehicle_readiness() itself writes vehicles.status, which fires the
--   BEFORE UPDATE set_updated_at trigger.  A broader AFTER UPDATE trigger would
--   re-enter on that status write and loop.  Scoping to latest_odometer breaks
--   the cycle — status writes do not carry latest_odometer in their SET clause.
--
-- Scope: operational_hold, checklist logic, readiness rules untouched.

CREATE OR REPLACE FUNCTION public.trg_fn_odometer_readiness()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.latest_odometer IS DISTINCT FROM NEW.latest_odometer THEN
    PERFORM public.recompute_vehicle_readiness(NEW.id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_odometer_readiness
  AFTER UPDATE OF latest_odometer
  ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_odometer_readiness();
