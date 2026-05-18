-- Migration 032a: Add guest content columns to company_settings
--
-- Sorts after 032_add_return_nearby_places.sql and before
-- 033_backfill_guest_content_i18n.sql, which reads all these columns.
-- Migrations 034-036 also read/write guest_content_i18n.
--
-- All columns are nullable: callers use COALESCE(..., '') or COALESCE(..., '{}'::jsonb).
-- before_return_info is excluded — migration 029 adds it.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS before_arrival_info     TEXT,
  ADD COLUMN IF NOT EXISTS pickup_info             TEXT,
  ADD COLUMN IF NOT EXISTS important_before_pickup TEXT,
  ADD COLUMN IF NOT EXISTS return_info             TEXT,
  ADD COLUMN IF NOT EXISTS included_items          TEXT,
  ADD COLUMN IF NOT EXISTS rules_and_tips          TEXT,
  ADD COLUMN IF NOT EXISTS help_intro              TEXT,
  ADD COLUMN IF NOT EXISTS help_quick_fixes        TEXT,
  ADD COLUMN IF NOT EXISTS help_videos             TEXT,
  ADD COLUMN IF NOT EXISTS faq_items               JSONB,
  ADD COLUMN IF NOT EXISTS guest_content_i18n      JSONB;
