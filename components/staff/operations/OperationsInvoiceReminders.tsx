'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { OpsInvoiceReminder } from '@/lib/staff/operations/getOpsInvoiceReminders'

interface Props {
  reminders: OpsInvoiceReminder[]
}

const REMINDER_LABEL: Record<OpsInvoiceReminder['type'], string> = {
  balance_invoice: 'Send remaining 50% invoice',
  pre_arrival: 'Send pre-arrival WhatsApp',
  return_prep: 'Send return-prep WhatsApp',
}

function formatTiming(r: OpsInvoiceReminder): string {
  if (r.type === 'return_prep') return 'Return tomorrow'
  if (r.type === 'pre_arrival') return 'Pickup tomorrow'
  if (r.daysUntilPickup <= 0) return 'Pickup today'
  if (r.daysUntilPickup === 1) return 'Pickup tomorrow'
  return `Pickup in ${r.daysUntilPickup}d`
}

export default function OperationsInvoiceReminders({ reminders }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const [visible, setVisible] = useState<OpsInvoiceReminder[]>(reminders)
  const [handling, setHandling] = useState<Set<string>>(new Set())

  const markHandled = async (r: OpsInvoiceReminder) => {
    setHandling((prev) => new Set(prev).add(r.id))
    try {
      const res = await fetch(`/api/staff/bookings/${r.bookingId}/mark-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: r.type }),
      })
      if (res.ok) {
        setVisible((prev) => prev.filter((x) => x.id !== r.id))
      }
    } finally {
      setHandling((prev) => {
        const next = new Set(prev)
        next.delete(r.id)
        return next
      })
    }
  }

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        Reminders
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
          {visible.length}
        </span>
      </h2>

      {visible.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No reminders pending.</p>
      ) : (
        <div style={{ border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {visible.map((r, idx) => {
            const isLoading = handling.has(r.id)
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderTop: idx > 0 ? '1px solid rgb(var(--border))' : undefined,
                  opacity: isLoading ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  disabled={isLoading}
                  onChange={() => markHandled(r)}
                  style={{ cursor: isLoading ? 'default' : 'pointer', flexShrink: 0 }}
                  aria-label={`Mark ${r.bookingNumber} handled`}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgb(var(--brand))', flexShrink: 0 }}>
                    {REMINDER_LABEL[r.type]}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {r.vehicleName}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {r.customerName} · {r.bookingNumber}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', flexShrink: 0 }}>
                  {formatTiming(r)}
                </span>
                <Link
                  href={`/${locale}/staff/bookings/${r.bookingId}`}
                  style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none', flexShrink: 0 }}
                >
                  View
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
