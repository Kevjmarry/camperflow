import {getRequestConfig} from 'next-intl/server';

export const locales = ['en', 'de'] as const;
export const defaultLocale = 'en';

export default getRequestConfig(async ({locale}) => {
  const activeLocale = locale || defaultLocale;
  const messages = (await import(`./messages/${activeLocale}.json`)).default;

  return {
    locale: activeLocale,
    messages
  };
});
