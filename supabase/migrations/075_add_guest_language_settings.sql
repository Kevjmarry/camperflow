-- guest_languages_order: ordered array of locale codes (lowercase) that are
-- enabled in the guest portal language switcher. Absent from the array = disabled.
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS guest_languages_order TEXT[] DEFAULT ARRAY['sk','en','de','pl','cs'];

-- Backfill existing rows (column default only applies to INSERT, not existing rows)
UPDATE company_settings
SET guest_languages_order = ARRAY['sk','en','de','pl','cs']
WHERE guest_languages_order IS NULL;
