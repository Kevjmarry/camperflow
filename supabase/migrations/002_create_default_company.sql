-- Create companies table if it doesn't exist
create table if not exists public.companies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- Insert default company for v1
insert into public.companies (id, name)
values (
  '00000000-0000-0000-0000-000000000001',
  'Default company'
)
on conflict (id) do nothing;
