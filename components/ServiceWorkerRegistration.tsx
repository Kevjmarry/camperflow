'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      console.log('[SW] not supported in this browser');
      return;
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[SW] registered, scope:', reg.scope))
      .catch((err) => console.error('[SW] registration failed:', err));
  }, []);

  return null;
}
