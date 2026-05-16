CREATE TABLE IF NOT EXISTS public.guest_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text       NOT NULL,
  company_id  uuid        REFERENCES public.companies(id),
  message     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_feedback ENABLE ROW LEVEL SECURITY;
