-- Migration 033: Backfill guest_content_i18n from legacy SK flat columns
--
-- What this does:
--   SK  → always populated from the existing legacy flat columns
--   EN  → empty placeholder inserted only if the key is absent
--   DE  → empty placeholder inserted only if the key is absent
--
-- Run once. Safe to re-run: SK is always overwritten from source columns,
-- EN/DE are left untouched if they already exist.

BEGIN;

UPDATE public.company_settings
SET
  guest_content_i18n = (
    -- Base: existing i18n blob (or empty object)
    COALESCE(guest_content_i18n, '{}'::jsonb)

    -- SK: overwrite with legacy flat-column values
    || jsonb_build_object(
      'SK', jsonb_build_object(
        'before_arrival_info',    COALESCE(before_arrival_info,    ''),
        'pickup_info',            COALESCE(pickup_info,            ''),
        'important_before_pickup',COALESCE(important_before_pickup,''),
        'before_return_info',     COALESCE(before_return_info,     ''),
        'return_info',            COALESCE(return_info,            ''),
        'included_items',         COALESCE(included_items,         ''),
        'rules_and_tips',         COALESCE(rules_and_tips,         ''),
        'help_intro',             COALESCE(help_intro,             ''),
        'help_quick_fixes',       COALESCE(help_quick_fixes,       ''),
        'help_videos',            COALESCE(help_videos,            ''),
        'faq_items',              COALESCE(faq_items,              '[]'::jsonb)
      )
    )

    -- EN: insert empty placeholder only if key is absent
    || CASE
         WHEN COALESCE(guest_content_i18n, '{}'::jsonb) ? 'EN'
         THEN '{}'::jsonb
         ELSE jsonb_build_object(
           'EN', jsonb_build_object(
             'before_arrival_info',    '',
             'pickup_info',            '',
             'important_before_pickup','',
             'before_return_info',     '',
             'return_info',            '',
             'included_items',         '',
             'rules_and_tips',         '',
             'help_intro',             '',
             'help_quick_fixes',       '',
             'help_videos',            '',
             'faq_items',              '[]'::jsonb
           )
         )
       END

    -- DE: insert empty placeholder only if key is absent
    || CASE
         WHEN COALESCE(guest_content_i18n, '{}'::jsonb) ? 'DE'
         THEN '{}'::jsonb
         ELSE jsonb_build_object(
           'DE', jsonb_build_object(
             'before_arrival_info',    '',
             'pickup_info',            '',
             'important_before_pickup','',
             'before_return_info',     '',
             'return_info',            '',
             'included_items',         '',
             'rules_and_tips',         '',
             'help_intro',             '',
             'help_quick_fixes',       '',
             'help_videos',            '',
             'faq_items',              '[]'::jsonb
           )
         )
       END
  ),
  updated_at = now();

-- Verify: show the language keys now present per company
SELECT
  id,
  name,
  jsonb_object_keys(COALESCE(guest_content_i18n, '{}'::jsonb)) AS lang_key
FROM public.company_settings
ORDER BY id, lang_key;

COMMIT;
