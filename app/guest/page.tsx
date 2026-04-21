import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const VALID_LOCALES = ['en', 'de'] as const;
type GuestLocale = (typeof VALID_LOCALES)[number];
const GUEST_FALLBACK_LOCALE: GuestLocale = 'de';

interface BookingCompany {
  company_id: string | null;
}

export default async function GuestRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || '').trim();

  let locale: GuestLocale = GUEST_FALLBACK_LOCALE;

  if (code) {
    try {
      const supabase = await createClient();

      const { data: booking } = await supabase
        .rpc('get_guest_booking_by_code', { p_code: code })
        .maybeSingle<BookingCompany>();

      if (booking?.company_id) {
        const { data: settings } = await supabase
          .from('company_settings')
          .select('default_guest_language')
          .eq('id', booking.company_id)
          .single();

        const lang = settings?.default_guest_language;
        if (lang && (VALID_LOCALES as readonly string[]).includes(lang)) {
          locale = lang as GuestLocale;
        }
      }
    } catch {
      // Use fallback locale
    }
  }

  redirect(code ? `/${locale}/guest?code=${code}` : `/${locale}/guest`);
}
