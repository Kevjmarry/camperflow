'use server';

import { cookies } from 'next/headers';
import { locales, type Locale } from '@/lib/locale';

/**
 * Server action to set the locale preference cookie
 * @param locale - The locale to set (must be a valid locale from the locales array)
 * @throws Error if the locale is invalid
 */
export async function setLocaleCookie(locale: Locale): Promise<void> {
  // Validate locale
  if (!locales.includes(locale)) {
    throw new Error(`Invalid locale: ${locale}. Must be one of: ${locales.join(', ')}`);
  }

  try {
    // In Next.js 15+, cookies() returns a Promise
    const cookieStore = await cookies();
    
    // Set the locale cookie with appropriate options
    cookieStore.set('NEXT_LOCALE', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production', // Secure in production
    });
  } catch (error) {
    console.error('Failed to set locale cookie:', error);
    throw new Error('Failed to set locale preference');
  }
}

/**
 * Server action to clear the locale preference cookie
 * This will cause the app to fall back to browser language detection
 */
export async function clearLocaleCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('NEXT_LOCALE');
  } catch (error) {
    console.error('Failed to clear locale cookie:', error);
    throw new Error('Failed to clear locale preference');
  }
}