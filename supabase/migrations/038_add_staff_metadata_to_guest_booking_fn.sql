-- Add b.staff_metadata to get_guest_booking_by_code so guest pages can read
-- checklist evidence photos. No filters or joins changed.

CREATE OR REPLACE FUNCTION public.get_guest_booking_by_code(p_code TEXT)
RETURNS TABLE (
  status            TEXT,
  vehicle_id        UUID,
  booking_number    TEXT,
  pickup_at         TIMESTAMPTZ,
  return_at         TIMESTAMPTZ,
  notes             TEXT,
  customer_name     TEXT,
  customer_email    TEXT,
  customer_phone    TEXT,
  company_id        UUID,
  company_name      TEXT,
  logo_url          TEXT,
  primary_color     TEXT,
  secondary_color   TEXT,
  accent_color      TEXT,
  staff_metadata    JSONB
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
    cs.name::TEXT          AS company_name,
    cs.logo_url,
    cs.primary_color::TEXT,
    cs.secondary_color::TEXT,
    cs.accent_color::TEXT,
    b.staff_metadata
  FROM public.bookings b
  JOIN public.company_settings cs ON cs.id = b.company_id
  WHERE b.booking_number = p_code;
$$;
