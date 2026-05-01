-- One-time script: fill EN and DE with TODO_TRANSLATE placeholders for Epic Vans.
--
-- Reads guest_content_i18n.SK and writes each text field as "TODO_TRANSLATE: <SK value>".
-- faq_items is copied from SK as-is so the translator has the source text.
--
-- SAFE to re-run:
--   - Only targets the Epic Vans row (name = 'Epic Vans').
--   - Skips EN entirely if ANY field in the current EN block is non-empty.
--   - Skips DE entirely if ANY field in the current DE block is non-empty.

DO $$
DECLARE
  v_i18n           jsonb;
  v_sk             jsonb;
  v_en_has_content boolean;
  v_de_has_content boolean;
  v_placeholder    jsonb;
BEGIN

  SELECT guest_content_i18n
  INTO   v_i18n
  FROM   public.company_settings
  WHERE  name = 'Epic Vans';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Epic Vans row not found in company_settings';
  END IF;

  IF v_i18n IS NULL OR NOT (v_i18n ? 'SK') THEN
    RAISE EXCEPTION 'SK locale is missing — run migration 033 first';
  END IF;

  v_sk := v_i18n -> 'SK';

  -- ── EN non-empty check ──────────────────────────────────────────────────────
  v_en_has_content := (v_i18n ? 'EN') AND (
    trim(COALESCE(v_i18n #>> '{EN,before_arrival_info}',     '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,pickup_info}',             '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,important_before_pickup}', '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,before_return_info}',      '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,return_info}',             '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,included_items}',          '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,rules_and_tips}',          '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,help_intro}',              '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,help_quick_fixes}',        '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{EN,help_videos}',             '')) <> '' OR
    jsonb_array_length(COALESCE(v_i18n -> 'EN' -> 'faq_items', '[]'::jsonb)) > 0
  );

  -- ── DE non-empty check ──────────────────────────────────────────────────────
  v_de_has_content := (v_i18n ? 'DE') AND (
    trim(COALESCE(v_i18n #>> '{DE,before_arrival_info}',     '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,pickup_info}',             '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,important_before_pickup}', '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,before_return_info}',      '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,return_info}',             '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,included_items}',          '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,rules_and_tips}',          '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,help_intro}',              '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,help_quick_fixes}',        '')) <> '' OR
    trim(COALESCE(v_i18n #>> '{DE,help_videos}',             '')) <> '' OR
    jsonb_array_length(COALESCE(v_i18n -> 'DE' -> 'faq_items', '[]'::jsonb)) > 0
  );

  -- ── Helper: build the placeholder object from SK ─────────────────────────
  -- Text fields get "TODO_TRANSLATE: <SK text>".
  -- faq_items is copied from SK verbatim (source text for the translator).
  v_placeholder := jsonb_build_object(
    'before_arrival_info',    'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{before_arrival_info}',     ''),
    'pickup_info',            'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{pickup_info}',             ''),
    'important_before_pickup','TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{important_before_pickup}', ''),
    'before_return_info',     'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{before_return_info}',      ''),
    'return_info',            'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{return_info}',             ''),
    'included_items',         'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{included_items}',          ''),
    'rules_and_tips',         'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{rules_and_tips}',          ''),
    'help_intro',             'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{help_intro}',              ''),
    'help_quick_fixes',       'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{help_quick_fixes}',        ''),
    'help_videos',            'TODO_TRANSLATE: ' || COALESCE(v_sk #>> '{help_videos}',             ''),
    'faq_items',              COALESCE(v_sk -> 'faq_items', '[]'::jsonb)
  );

  -- ── Write EN ────────────────────────────────────────────────────────────────
  IF v_en_has_content THEN
    RAISE NOTICE 'EN: SKIPPED — already contains non-empty content';
  ELSE
    UPDATE public.company_settings
    SET
      guest_content_i18n = guest_content_i18n || jsonb_build_object('EN', v_placeholder),
      updated_at = now()
    WHERE name = 'Epic Vans';
    RAISE NOTICE 'EN: wrote TODO_TRANSLATE placeholders';
  END IF;

  -- ── Write DE ────────────────────────────────────────────────────────────────
  IF v_de_has_content THEN
    RAISE NOTICE 'DE: SKIPPED — already contains non-empty content';
  ELSE
    UPDATE public.company_settings
    SET
      guest_content_i18n = guest_content_i18n || jsonb_build_object('DE', v_placeholder),
      updated_at = now()
    WHERE name = 'Epic Vans';
    RAISE NOTICE 'DE: wrote TODO_TRANSLATE placeholders';
  END IF;

END $$;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT
  name,
  lang,
  field_key,
  left(field_val, 100) AS value_preview
FROM public.company_settings,
  jsonb_each(COALESCE(guest_content_i18n, '{}'::jsonb))     AS l(lang, lang_obj),
  jsonb_each_text(lang_obj)                                  AS f(field_key, field_val)
WHERE name = 'Epic Vans'
  AND lang IN ('SK', 'EN', 'DE')
ORDER BY lang, field_key;
