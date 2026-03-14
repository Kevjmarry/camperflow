'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { OpsInvoiceReminder } from '@/lib/staff/operations/getOpsInvoiceReminders'

interface Props {
  reminders: OpsInvoiceReminder[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function formatDaysUntilDue(days: number): string {
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'in 1d'
  return `in ${days}d`
}

function getUrgencyStyle(daysUntilDue: number): React.CSSProperties {
  if (daysUntilDue < 0) {
    return {
      border: '1px solid rgb(var(--danger))',
      background: 'rgb(var(--danger-light))',
    }
  }
  if (daysUntilDue <= 2) {
    return {
      border: '1px solid rgb(var(--warning))',
      background: 'rgb(var(--warning-light))',
    }
  }
  return {
    border: '1px solid rgb(var(--border))',
  }
}

export default function OperationsInvoiceReminders({ reminders }: Props) {
  const { locale } = useParams<{ locale: string }>()

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        Final invoice reminders
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
          {reminders.length}
        </span>
      </h2>

      {reminders.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No final invoices pending.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {reminders.map((r) => (
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
                ...getUrgencyStyle(r.daysUntilDue),
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
                <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                  Due {formatDate(r.dueAt)} · {formatDaysUntilDue(r.daysUntilDue)}
                </span>
                <Link
                  href={`/${locale}/staff/bookings/${r.bookingId}`}
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
