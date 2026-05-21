ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status    text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_plan      text;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_subscription_status_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN ('none', 'trialing', 'active', 'past_due', 'cancelled'));

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_stripe_customer_id_key;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_stripe_customer_id_key
    UNIQUE (stripe_customer_id);

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_stripe_subscription_id_key;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_stripe_subscription_id_key
    UNIQUE (stripe_subscription_id);
