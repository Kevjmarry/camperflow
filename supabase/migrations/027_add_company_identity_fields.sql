-- Add company identity fields used by evidence/PDF reports
alter table companies
  add column if not exists address      text,
  add column if not exists email        text,
  add column if not exists registration_id text,
  add column if not exists vat_id       text;
