'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsOnRentRow } from '@/lib/staff/operations/getOpsOnRentNow'

interface Props {
  rows: OpsOnRentRow[]
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatDateShort(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const todayStr = now.toDateString()
  const tomorrowStr = new Date(now.getTime() + 86_400_000).toDateString()
  if (d.toDateString() === todayStr) return 'Today'
  if (d.toDateString() === tomorrowStr) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** e.g. "Apr 2, 10:00 (in 6 days)" or "Today, 18:00 (in 4h)" */
function formatComingBack(returnAt: string, isOverdue: boolean): { main: string; overdueFlag: boolean } {
  const returnMs = new Date(returnAt).getTime()
  const nowMs = Date.now()
  const diffMs = returnMs - nowMs

  const dateLabel = formatDateShort(returnAt)
  const timeLabel = formatTime(returnAt)
  const absDiffMs = Math.abs(diffMs)
  const absDiffH = Math.round(absDiffMs / (1000 * 60 * 60))
  const absDiffD = Math.round(absDiffMs / (1000 * 60 * 60 * 24))

  let relLabel: string
  if (isOverdue) {
    relLabel = absDiffH < 24 ? `${absDiffH}h ago` : `${absDiffD}d ago`
  } else {
    relLabel = absDiffH < 24 ? `in ${absDiffH}h` : `in ${absDiffD}d`
  }

  return { main: `${dateLabel}, ${timeLabel} (${relLabel})`, overdueFlag: isOverdue }
}

/** Format prep window duration */
function formatPrepWindow(prepWindowMs: number): string {
  const hours = prepWindowMs / (1000 * 60 * 60)
  if (hours < 1) return 'Same day'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

// ── Severity chip ─────────────────────────────────────────────────────────────

function SeverityChip({
  severity,
  label,
}: {
  severity: 'short' | 'medium' | 'comfortable'
  label: string
}) {
  const styleMap: Record<'short' | 'medium' | 'comfortable', React.CSSProperties> = {
    short: {
      color: 'rgb(var(--danger))',
      background: 'rgb(var(--danger) / 0.15)',
      border: '1.5px solid rgb(var(--danger))',
    },
    medium: {
      color: 'rgb(var(--warning))',
      background: 'rgb(var(--warning) / 0.14)',
      border: '1px solid rgb(var(--warning) / 0.28)',
    },
    comfortable: {
      color: 'rgb(var(--success))',
      background: 'rgb(var(--success) / 0.12)',
      border: '1px solid rgb(var(--success) / 0.3)',
    },
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        fontSize: '11px',
        fontWeight: 500,
        borderRadius: '4px',
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...styleMap[severity],
      }}
    >
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function OperationsOnRentNow({ rows }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations.onRentNow')

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
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {rows.map((r) => {
            const comingBack = formatComingBack(r.returnAt, r.isOverdue)
            return (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
                  alignItems: 'center',
                  padding: 'var(--space-3)',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  gap: 'var(--space-4)',
                }}
              >
                {/* Vehicle */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: '2px' }}>
                    {t('vehicle')}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.vehicleName}
                  </div>
                </div>

                {/* Customer */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: '2px' }}>
                    {t('customer')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgb(var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.customerName}
                    {r.bookingNumber ? (
                      <span style={{ color: 'rgb(var(--muted))', fontWeight: 400 }}> · {r.bookingNumber}</span>
                    ) : null}
                  </div>
                </div>

                {/* Coming back */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: '2px' }}>
                    {t('comingBack')}
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: comingBack.overdueFlag ? 600 : 400,
                      color: comingBack.overdueFlag ? 'rgb(var(--danger))' : 'rgb(var(--text))',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {comingBack.overdueFlag && (
                      <span style={{ marginRight: '4px' }}>⚠</span>
                    )}
                    {comingBack.main}
                  </div>
                </div>

                {/* Prep window */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: '2px' }}>
                    {t('prepWindow')}
                  </div>
                  {r.prepWindowMs === null ? (
                    <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', fontStyle: 'italic' }}>
                      {t('noUpcomingBooking')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                          {formatPrepWindow(r.prepWindowMs)}
                        </span>
                        {r.nextBookingPickupAt && (
                          <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                            {t('nextBookingAt', {
                              date: formatDateShort(r.nextBookingPickupAt),
                              time: formatTime(r.nextBookingPickupAt),
                            })}
                          </span>
                        )}
                      </div>
                      {r.prepSeverity && (
                        <SeverityChip
                          severity={r.prepSeverity}
                          label={t(`prepSeverity.${r.prepSeverity}`)}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* View link */}
                <Link
                  href={`/${locale}/staff/bookings/${r.id}`}
                  style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none', flexShrink: 0 }}
                >
                  {t('view')}
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
