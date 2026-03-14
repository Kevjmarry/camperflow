'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { OpsReturn } from '@/lib/staff/operations/getOpsReturnsToday'

interface Props {
  returns: OpsReturn[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getUrgencyStyle(returnAt: string): React.CSSProperties {
  const minutesUntilReturn = (new Date(returnAt).getTime() - Date.now()) / 60000
  if (minutesUntilReturn <= 0) {
    return {
      border: '1px solid rgb(var(--danger))',
      background: 'rgb(var(--danger-light))',
    }
  }
  if (minutesUntilReturn <= 60) {
    return {
      border: '1px solid rgb(var(--warning))',
      background: 'rgb(var(--warning-light))',
    }
  }
  return {
    border: '1px solid rgb(var(--border))',
  }
}

export default function OperationsReturns({ returns }: Props) {
  const { locale } = useParams<{ locale: string }>()

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        Returns today
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
          {returns.length}
        </span>
      </h2>

      {returns.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No returns scheduled for today.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {returns.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius)',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
                ...getUrgencyStyle(r.returnAt),
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {r.vehicleName}
                </span>
                <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                  {r.customerName} · {r.bookingNumber}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--brand))' }}>
                  {formatTime(r.returnAt)}
                </span>
                <Link
                  href={`/${locale}/staff/bookings/${r.id}`}
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
