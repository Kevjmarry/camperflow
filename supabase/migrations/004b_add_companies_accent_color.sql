-- Migration 004b: Add accent_color to companies
--
-- Sorts after 004a_create_core_tables.sql and before
-- 005_fix_epicvans_accent_color.sql, which UPDATEs companies.accent_color.
-- No numbered migration adds this column; it was created out-of-band.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7);
