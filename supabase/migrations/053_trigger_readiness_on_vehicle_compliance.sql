-- Migration 053: Fire recompute_vehicle_readiness on vehicle_compliance changes.
--
-- Gap 3 from Phase 4 audit: adding, updating, or deleting a compliance record
-- did not automatically feed back into vehicle readiness.
--
-- Three triggers:
--   1. AFTER INSERT  — new record may immediately become a blocker.
--   2. AFTER UPDATE OF blocker-relevant columns only — expiry_date,
--      service_due_odometer_km, compliance_type_id (the three fields
--      evaluated by recompute_vehicle_readiness blocker 3, migration 041 lines 88-94).
--   3. AFTER DELETE  — removed record may have been the sole blocker; uses OLD.vehicle_id.
--
-- Scope: vehicle_id is NOT NULL on this table so no NULL guard needed.
--        operational_hold, odometer writes, checklist logic untouched.

CREATE OR REPLACE FUNCTION public.trg_fn_vehicle_compliance_readiness()
RETURNS TRIGGER AS $$
DECLARE
  v_vehicle_id UUID;
BEGIN
  v_vehicle_id := CASE TG_OP WHEN 'DELETE' THEN OLD.vehicle_id ELSE NEW.vehicle_id END;
  PERFORM public.recompute_vehicle_readiness(v_vehicle_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 1. New compliance record
CREATE TRIGGER trg_vehicle_compliance_insert_readiness
  AFTER INSERT
  ON public.vehicle_compliance
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_vehicle_compliance_readiness();

-- 2. Blocker-relevant field change
CREATE TRIGGER trg_vehicle_compliance_update_readiness
  AFTER UPDATE OF expiry_date, service_due_odometer_km, compliance_type_id
  ON public.vehicle_compliance
  FOR EACH ROW
  WHEN (
    OLD.expiry_date              IS DISTINCT FROM NEW.expiry_date
    OR OLD.service_due_odometer_km IS DISTINCT FROM NEW.service_due_odometer_km
    OR OLD.compliance_type_id    IS DISTINCT FROM NEW.compliance_type_id
  )
  EXECUTE FUNCTION public.trg_fn_vehicle_compliance_readiness();

-- 3. Deleted compliance record
CREATE TRIGGER trg_vehicle_compliance_delete_readiness
  AFTER DELETE
  ON public.vehicle_compliance
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_vehicle_compliance_readiness();
