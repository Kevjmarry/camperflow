-- Migration 052: Fire recompute_vehicle_readiness on vehicle_issue changes.
--
-- Gap 2 from Phase 4 audit: inserting or resolving a vehicle issue did not
-- automatically feed back into vehicle readiness.
--
-- Two triggers:
--   1. AFTER INSERT  — new unresolved issue immediately blocks readiness.
--   2. AFTER UPDATE OF resolved — resolving (or re-opening) an issue updates readiness.
--
-- Scope: vehicle_id is NOT NULL on this table so no NULL guard needed.
--        operational_hold and checklist logic untouched.

CREATE OR REPLACE FUNCTION public.trg_fn_vehicle_issue_readiness()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.recompute_vehicle_readiness(
    CASE TG_OP WHEN 'INSERT' THEN NEW.vehicle_id ELSE NEW.vehicle_id END
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 1. New unresolved issue → recompute (skip if inserted already resolved)
CREATE TRIGGER trg_vehicle_issue_insert_readiness
  AFTER INSERT
  ON public.vehicle_issues
  FOR EACH ROW
  WHEN (NEW.resolved = false)
  EXECUTE FUNCTION public.trg_fn_vehicle_issue_readiness();

-- 2. Resolution state change → recompute
CREATE TRIGGER trg_vehicle_issue_resolved_readiness
  AFTER UPDATE OF resolved
  ON public.vehicle_issues
  FOR EACH ROW
  WHEN (OLD.resolved IS DISTINCT FROM NEW.resolved)
  EXECUTE FUNCTION public.trg_fn_vehicle_issue_readiness();
