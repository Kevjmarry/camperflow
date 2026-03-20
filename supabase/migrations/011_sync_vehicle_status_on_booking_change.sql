-- Migration 011: Trigger to call recompute_vehicle_readiness on booking status change

CREATE OR REPLACE FUNCTION public.trg_fn_booking_status_sync_vehicle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id)
  THEN
    PERFORM public.recompute_vehicle_readiness(NEW.vehicle_id);
  END IF;

  IF OLD.vehicle_id IS NOT NULL AND OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id THEN
    PERFORM public.recompute_vehicle_readiness(OLD.vehicle_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_booking_status_sync_vehicle
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_booking_status_sync_vehicle();
