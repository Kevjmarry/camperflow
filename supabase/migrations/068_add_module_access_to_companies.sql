-- Add per-company module access flags.
-- Both default to true so all existing companies keep full access.
alter table public.companies
  add column if not exists core_operations_access boolean not null default true,
  add column if not exists review_funnel_access   boolean not null default true;
