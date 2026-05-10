/**
 * i18n Configuration for CamperFlow
 * 
 * This app uses next-intl without middleware for locale management.
 * Locale detection is handled via cookies and browser Accept-Language headers.
 * See lib/locale.ts for the detection logic.
 */

export const locales = ['en', 'de', 'sk'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  sk: 'Slovenčina',
};