-- Migration 072: Backfill CS placeholder into guest_content_i18n and update
--               default_guest_language constraint to include all active locales.
--
-- Part 1: Adds an empty CS slot to every company's guest_content_i18n JSONB.
--         Skipped (no-op) for any company that already has a CS key.
--         All other language values are never touched.
--
-- Part 2: Drops the old constraint on default_guest_language (which only
--         allowed 'en' and 'de') and replaces it with one that covers all
--         five active locales: en, de, sk, pl, cs.

BEGIN;

-- ── Part 1: backfill CS guest content ────────────────────────────────────────

UPDATE public.company_settings
SET
  guest_content_i18n = (
    COALESCE(guest_content_i18n, '{}'::jsonb)

    || CASE
         WHEN COALESCE(guest_content_i18n, '{}'::jsonb) ? 'CS'
         THEN '{}'::jsonb
         ELSE jsonb_build_object(
           'CS', jsonb_build_object(
             'before_arrival_info',     '',
             'pickup_info',             '',
             'important_before_pickup', '',
             'before_return_info',      '',
             'return_info',             '',
             'included_items',          '',
             'rules_and_tips',          '',
             'help_intro',              '',
             'help_quick_fixes',        '',
             'help_videos',             '',
             'faq_items',               '[]'::jsonb
           )
         )
       END
  ),
  updated_at = now();

-- ── Part 2: update default_guest_language constraint ─────────────────────────

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_default_guest_language_check;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_default_guest_language_check
    CHECK (default_guest_language IS NULL
        OR default_guest_language IN ('en', 'de', 'sk', 'pl', 'cs'));

-- Verify: show language keys now present per company
SELECT
  id,
  name,
  jsonb_object_keys(COALESCE(guest_content_i18n, '{}'::jsonb)) AS lang_key
FROM public.company_settings
ORDER BY id, lang_key;

COMMIT;
