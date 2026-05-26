'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { locales, type Locale } from '@/i18n';

export default function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const segments = pathname.split('/');
  const currentLocale = segments[1];

  function switchLocale(newLocale: Locale) {
    if (currentLocale === newLocale) return;
    const nextPath = '/' + [newLocale, ...segments.slice(2)].join('/');
    // Preserve query string (e.g. ?code=... for guest flow)
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    startTransition(() => {
      router.push(qs ? `${nextPath}${qs}` : nextPath);
    });
  }

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          disabled={isPending || currentLocale === loc}
          style={{
            padding: '3px 8px',
            borderRadius: 'var(--radius)',
            border: '1px solid',
            borderColor: currentLocale === loc ? 'rgb(var(--brand))' : 'transparent',
            background: currentLocale === loc ? 'rgb(var(--brand) / 0.08)' : 'transparent',
            color: currentLocale === loc ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
            fontSize: '12px',
            fontWeight: currentLocale === loc ? 600 : 400,
            cursor: currentLocale === loc || isPending ? 'default' : 'pointer',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            opacity: isPending ? 0.6 : 1,
            lineHeight: '1.4',
          }}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
