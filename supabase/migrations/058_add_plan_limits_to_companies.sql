ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS included_vehicles        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_staff           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_extra_vehicles       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_extra_staff          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_extra_vehicles integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_extra_staff    integer NOT NULL DEFAULT 0;
