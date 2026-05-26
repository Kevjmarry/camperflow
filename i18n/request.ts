import { getRequestConfig } from 'next-intl/server';
import { locales, type Locale, defaultLocale } from '../i18n';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  const locale: Locale =
    requested && locales.includes(requested as Locale)
      ? (requested as Locale)
      : defaultLocale;

  const messages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
