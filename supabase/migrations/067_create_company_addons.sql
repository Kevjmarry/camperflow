-- Create company_addons table for tracking per-company addon state
create table public.company_addons (
  id               uuid        primary key default gen_random_uuid(),
  company_id       uuid        not null references public.companies(id) on delete cascade,
  addon_key        text        not null,
  enabled          boolean     not null default true,
  included_in_plan boolean     not null default true,
  activated_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (company_id, addon_key)
);

alter table public.company_addons enable row level security;

create policy "staff_read_company_addons" on public.company_addons
  for select
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.auth_user_id = auth.uid()
        and sp.company_id = company_addons.company_id
    )
  );

-- Seed every existing company with both addons enabled
insert into public.company_addons (company_id, addon_key, enabled, included_in_plan, activated_at)
select id, 'review_funnel', true, true, now()
from public.companies
on conflict (company_id, addon_key) do nothing;

insert into public.company_addons (company_id, addon_key, enabled, included_in_plan, activated_at)
select id, 'availability_widget', true, true, now()
from public.companies
on conflict (company_id, addon_key) do nothing;
