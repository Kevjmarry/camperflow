-- Migration 078: Fix ops_bookings view to use checklist completion as operational source of truth.
--
-- Problems fixed:
-- 1. ops_flag='pickup_today' was assigned purely on date, so on_rent bookings with a
--    same-day scheduled pickup still appeared in the Pickups section after handover.
-- 2. No boolean column existed to indicate whether the handover/return checklists were
--    completed, so getOpsOnRentNow could not detect the on-rent state when booking.status
--    had not yet been updated (e.g. early pickup before the scheduled date).
-- 3. All queries read booking_status directly, creating two sources of truth when
--    checklist completion raced ahead of the booking status write.
--
-- Changes:
-- • New operational_status computed column: single source of truth for operational state.
--   Precedence: cancelled > completed|return_done > on_rent|handover_done > booking_status
-- • next_action updated to use operational state (fixes early-pickup "prepare_for_pickup" bug)
-- • pickup_today / return_today / overdue_return flags now gate on checklist completion
-- • is_overdue now gates on return_checklist_done (fixes false overdue after return done)
-- • Two boolean columns: handover_checklist_done, return_checklist_done
--
-- Implementation note: DROP + CREATE is required because migration 063 defined the view
-- with ops_priority before is_overdue; CREATE OR REPLACE VIEW cannot reorder existing
-- columns (PostgreSQL raises "cannot change name of view column").

DROP VIEW IF EXISTS public.ops_bookings;

CREATE VIEW public.ops_bookings AS
SELECT
    b.id,
    b.company_id,
    b.booking_number,
    b.status AS booking_status,
    b.pickup_at,
    b.return_at,
    b.customer_name,
    b.customer_phone,
    b.customer_email,
    b.notes,
    v.id   AS vehicle_id,
    v.name AS vehicle_name,
    v.status AS vehicle_status,
    v.operational_hold,

    -- Single source of truth for operational state, driven by checklist completion.
    -- This is what all queries and UI should use instead of booking_status directly.
    CASE
        WHEN b.status = 'cancelled'::booking_status THEN 'cancelled'::text
        WHEN b.status = 'completed'::booking_status OR COALESCE(r.checklist_done, false) THEN 'completed'::text
        WHEN b.status = 'on_rent'::booking_status  OR COALESCE(h.checklist_done, false) THEN 'on_rent'::text
        ELSE b.status::text
    END AS operational_status,

    -- next_action uses operational state so early pickups (handover done before scheduled
    -- pickup_at) correctly show 'await_return' rather than 'prepare_for_pickup'.
    CASE
        WHEN b.status = 'cancelled'::booking_status THEN 'cancelled'::text
        WHEN b.status = 'completed'::booking_status OR COALESCE(r.checklist_done, false) THEN 'completed'::text
        WHEN (b.status = 'on_rent'::booking_status OR COALESCE(h.checklist_done, false))
             AND public.get_company_now(b.company_id) >= b.return_at THEN 'start_return'::text
        WHEN b.status = 'on_rent'::booking_status OR COALESCE(h.checklist_done, false) THEN 'await_return'::text
        WHEN public.get_company_now(b.company_id) >= b.pickup_at
         AND public.get_company_now(b.company_id) <  b.return_at THEN 'start_handover'::text
        WHEN public.get_company_now(b.company_id) <  b.pickup_at THEN 'prepare_for_pickup'::text
        ELSE 'check_booking'::text
    END AS next_action,

    EXTRACT(epoch FROM b.pickup_at - public.get_company_now(b.company_id))
        / 3600::numeric AS hours_to_pickup,

    -- ops_flag gates on checklist completion so a completed-handover booking is never
    -- flagged as pickup_today, and a completed-return booking is never flagged as
    -- return_today or overdue_return.
    CASE
        WHEN date(b.pickup_at) = date(public.get_company_now(b.company_id))
             AND b.status NOT IN ('on_rent'::booking_status, 'completed'::booking_status, 'cancelled'::booking_status)
             AND NOT COALESCE(h.checklist_done, false)
            THEN 'pickup_today'::text
        WHEN date(b.return_at) = date(public.get_company_now(b.company_id))
             AND b.status NOT IN ('completed'::booking_status, 'cancelled'::booking_status)
             AND NOT COALESCE(r.checklist_done, false)
            THEN 'return_today'::text
        WHEN public.get_company_now(b.company_id) > b.return_at
         AND b.status <> 'completed'::booking_status
         AND NOT COALESCE(r.checklist_done, false)
            THEN 'overdue_return'::text
        ELSE NULL::text
    END AS ops_flag,

    CASE
        WHEN public.get_company_now(b.company_id) > b.return_at
         AND b.status <> 'completed'::booking_status
         AND NOT COALESCE(r.checklist_done, false) THEN true
        ELSE false
    END AS is_overdue,

    CASE
        WHEN public.get_company_now(b.company_id) > b.return_at
         AND b.status <> 'completed'::booking_status       THEN 1
        WHEN date(b.return_at) = date(public.get_company_now(b.company_id)) THEN 2
        WHEN date(b.pickup_at) = date(public.get_company_now(b.company_id)) THEN 3
        WHEN b.pickup_at > public.get_company_now(b.company_id)             THEN 4
        ELSE 5
    END AS ops_priority,

    CASE
        WHEN v.operational_hold = true THEN true
        ELSE false
    END AS vehicle_blocked,

    COALESCE(h.total_items,     0::bigint) AS handover_items_total,
    COALESCE(h.completed_items, 0::bigint) AS handover_items_done,
    COALESCE(h.checklist_done,  false)     AS handover_checklist_done,
    COALESCE(r.total_items,     0::bigint) AS return_items_total,
    COALESCE(r.completed_items, 0::bigint) AS return_items_done,
    COALESCE(r.checklist_done,  false)     AS return_checklist_done,
    COALESCE(c.total_items,     0::bigint) AS cleaning_items_total,
    COALESCE(c.completed_items, 0::bigint) AS cleaning_items_done

FROM public.bookings b
LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
LEFT JOIN (
    SELECT ci.booking_id,
           count(items.id)                                AS total_items,
           count(*) FILTER (WHERE items.checked = true)  AS completed_items,
           bool_or(ci.status = 'completed')               AS checklist_done
    FROM   public.checklist_instances ci
    LEFT JOIN public.checklist_instance_items items ON items.instance_id = ci.id
    WHERE  ci.checklist_type = 'handover'::text
    GROUP BY ci.booking_id
) h ON h.booking_id = b.id
LEFT JOIN (
    SELECT ci.booking_id,
           count(items.id)                                AS total_items,
           count(*) FILTER (WHERE items.checked = true)  AS completed_items,
           bool_or(ci.status = 'completed')               AS checklist_done
    FROM   public.checklist_instances ci
    LEFT JOIN public.checklist_instance_items items ON items.instance_id = ci.id
    WHERE  ci.checklist_type = 'return'::text
    GROUP BY ci.booking_id
) r ON r.booking_id = b.id
LEFT JOIN (
    SELECT ci.booking_id,
           count(items.id)                                AS total_items,
           count(*) FILTER (WHERE items.checked = true)  AS completed_items
    FROM   public.checklist_instances ci
    LEFT JOIN public.checklist_instance_items items ON items.instance_id = ci.id
    WHERE  ci.checklist_type = 'cleaning'::text
    GROUP BY ci.booking_id
) c ON c.booking_id = b.id;
