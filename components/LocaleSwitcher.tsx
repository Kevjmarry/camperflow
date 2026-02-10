'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const segments = pathname.split('/');
  const currentLocale = segments[1];

  function switchLocale(newLocale: 'en' | 'de') {
    if (currentLocale === newLocale) return;

    const nextPath = '/' + [newLocale, ...segments.slice(2)].join('/');

    startTransition(() => {
      router.push(nextPath);
    });
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={() => switchLocale('en')}
        disabled={isPending || currentLocale === 'en'}
      >
        EN
      </button>
      <button
        onClick={() => switchLocale('de')}
        disabled={isPending || currentLocale === 'de'}
      >
        DE
      </button>
    </div>
  );
}
