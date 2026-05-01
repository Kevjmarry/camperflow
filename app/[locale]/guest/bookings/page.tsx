'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface PageProps {
  params: { locale: string }
}

export default function GuestBookingsPage({ params }: PageProps) {
  const t = useTranslations('guestBookings')
  const searchParams = useSearchParams()
  const code = searchParams.get('code')

  useEffect(() => {
    if (code) {
      window.location.href = `/${params.locale}/guest/bookings/${code}`
    }
  }, [code, params.locale])

  if (code) {
    return (
      <div className="surface" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <p style={{ color: 'rgb(var(--muted))' }}>
          {t('redirecting')}
        </p>
      </div>
    )
  }

  return (
    <div className="surface" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: 'rgb(var(--text))', marginBottom: 'var(--space-4)' }}>
          {t('bookingLookup')}
        </h1>
        <p style={{ color: 'rgb(var(--muted))', marginBottom: 'var(--space-6)', lineHeight: '1.5' }}>
          {t('incompleteLinkMessage')}
        </p>
        <p style={{ fontSize: '0.875rem', color: 'rgb(var(--muted))' }}>
          {t('instructionMessage')}
        </p>
    </div>
  )
}