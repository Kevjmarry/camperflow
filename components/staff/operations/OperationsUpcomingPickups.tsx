'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { OpsUpcomingPickup } from '@/lib/staff/operations/getOpsUpcomingPickups'

interface Props {
  pickups: OpsUpcomingPickup[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function OperationsUpcomingPickups({ pickups }: Props) {
  const { locale } = useParams<{ locale: string }>()

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
          Upcoming pickups
        </h2>
        <Link
          href={`/${locale}/staff/bookings`}
          style={{ fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
        >
          View all
        </Link>
      </div>

      {pickups.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No upcoming pickups.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {pickups.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3)',
                border: '1px solid rgb(var(--border))',
                borderRadius: 'var(--radius)',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {p.vehicleName}
                </span>
                <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                  {p.customerName} · {p.bookingNumber}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
                    {formatDate(p.pickupAt)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {formatTime(p.pickupAt)} · in {p.daysUntil}d
                  </div>
                </div>
                <Link
                  href={`/${locale}/staff/bookings/${p.id}`}
                  style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
