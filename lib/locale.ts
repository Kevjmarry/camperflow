import { cookies, headers } from 'next/headers';

export const locales = ['en', 'de'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/**
 * Detects the user's preferred locale based on:
 * 1. Cookie (if previously set by user)
 * 2. Accept-Language header (browser preference)
 * 3. Default locale (en)
 *
 * @returns Promise<Locale> - The detected locale
 */
export async function getLocale(): Promise<Locale> {
  try {
    // 1. Check cookie first (user's explicit choice)
    // In Next.js 15+, cookies() returns a Promise
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
    
    if (cookieLocale && locales.includes(cookieLocale as Locale)) {
      return cookieLocale as Locale;
    }

    // 2. Check Accept-Language header (browser preference)
    // In Next.js 15+, headers() returns a Promise
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');
    
    if (acceptLanguage) {
      const detectedLocale = parseAcceptLanguage(acceptLanguage);
      if (detectedLocale) {
        return detectedLocale;
      }
    }
  } catch (error) {
    console.error('Error detecting locale:', error);
  }

  // 3. Default to English
  return defaultLocale;
}

/**
 * Parse Accept-Language header to extract preferred locale
 * @param acceptLanguage - The Accept-Language header value
 * @returns Locale | null - The detected locale or null if no match
 */
function parseAcceptLanguage(acceptLanguage: string): Locale | null {
  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,de;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [code, priority] = lang.split(';');
      return {
        code: code.trim().toLowerCase(),
        priority: priority ? parseFloat(priority.split('=')[1]) : 1.0,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  for (const { code } of languages) {
    // Check exact match or language prefix (e.g., "en-US" -> "en")
    const langPrefix = code.split('-')[0] as Locale;
    if (locales.includes(langPrefix)) {
      return langPrefix;
    }
  }

  return null;
}

/**
 * Load translation messages for a given locale
 * @param locale - The locale to load messages for
 * @returns Promise<object> - The translation messages
 */
export async function getMessages(locale: Locale): Promise<Record<string, any>> {
  try {
    // Dynamic import with proper path resolution - FIXED SYNTAX
    const messages = await import(`../messages/${locale}.json`);
    return messages.default || messages;
  } catch (error) {
    console.error(`Failed to load messages for locale "${locale}":`, error);
    
    // Fallback to default locale if not already using it
    if (locale !== defaultLocale) {
      try {
        const fallbackMessages = await import(`../messages/${defaultLocale}.json`);
        return fallbackMessages.default || fallbackMessages;
      } catch (fallbackError) {
        console.error(`Failed to load fallback messages for "${defaultLocale}":`, fallbackError);
      }
    }
    
    return {};
  }
}