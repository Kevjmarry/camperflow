create or replace view public.ops_bookings as
SELECT b.id,
    b.company_id,
    b.booking_number,
    b.status AS booking_status,
    b.pickup_at,
    b.return_at,
    b.customer_name,
    b.customer_phone,
    b.customer_email,
    b.notes,
    v.id AS vehicle_id,
    v.name AS vehicle_name,
    v.status AS vehicle_status,
    v.operational_hold,
        CASE
            WHEN b.status = 'cancelled'::booking_status THEN 'cancelled'::text
            WHEN b.status = 'completed'::booking_status OR COALESCE(r.checklist_done, false) THEN 'completed'::text
            WHEN b.status = 'on_rent'::booking_status  OR COALESCE(h.checklist_done, false) THEN 'on_rent'::text
            ELSE b.status::text
        END AS operational_status,
        CASE
            WHEN b.status = 'cancelled'::booking_status THEN 'cancelled'::text
            WHEN b.status = 'completed'::booking_status OR COALESCE(r.checklist_done, false) THEN 'completed'::text
            WHEN (b.status = 'on_rent'::booking_status OR COALESCE(h.checklist_done, false))
                 AND now() >= b.return_at THEN 'start_return'::text
            WHEN b.status = 'on_rent'::booking_status OR COALESCE(h.checklist_done, false) THEN 'await_return'::text
            WHEN now() >= b.pickup_at AND now() < b.return_at THEN 'start_handover'::text
            WHEN now() < b.pickup_at THEN 'prepare_for_pickup'::text
            ELSE 'check_booking'::text
        END AS next_action,
    EXTRACT(epoch FROM b.pickup_at - now()) / 3600::numeric AS hours_to_pickup,
        CASE
            WHEN date(b.pickup_at) = CURRENT_DATE
                 AND b.status NOT IN ('on_rent'::booking_status, 'completed'::booking_status, 'cancelled'::booking_status)
                 AND NOT COALESCE(h.checklist_done, false)
                 THEN 'pickup_today'::text
            WHEN date(b.return_at) = CURRENT_DATE
                 AND b.status NOT IN ('completed'::booking_status, 'cancelled'::booking_status)
                 AND NOT COALESCE(r.checklist_done, false)
                 THEN 'return_today'::text
            WHEN now() > b.return_at
                 AND b.status <> 'completed'::booking_status
                 AND NOT COALESCE(r.checklist_done, false)
                 THEN 'overdue_return'::text
            ELSE NULL::text
        END AS ops_flag,
        CASE
            WHEN now() > b.return_at
                 AND b.status <> 'completed'::booking_status
                 AND NOT COALESCE(r.checklist_done, false) THEN true
            ELSE false
        END AS is_overdue,
        CASE
            WHEN now() > b.return_at AND b.status <> 'completed'::booking_status THEN 1
            WHEN date(b.return_at) = CURRENT_DATE THEN 2
            WHEN date(b.pickup_at) = CURRENT_DATE THEN 3
            WHEN b.pickup_at > now() THEN 4
            ELSE 5
        END AS ops_priority,
        CASE
            WHEN v.operational_hold = true THEN true
            ELSE false
        END AS vehicle_blocked,
    COALESCE(h.total_items, 0::bigint) AS handover_items_total,
    COALESCE(h.completed_items, 0::bigint) AS handover_items_done,
    COALESCE(h.checklist_done, false) AS handover_checklist_done,
    COALESCE(r.total_items, 0::bigint) AS return_items_total,
    COALESCE(r.completed_items, 0::bigint) AS return_items_done,
    COALESCE(r.checklist_done, false) AS return_checklist_done,
    COALESCE(c.total_items, 0::bigint) AS cleaning_items_total,
    COALESCE(c.completed_items, 0::bigint) AS cleaning_items_done
   FROM bookings b
     LEFT JOIN vehicles v ON v.id = b.vehicle_id
     LEFT JOIN ( SELECT ci.booking_id,
            count(items.id) AS total_items,
            count(*) FILTER (WHERE items.checked = true) AS completed_items,
            bool_or(ci.status = 'completed') AS checklist_done
           FROM checklist_instances ci
             LEFT JOIN checklist_instance_items items ON items.instance_id = ci.id
          WHERE ci.checklist_type = 'handover'::text
          GROUP BY ci.booking_id) h ON h.booking_id = b.id
     LEFT JOIN ( SELECT ci.booking_id,
            count(items.id) AS total_items,
            count(*) FILTER (WHERE items.checked = true) AS completed_items,
            bool_or(ci.status = 'completed') AS checklist_done
           FROM checklist_instances ci
             LEFT JOIN checklist_instance_items items ON items.instance_id = ci.id
          WHERE ci.checklist_type = 'return'::text
          GROUP BY ci.booking_id) r ON r.booking_id = b.id
     LEFT JOIN ( SELECT ci.booking_id,
            count(items.id) AS total_items,
            count(*) FILTER (WHERE items.checked = true) AS completed_items
           FROM checklist_instances ci
             LEFT JOIN checklist_instance_items items ON items.instance_id = ci.id
          WHERE ci.checklist_type = 'cleaning'::text
          GROUP BY ci.booking_id) c ON c.booking_id = b.id;
