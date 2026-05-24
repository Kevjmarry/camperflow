-- Migration 063: Frozen demo date support in ops_bookings view
--
-- Problem: ops_bookings view computes ops_flag (pickup_today / return_today /
-- overdue_return), ops_priority, next_action, hours_to_pickup, and is_overdue
-- using PostgreSQL's CURRENT_DATE / now() — the real wall-clock.  The TS
-- loaders (getDemoToday) freeze "today" for the Alpine Campers demo company,
-- but the view ignores that, so the demo ops board shows wrong sections and
-- wrong values as soon as the real date diverges from the frozen date.
--
-- Fix (three parts):
--   1. company_settings.demo_frozen_date — nullable TIMESTAMPTZ column; set
--      only for the demo company (by the reset endpoint or manually).
--   2. get_company_now(UUID) — STABLE SQL function; returns demo_frozen_date
--      for the demo company when set, otherwise real now().  Postgres caches
--      the result per distinct argument within a query, so it executes at most
--      once per company_id per query — no per-row overhead.
--   3. ops_bookings view — all now() / CURRENT_DATE occurrences replaced with
--      get_company_now(b.company_id) / date(get_company_now(b.company_id)).
--      Real companies are unaffected: the function returns now() for them.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE throughout.

-- ── 1. demo_frozen_date column ────────────────────────────────────────────────
-- Nullable: NULL means "use real clock" for that company (all real companies).
-- The Alpine demo company gets this set by the reset endpoint; it can also be
-- set manually via the Supabase dashboard or SQL editor.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS demo_frozen_date TIMESTAMPTZ;

-- ── 2. get_company_now function ───────────────────────────────────────────────
-- STABLE: Postgres is allowed to cache the result for identical arguments
-- within a single table scan.  Since every row in an ops_bookings query has
-- the same company_id (PostgREST always filters by company_id = auth company),
-- the sub-select against company_settings runs exactly once per query.
--
-- SECURITY DEFINER so the function can read company_settings regardless of
-- the calling role's RLS policies (company_settings is readable by all
-- authenticated users anyway, but SECURITY DEFINER makes this robust).

CREATE OR REPLACE FUNCTION public.get_company_now(p_company_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT demo_frozen_date
     FROM   public.company_settings
     WHERE  id = p_company_id),
    now()
  )
$$;

-- ── 3. ops_bookings view ──────────────────────────────────────────────────────
-- Identical to migration 050 except every now() and CURRENT_DATE is replaced
-- with get_company_now(b.company_id) / date(get_company_now(b.company_id)).
-- The checklist sub-selects are unchanged (no date dependency).

CREATE OR REPLACE VIEW public.ops_bookings AS
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

    -- next_action: what staff should do next for this booking
    CASE
        WHEN b.status = 'cancelled'::booking_status  THEN 'cancelled'::text
        WHEN b.status = 'completed'::booking_status  THEN 'completed'::text
        WHEN public.get_company_now(b.company_id) >= b.return_at
            THEN 'start_return'::text
        WHEN public.get_company_now(b.company_id) >= b.pickup_at
         AND public.get_company_now(b.company_id) <  b.return_at
            THEN 'start_handover'::text
        WHEN public.get_company_now(b.company_id) < b.pickup_at
            THEN 'prepare_for_pickup'::text
        WHEN b.status = 'on_rent'::booking_status    THEN 'await_return'::text
        ELSE 'check_booking'::text
    END AS next_action,

    -- hours_to_pickup: signed float; negative = pickup already passed
    EXTRACT(epoch FROM b.pickup_at - public.get_company_now(b.company_id))
        / 3600::numeric AS hours_to_pickup,

    -- ops_flag: drives which board section the booking appears in
    CASE
        WHEN date(b.pickup_at) = date(public.get_company_now(b.company_id))
            THEN 'pickup_today'::text
        WHEN date(b.return_at) = date(public.get_company_now(b.company_id))
            THEN 'return_today'::text
        WHEN public.get_company_now(b.company_id) > b.return_at
         AND b.status <> 'completed'::booking_status
            THEN 'overdue_return'::text
        ELSE NULL::text
    END AS ops_flag,

    -- ops_priority: sort order within each section (lower = more urgent)
    CASE
        WHEN public.get_company_now(b.company_id) > b.return_at
         AND b.status <> 'completed'::booking_status       THEN 1
        WHEN date(b.return_at) = date(public.get_company_now(b.company_id)) THEN 2
        WHEN date(b.pickup_at) = date(public.get_company_now(b.company_id)) THEN 3
        WHEN b.pickup_at > public.get_company_now(b.company_id)             THEN 4
        ELSE 5
    END AS ops_priority,

    -- is_overdue: true when return is past and booking not yet completed
    CASE
        WHEN public.get_company_now(b.company_id) > b.return_at
         AND b.status <> 'completed'::booking_status THEN true
        ELSE false
    END AS is_overdue,

    -- vehicle_blocked: operational hold flag (no date dependency)
    CASE
        WHEN v.operational_hold = true THEN true
        ELSE false
    END AS vehicle_blocked,

    -- checklist item counts (no date dependency)
    COALESCE(h.total_items,     0::bigint) AS handover_items_total,
    COALESCE(h.completed_items, 0::bigint) AS handover_items_done,
    COALESCE(r.total_items,     0::bigint) AS return_items_total,
    COALESCE(r.completed_items, 0::bigint) AS return_items_done,
    COALESCE(c.total_items,     0::bigint) AS cleaning_items_total,
    COALESCE(c.completed_items, 0::bigint) AS cleaning_items_done

FROM public.bookings b
LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
LEFT JOIN (
    SELECT ci.booking_id,
           count(items.id)                                AS total_items,
           count(*) FILTER (WHERE items.checked = true)  AS completed_items
    FROM   public.checklist_instances ci
    LEFT JOIN public.checklist_instance_items items ON items.instance_id = ci.id
    WHERE  ci.checklist_type = 'handover'::text
    GROUP BY ci.booking_id
) h ON h.booking_id = b.id
LEFT JOIN (
    SELECT ci.booking_id,
           count(items.id)                                AS total_items,
           count(*) FILTER (WHERE items.checked = true)  AS completed_items
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
