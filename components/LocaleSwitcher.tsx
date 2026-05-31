'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition, useState, useRef, useEffect } from 'react';
import { activeLocales, localeNames, type Locale } from '@/i18n';

export default function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const segments = pathname.split('/');
  const currentLocale = segments[1] as Locale;

  function switchLocale(newLocale: Locale) {
    if (currentLocale === newLocale) return;
    const nextPath = '/' + [newLocale, ...segments.slice(2)].join('/');
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    setOpen(false);
    startTransition(() => {
      router.push(qs ? `${nextPath}${qs}` : nextPath);
    });
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        style={{
          padding: '3px 8px',
          borderRadius: 'var(--radius)',
          border: '1px solid',
          borderColor: open ? 'rgb(var(--brand))' : 'rgb(var(--border))',
          background: open ? 'rgb(var(--brand) / 0.08)' : 'transparent',
          color: open ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
          fontSize: '12px',
          fontWeight: 600,
          cursor: isPending ? 'default' : 'pointer',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          opacity: isPending ? 0.6 : 1,
          lineHeight: '1.4',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {currentLocale}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path
            d={open ? 'M2 7l3-4 3 4' : 'M2 3l3 4 3-4'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 'var(--radius)',
            boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
            zIndex: 50,
            minWidth: '140px',
            padding: '4px',
          }}
        >
          {activeLocales.map((loc) => (
            <button
              key={loc}
              onClick={() => switchLocale(loc)}
              disabled={isPending}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: currentLocale === loc ? 'rgb(var(--brand) / 0.08)' : 'transparent',
                color: currentLocale === loc ? 'rgb(var(--brand))' : 'rgb(var(--foreground))',
                fontSize: '13px',
                fontWeight: currentLocale === loc ? 600 : 400,
                cursor: currentLocale === loc ? 'default' : 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'rgb(var(--muted))',
                  minWidth: '22px',
                }}
              >
                {loc}
              </span>
              {localeNames[loc]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
