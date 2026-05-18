-- Migration 055: Integrate operational_hold with recompute_vehicle_readiness (Option D).
--
-- Two changes:
--   1. recompute_vehicle_readiness() gains an early-exit guard: when operational_hold=true
--      the vehicle is forced to 'preparing' and the function returns.  The on_rent check
--      still runs first — an active rental always takes priority over a manual hold.
--   2. AFTER UPDATE OF operational_hold trigger on vehicles:
--        hold ON  (false → true)  — write status='preparing' directly (no need to call
--                                   recompute; hold unconditionally means preparing).
--        hold OFF (true  → false) — call recompute_vehicle_readiness() so status is
--                                   restored from current booking / issue / compliance state.
--
-- Loop safety: the trigger is AFTER UPDATE OF operational_hold.  The inner writes
-- (SET status or the recompute SET status) do not include operational_hold in their
-- SET clause, so this trigger does not re-fire.  trg_odometer_readiness is
-- AFTER UPDATE OF latest_odometer only — also not affected.
--
-- Scope: UI, other readiness rules, and all other triggers untouched.

-- 1. Replace recompute_vehicle_readiness with operational_hold guard.
CREATE OR REPLACE FUNCTION public.recompute_vehicle_readiness(p_vehicle_id UUID)
RETURNS VOID AS $$
DECLARE
  v_on_hold         BOOLEAN;
  v_has_on_rent     BOOLEAN;
  v_next_booking_id UUID;
  v_has_blockers    BOOLEAN;
BEGIN
  -- Step 1: active rental always wins (live booking state).
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE vehicle_id = p_vehicle_id
      AND status     = 'on_rent'
  ) INTO v_has_on_rent;

  IF v_has_on_rent THEN
    UPDATE public.vehicles SET status = 'on_rent' WHERE id = p_vehicle_id;
    RETURN;
  END IF;

  -- Step 2: operational hold overrides readiness logic when vehicle is not on rent.
  SELECT operational_hold INTO v_on_hold
  FROM   public.vehicles
  WHERE  id = p_vehicle_id;

  IF v_on_hold THEN
    UPDATE public.vehicles SET status = 'preparing' WHERE id = p_vehicle_id;
    RETURN;
  END IF;

  -- Step 3: find the next upcoming confirmed booking (soonest pickup_at).
  SELECT id INTO v_next_booking_id
  FROM   public.bookings
  WHERE  vehicle_id = p_vehicle_id
    AND  status     = 'confirmed'
  ORDER  BY pickup_at ASC
  LIMIT  1;

  IF v_next_booking_id IS NOT NULL THEN

    -- Blocker 1: incomplete prep checklist for the next confirmed booking only.
    SELECT EXISTS (
      SELECT 1
      FROM   public.checklist_instances ci
      WHERE  ci.booking_id      = v_next_booking_id
        AND  ci.checklist_type IN ('cleaning', 'mechanical', 'vehicle_readiness', 'pre_season', 'post_season')
        AND  ci.status         != 'completed'
    ) INTO v_has_blockers;

    -- Blocker 2: open vehicle issue.
    IF NOT v_has_blockers THEN
      SELECT EXISTS (
        SELECT 1 FROM public.vehicle_issues
        WHERE vehicle_id = p_vehicle_id
          AND resolved   = false
      ) INTO v_has_blockers;
    END IF;

    -- Blocker 3: compliance expired by date OR overdue by odometer km.
    IF NOT v_has_blockers THEN
      SELECT EXISTS (
        SELECT 1
        FROM   public.vehicle_compliance vc
        JOIN   public.compliance_types   ct ON ct.id = vc.compliance_type_id
        JOIN   public.vehicles            v  ON v.id  = vc.vehicle_id
        WHERE  vc.vehicle_id       = p_vehicle_id
          AND  ct.blocks_readiness = true
          AND  (
                 (vc.expiry_date IS NOT NULL AND vc.expiry_date < CURRENT_DATE)
                 OR
                 (vc.service_due_odometer_km IS NOT NULL
                  AND v.latest_odometer IS NOT NULL
                  AND v.latest_odometer >= vc.service_due_odometer_km)
               )
      ) INTO v_has_blockers;
    END IF;

    IF v_has_blockers THEN
      UPDATE public.vehicles SET status = 'preparing' WHERE id = p_vehicle_id;
    ELSE
      UPDATE public.vehicles SET status = 'ready' WHERE id = p_vehicle_id;
    END IF;
    RETURN;

  END IF;

  -- Step 4: no active rental, no hold, no upcoming confirmed booking → ready.
  UPDATE public.vehicles SET status = 'ready' WHERE id = p_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger function for operational_hold changes.
CREATE OR REPLACE FUNCTION public.trg_fn_operational_hold_readiness()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.operational_hold IS DISTINCT FROM NEW.operational_hold THEN
    IF NEW.operational_hold THEN
      UPDATE public.vehicles SET status = 'preparing' WHERE id = NEW.id;
    ELSE
      PERFORM public.recompute_vehicle_readiness(NEW.id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_operational_hold_readiness
  AFTER UPDATE OF operational_hold
  ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_operational_hold_readiness();
