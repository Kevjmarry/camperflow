-- Migration 041: Add odometer-based compliance support + engine-service system type.
--
-- Changes:
--   1. compliance_types.warning_km_before  – km threshold before due odometer to show warning
--   2. vehicle_compliance.service_due_odometer_km – odometer reading at which service is next due
--   3. Seed system compliance type 'engine-service' (opt-in per vehicle, no type column needed)
--   4. Replace recompute_vehicle_readiness so blocker 3 fires on expired date OR overdue km

-- 1. Add warning_km_before to compliance_types
ALTER TABLE public.compliance_types
  ADD COLUMN IF NOT EXISTS warning_km_before INTEGER DEFAULT NULL;

-- 2. Add service_due_odometer_km to vehicle_compliance
ALTER TABLE public.vehicle_compliance
  ADD COLUMN IF NOT EXISTS service_due_odometer_km INTEGER DEFAULT NULL;

-- 3. Seed engine-service system compliance type (idempotent)
INSERT INTO public.compliance_types
  (slug, name, is_system, blocks_readiness, warning_days_before, warning_km_before,
   allow_multiple, sort_order, is_active)
VALUES
  ('engine-service', 'Engine Service', true, true, 30, 1000, false, 6, true)
ON CONFLICT (slug) DO NOTHING;

-- 4. Replace recompute_vehicle_readiness
--
--   Blocker 3 now triggers when blocks_readiness = true AND either:
--     a) expiry_date is set and has passed  (existing date logic)
--     b) service_due_odometer_km is set and vehicle's latest_odometer has reached it (new km logic)
--
--   Logic for on_rent / preparing / ready is otherwise unchanged from migration 031.

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

    -- Blocker 3: compliance that blocks readiness where date has expired OR km is overdue.
    IF NOT v_has_blockers THEN
      SELECT EXISTS (
        SELECT 1
        FROM   public.vehicle_compliance vc
        JOIN   public.compliance_types   ct ON ct.id  = vc.compliance_type_id
        JOIN   public.vehicles            v  ON v.id   = vc.vehicle_id
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

  -- 3. No active rental, no upcoming confirmed booking → ready.
  UPDATE public.vehicles SET status = 'ready' WHERE id = p_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
