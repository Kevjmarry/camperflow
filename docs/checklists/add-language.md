# Checklist: Activating a Planned Locale

Pick a code from `plannedLocales` in [i18n.ts](../../i18n.ts) and follow every step below.
Steps marked **auto** require no manual code change — they are driven by `activeLocales`.

---

## 1 — Update `i18n.ts` (one file, three edits)

- [ ] Move the locale code from `plannedLocales` to `activeLocales`
- [ ] Move its entry from `plannedLocaleNames` to `localeNames`
- [ ] Remove the code and name from `plannedLocales` / `plannedLocaleNames`

Everything that imports `locales` (`activeLocales`) picks up the new locale automatically:
routing guard, locale switchers, guest redirect validation, company extras tabs,
booking guest-locale validation, cookie action — **all auto**.

---

## 2 — Create the message file

- [ ] Copy `messages/en.json` to `messages/[locale].json`
- [ ] Translate all values (do not change any key names)
- [ ] Run `npm run check:i18n` — must pass with zero errors before continuing

---

## 3 — Database migration

The `default_guest_language` column has a CHECK constraint that lists allowed values.
Create a new migration (next number in `supabase/migrations/`):

```sql
ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_default_guest_language_check,
  ADD CONSTRAINT company_settings_default_guest_language_check
    CHECK (default_guest_language IS NULL
        OR default_guest_language IN ('en', 'de', 'sk', '[locale]'));
```

Replace `[locale]` with the actual code and include all previously active locales.

> **Note:** The current constraint only covers `('en', 'de')` — SK was never added.
> Fix this at the same time as your first new locale addition.

- [ ] Migration file created and deployed

---

## 4 — Guest content editor (LANGS array)

The guest content editor stores content in a JSONB column with **uppercase** locale keys
(`EN`, `DE`, `SK`). This is a separate namespace from the URL locale codes.

File: [`app/[locale]/staff/guest-content/page.tsx`](../../app/[locale]/staff/guest-content/page.tsx)

- [ ] Add the uppercase code to `LANGS` (e.g. `"PL"`)
- [ ] Add an entry in `makeEmptyI18nRecord()`:
  ```ts
  [UPPERCASE_CODE]: { ...EMPTY_I18N, faq_items: [] },
  ```

---

## 5 — Extras catalog translations (only if supporting translated extras names)

File: [`contexts/ThemeContext.tsx`](../../contexts/ThemeContext.tsx)

The `ExtraCatalogItem.name_i18n` type mirrors a DB JSONB schema:
`{ en: string; de: string; sk: string }`.

- [ ] Add the new locale key to the type: `{ en: string; de: string; sk: string; [locale]: string }`
- [ ] Add a DB migration to seed the new key into existing rows
- [ ] Update the "new item" template in `app/[locale]/staff/company/page.tsx`:
  `{ ..., name_i18n: { en: "", de: "", sk: "", [locale]: "" } }`

Skip this step if extras catalog translations are not needed for the new locale yet.

---

## 6 — Verify

- [ ] `npm run check:i18n` — passes
- [ ] `npm run build` — no TypeScript errors
- [ ] Locale switcher shows the new language button
- [ ] `/[locale]/guest?code=...` resolves correctly
- [ ] Company settings can save `default_guest_language = '[locale]'`
- [ ] Guest content page shows the new language tab
- [ ] Test at least one guest-facing page in the new language

---

## Adding the next planned locale

Repeat from step 1 with the next code in `plannedLocales`.
The full list of planned locales is in [i18n.ts](../../i18n.ts).
