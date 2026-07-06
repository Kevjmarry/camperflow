-- Fix guest portal branding (logo, name, colors) being stale/broken.
--
-- get_guest_booking_by_code (migration 038) sourced name/logo_url/colors from
-- company_settings, but the staff company settings page (app/[locale]/staff/company/page.tsx)
-- writes branding updates to the companies table instead. The two rows are
-- never kept in sync, so any logo upload or rebrand done by staff never reached
-- guest-facing pages — company_settings kept whatever value it had at creation
-- time (NULL for companies onboarded before a logo existed, or a stale URL
-- after a re-upload). Source branding from companies, which staff writes and
-- ThemeContext already reads for the staff-side UI.

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
    c.name::TEXT           AS company_name,
    c.logo_url,
    c.primary_color::TEXT,
    c.secondary_color::TEXT,
    c.accent_color::TEXT,
    b.staff_metadata
  FROM public.bookings b
  JOIN public.companies c ON c.id = b.company_id
  WHERE b.booking_number = p_code;
$$;
