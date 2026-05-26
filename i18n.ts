/**
 * i18n Configuration for CamperFlow
 *
 * activeLocales  – live, routable, visible in the UI switcher
 * plannedLocales – approved for future waves; not yet routable or visible
 *
 * To launch a planned locale: move it into activeLocales, add its
 * messages file, and update the DB constraint in company_settings.
 */

// ── Active (live) ──────────────────────────────────────────────────────────────
export const activeLocales = ['en', 'de', 'sk'] as const;
export type Locale = (typeof activeLocales)[number];
export const defaultLocale: Locale = 'en';

/** Alias kept for backward compatibility with all existing imports. */
export const locales = activeLocales;

export const localeNames: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  sk: 'Slovenčina',
};

// ── Planned (not yet live) ─────────────────────────────────────────────────────
export const plannedLocales = [
  'pl', 'hu', 'cs', 'hr', 'sl',
  'it', 'es', 'et', 'lv', 'lt',
  'nl', 'fr',
] as const;
export type PlannedLocale = (typeof plannedLocales)[number];

export const plannedLocaleNames: Record<PlannedLocale, string> = {
  pl: 'Polski',
  hu: 'Magyar',
  cs: 'Čeština',
  hr: 'Hrvatski',
  sl: 'Slovenščina',
  it: 'Italiano',
  es: 'Español',
  et: 'Eesti',
  lv: 'Latviešu',
  lt: 'Lietuvių',
  nl: 'Nederlands',
  fr: 'Français',
};