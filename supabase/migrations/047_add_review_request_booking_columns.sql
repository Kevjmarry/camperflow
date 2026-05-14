ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS review_request_reminder_enabled boolean,
  ADD COLUMN IF NOT EXISTS review_request_whatsapp_sent    boolean;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS review_request_reminders_enabled boolean NOT NULL DEFAULT true;
