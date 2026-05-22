ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS over_limit boolean NOT NULL DEFAULT false;
