'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { OpsPickup } from '@/lib/staff/operations/getOpsPickupsToday'

interface Props {
  pickups: OpsPickup[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getUrgencyStyle(pickupAt: string): React.CSSProperties {
  const minutesUntilPickup = (new Date(pickupAt).getTime() - Date.now()) / 60000
  if (minutesUntilPickup <= 60) {
    return { border: '1px solid rgb(var(--danger))', background: 'rgb(var(--danger-light))' }
  }
  if (minutesUntilPickup <= 120) {
    return { border: '1px solid rgb(var(--warning))', background: 'rgb(var(--warning-light))' }
  }
  return { border: '1px solid rgb(var(--border))' }
}

export default function OperationsPickups({ pickups }: Props) {
  const { locale } = useParams<{ locale: string }>()

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        Pickups today
        <span
          style={{
            marginLeft: 'var(--space-3)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'rgb(var(--muted))',
            background: 'rgb(var(--brand-light))',
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          {pickups.length}
        </span>
      </h2>

      {pickups.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No pickups scheduled for today.</p>
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
                borderRadius: 'var(--radius)',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
                ...getUrgencyStyle(p.pickupAt),
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
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--brand))' }}>
                  {formatTime(p.pickupAt)}
                </span>
                {p.handoverStatus === 'completed' ? (
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>Ready for pickup</span>
                ) : p.checklistInstanceId ? (
                  <Link
                    href={`/${locale}/staff/checklists/${p.checklistInstanceId}`}
                    style={{ fontSize: '13px', color: 'rgb(var(--muted))', textDecoration: 'none' }}
                  >
                    {p.handoverStatus === 'in_progress' ? 'Continue handover' : 'Start handover'}
                  </Link>
                ) : (
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {p.handoverStatus === 'in_progress' ? 'Continue handover' : 'Start handover'}
                  </span>
                )}
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
