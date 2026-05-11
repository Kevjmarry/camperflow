'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsInvoiceReminder } from '@/lib/staff/operations/getOpsInvoiceReminders'

interface Props {
  reminders: OpsInvoiceReminder[]
}

export default function OperationsInvoiceReminders({ reminders }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations.reminders')
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
      <style>{`
        /* ── Mobile card layout (<768px) ── */
        @media (max-width: 767px) {
          .ops-reminder-row {
            align-items: flex-start !important;
          }
          .ops-reminder-mid {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 3px !important;
          }
          /* Hide the standalone end-of-row timing on mobile */
          .ops-reminder-timing-desktop {
            display: none !important;
          }
          /* Show timing inlined inside the stacked middle block on mobile */
          .ops-reminder-timing-mobile {
            display: inline !important;
          }
          .ops-reminder-view {
            align-self: flex-start;
            margin-top: 1px;
          }
        }
        @media (min-width: 768px) {
          .ops-reminder-timing-mobile {
            display: none;
          }
        }
        .ops-reminder-row-link {
          display: flex;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
        }
        .ops-reminder-row-link:hover {
          background: rgb(var(--brand) / 0.04);
        }
      `}</style>

      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        {t('title')}
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
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('empty')}</p>
      ) : (
        <div style={{ border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {visible.map((r, idx) => {
            const isLoading = handling.has(r.id)
            const isCheckable = r.type !== 'review_imported'
            const bookingHref = `/${locale}/staff/bookings/${r.bookingId}#reminders`

            const rowStyle: React.CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              borderTop: idx > 0 ? '1px solid rgb(var(--border))' : undefined,
              opacity: isLoading ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }

            const timingLabel =
              r.type === 'return_prep' ? t('timing.returnTomorrow')
              : r.type === 'pre_arrival' ? t('timing.pickupTomorrow')
              : r.daysUntilPickup <= 0 ? t('timing.pickupToday')
              : r.daysUntilPickup === 1 ? t('timing.pickupTomorrow')
              : t('timing.pickupInDays', { count: r.daysUntilPickup })

            const inner = (
              <>
                <input
                  type="checkbox"
                  disabled={!isCheckable || isLoading}
                  onChange={isCheckable ? () => markHandled(r) : undefined}
                  style={{
                    cursor: isCheckable && !isLoading ? 'pointer' : 'default',
                    flexShrink: 0,
                    visibility: isCheckable ? 'visible' : 'hidden',
                    pointerEvents: isCheckable ? 'auto' : 'none',
                  }}
                  aria-hidden={!isCheckable}
                  aria-label={
                    r.type === 'balance_invoice'
                      ? 'Final payment received'
                      : `Mark ${r.bookingNumber} handled`
                  }
                />
                <div
                  className="ops-reminder-mid"
                  style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgb(var(--brand))', flexShrink: 0 }}>
                    {t(`type.${r.type}`)}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {r.vehicleName}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {r.customerName} · {r.bookingNumber}
                  </span>
                  {/* Timing shown here only on mobile */}
                  <span className="ops-reminder-timing-mobile" style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {timingLabel}
                  </span>
                </div>
                {/* Timing shown here only on desktop */}
                <span className="ops-reminder-timing-desktop" style={{ fontSize: '12px', color: 'rgb(var(--muted))', flexShrink: 0 }}>
                  {timingLabel}
                </span>
                {isCheckable && (
                  <Link
                    href={bookingHref}
                    className="ops-reminder-view"
                    style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none', flexShrink: 0 }}
                  >
                    {t('view')}
                  </Link>
                )}
              </>
            )

            return isCheckable ? (
              <div key={r.id} className="ops-reminder-row" style={rowStyle}>
                {inner}
              </div>
            ) : (
              <Link
                key={r.id}
                href={bookingHref}
                className="ops-reminder-row ops-reminder-row-link"
                style={rowStyle}
              >
                {inner}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
