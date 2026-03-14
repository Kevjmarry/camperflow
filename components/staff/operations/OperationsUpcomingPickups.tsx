'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { OpsUpcomingPickup } from '@/lib/staff/operations/getOpsUpcomingPickups'

interface Props {
  pickups: OpsUpcomingPickup[]
}

const nextActionLabels: Record<string, string> = {
  prepare_for_pickup: 'Preparing',
  start_handover: 'Start handover',
  await_return: 'Await return',
  start_return: 'Start return',
}

function formatNextAction(action: string | null | undefined): string {
  if (!action) return ''
  return nextActionLabels[action] ?? action
}

function formatHoursToPickup(hours: number | null | undefined): string {
  if (hours == null) return ''
  if (hours <= 24) return 'Today'
  if (hours <= 48) return 'Tomorrow'
  return `${Math.round(hours / 24)} days`
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
                {p.nextAction && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{formatNextAction(p.nextAction)}</span>
                )}
                {p.vehicleBlocked && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocked vehicle</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
                    {formatDate(p.pickupAt)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {formatTime(p.pickupAt)} · {formatHoursToPickup(p.hoursToPickup) || `in ${p.daysUntil}d`}
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
