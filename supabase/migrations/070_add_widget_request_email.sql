-- Add reservation request email for the availability widget.
-- Widget enquiry emails are sent to this address if set; otherwise falls back to the company contact email.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS widget_request_email text DEFAULT NULL;
