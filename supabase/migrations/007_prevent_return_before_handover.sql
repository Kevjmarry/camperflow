-- Prevent completing a return checklist while any handover checklist
-- for the same booking is still not completed.

CREATE OR REPLACE FUNCTION public.check_handover_completed_before_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_handover_count integer;
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.checklist_type = 'return'
  THEN
    SELECT COUNT(*) INTO pending_handover_count
    FROM public.checklist_instances
    WHERE booking_id      = NEW.booking_id
      AND company_id      = NEW.company_id
      AND checklist_type  = 'handover'
      AND status         <> 'completed';

    IF pending_handover_count > 0 THEN
      RAISE EXCEPTION 'Cannot complete return checklist: handover must be completed first';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_return_before_handover
  BEFORE UPDATE ON public.checklist_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.check_handover_completed_before_return();
