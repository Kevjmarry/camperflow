-- Migration 051: Fire recompute_vehicle_readiness when a prep checklist status changes.
--
-- Gap 1 from Phase 4 audit: checklist_instances status updates were not feeding
-- back into vehicle readiness automatically.  Covers the five types that act as
-- blockers in recompute_vehicle_readiness (migration 041, line 67).
--
-- Scope: AFTER UPDATE OF status only.  Handover / return types excluded.
--        operational_hold untouched.

CREATE OR REPLACE FUNCTION public.trg_fn_checklist_status_readiness()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.checklist_type IN (
           'cleaning', 'mechanical', 'vehicle_readiness',
           'pre_season', 'post_season'
         )
  THEN
    PERFORM public.recompute_vehicle_readiness(NEW.vehicle_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_checklist_status_readiness
  AFTER UPDATE OF status
  ON public.checklist_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_checklist_status_readiness();
