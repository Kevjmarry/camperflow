-- Migration 066: Backfill PL placeholder into guest_content_i18n
--
-- Adds an empty PL slot to every company's guest_content_i18n JSONB.
-- Skipped (no-op) for any company that already has a PL key.
-- EN, DE, and SK values are never touched.

BEGIN;

UPDATE public.company_settings
SET
  guest_content_i18n = (
    COALESCE(guest_content_i18n, '{}'::jsonb)

    || CASE
         WHEN COALESCE(guest_content_i18n, '{}'::jsonb) ? 'PL'
         THEN '{}'::jsonb
         ELSE jsonb_build_object(
           'PL', jsonb_build_object(
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

-- Verify: show language keys now present per company
SELECT
  id,
  name,
  jsonb_object_keys(COALESCE(guest_content_i18n, '{}'::jsonb)) AS lang_key
FROM public.company_settings
ORDER BY id, lang_key;

COMMIT;
