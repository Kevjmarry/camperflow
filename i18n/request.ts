import { getRequestConfig } from 'next-intl/server';

const locales = ['en', 'de'] as const;
type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  const locale: Locale =
    requested && locales.includes(requested as Locale)
      ? (requested as Locale)
      : 'en';

  const messages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
