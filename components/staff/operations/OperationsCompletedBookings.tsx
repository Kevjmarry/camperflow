'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsCompletedBooking } from '@/lib/staff/operations/getOpsCompletedBookings'

interface Props {
  bookings: OpsCompletedBooking[]
}

const LIMIT = 5

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function OperationsCompletedBookings({ bookings }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations.completedBookings')
  const tOps = useTranslations('staff.operations')
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? bookings : bookings.slice(0, LIMIT)
  const hidden = bookings.length - LIMIT

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-4)',
        }}
      >
        <h2 style={{ fontSize: '18px', margin: 0, color: 'rgb(var(--text))' }}>
          {t('title')}
        </h2>
        <Link
          href={`/${locale}/staff/bookings`}
          style={{ fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
        >
          {t('viewAll')}
        </Link>
      </div>

      {bookings.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('empty')}</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {visible.map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-3)',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  gap: 'var(--space-4)',
                  flexWrap: 'wrap',
                  opacity: 0.8,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {b.vehicleName}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {b.customerName} · {b.bookingNumber}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {t('returnedOn', { date: formatDate(b.returnAt) })}
                  </span>
                  <Link
                    href={`/${locale}/staff/bookings/${b.id}`}
                    style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                  >
                    {t('view')}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {bookings.length > LIMIT && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'rgb(var(--brand))',
                padding: 'var(--space-3) 0 0',
                textAlign: 'left',
              }}
            >
              {expanded ? tOps('showLess') : tOps('showMore', { count: hidden })}
            </button>
          )}
        </>
      )}
    </div>
  )
}
