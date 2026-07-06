-- Post-completion supplementary evidence photos (added via the staff checklist
-- activity log, migration 080's checklist_completion_activity table) never
-- reached the guest portal: get_guest_booking_by_code only ever selected
-- bookings.staff_metadata, and checklist_completion_activity has no RLS policy
-- for the anon/authenticated-guest path at all (its policies are `TO authenticated`
-- scoped by current_staff_company_id(), which is NULL for guest sessions).
--
-- Extend get_guest_booking_by_code with a supplementary_evidence_photos column,
-- aggregated via a SECURITY DEFINER join scoped strictly to the single booking
-- resolved by booking_number (ci.booking_id = b.id), matching the same
-- per-booking isolation the rest of the function already relies on. Only
-- kind = 'photo' rows are included (notes stay staff-only), and only
-- photo_group IN ('general', 'damage') — 'id' documents were never exposed to
-- guests via staff_metadata either, so supplementary evidence keeps the same
-- exposure surface.
--
-- The column list changes, so CREATE OR REPLACE is not valid here (Postgres
-- disallows changing a function's result columns that way); drop and recreate.

DROP FUNCTION IF EXISTS public.get_guest_booking_by_code(TEXT);

CREATE FUNCTION public.get_guest_booking_by_code(p_code TEXT)
RETURNS TABLE (
  status                        TEXT,
  vehicle_id                    UUID,
  booking_number                TEXT,
  pickup_at                     TIMESTAMPTZ,
  return_at                     TIMESTAMPTZ,
  notes                         TEXT,
  customer_name                 TEXT,
  customer_email                TEXT,
  customer_phone                TEXT,
  company_id                    UUID,
  company_name                  TEXT,
  logo_url                      TEXT,
  primary_color                 TEXT,
  secondary_color               TEXT,
  accent_color                  TEXT,
  staff_metadata                JSONB,
  supplementary_evidence_photos JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.status::TEXT,
    b.vehicle_id,
    b.booking_number::TEXT,
    b.pickup_at,
    b.return_at,
    b.notes,
    b.customer_name::TEXT,
    b.customer_email::TEXT,
    b.customer_phone::TEXT,
    b.company_id,
    c.name::TEXT           AS company_name,
    c.logo_url,
    c.primary_color::TEXT,
    c.secondary_color::TEXT,
    c.accent_color::TEXT,
    b.staff_metadata,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'checklist_type', ci.checklist_type,
            'photo_group',    a.photo_group,
            'photo_path',     a.photo_path,
            'created_at',     a.created_at
          )
          ORDER BY a.created_at
        )
        FROM public.checklist_completion_activity a
        JOIN public.checklist_instances ci ON ci.id = a.checklist_instance_id
        WHERE ci.booking_id = b.id
          AND a.kind = 'photo'
          AND a.photo_group IN ('general', 'damage')
      ),
      '[]'::jsonb
    ) AS supplementary_evidence_photos
  FROM public.bookings b
  JOIN public.companies c ON c.id = b.company_id
  WHERE b.booking_number = p_code;
$$;
