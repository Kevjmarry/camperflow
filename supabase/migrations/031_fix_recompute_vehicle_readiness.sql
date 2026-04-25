-- Migration 031: Rewrite recompute_vehicle_readiness with correct 3-status rules:
--
--   1. on_rent   – any booking currently has status 'on_rent'.
--                  The booking only reaches on_rent after the handover/pickup
--                  checklist is completed (see useHandoverCompletion.ts).
--
--   2. preparing – the NEXT upcoming confirmed booking (earliest pickup_at)
--                  exists AND has at least one prep blocker:
--                  · incomplete cleaning/mechanical/readiness checklist instance
--                    for that specific booking
--                  · an open (unresolved) vehicle issue
--                  · an expired compliance item with blocks_readiness = true
--
--   3. ready     – no next confirmed booking, OR the next confirmed booking
--                  has no prep blockers (vehicle is ready and waiting for
--                  pickup). Also the default when no active obligations exist.

CREATE OR REPLACE FUNCTION public.recompute_vehicle_readiness(p_vehicle_id UUID)
RETURNS VOID AS $$
DECLARE
  v_has_on_rent     BOOLEAN;
  v_next_booking_id UUID;
  v_has_blockers    BOOLEAN;
BEGIN
  -- 1. Any on-rent booking → vehicle is on rent.
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE vehicle_id = p_vehicle_id
      AND status     = 'on_rent'
  ) INTO v_has_on_rent;

  IF v_has_on_rent THEN
    UPDATE public.vehicles SET status = 'on_rent' WHERE id = p_vehicle_id;
    RETURN;
  END IF;

  -- 2. Find the next upcoming confirmed booking (soonest pickup_at).
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

    -- Blocker 3: expired compliance item that blocks readiness.
    IF NOT v_has_blockers THEN
      SELECT EXISTS (
        SELECT 1
        FROM   public.vehicle_compliance vc
        JOIN   public.compliance_types   ct ON ct.id = vc.compliance_type_id
        WHERE  vc.vehicle_id        = p_vehicle_id
          AND  ct.blocks_readiness  = true
          AND  vc.expiry_date       < CURRENT_DATE
      ) INTO v_has_blockers;
    END IF;

    IF v_has_blockers THEN
      UPDATE public.vehicles SET status = 'preparing' WHERE id = p_vehicle_id;
    ELSE
      -- Next confirmed booking exists, no blockers: ready and waiting for pickup.
      UPDATE public.vehicles SET status = 'ready' WHERE id = p_vehicle_id;
    END IF;
    RETURN;

  END IF;

  -- 3. No active rental, no upcoming confirmed booking → ready.
  UPDATE public.vehicles SET status = 'ready' WHERE id = p_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
