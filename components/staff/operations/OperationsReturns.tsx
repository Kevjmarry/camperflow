'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsReturn } from '@/lib/staff/operations/getOpsReturnsToday'

interface Props {
  returns: OpsReturn[]
  quiet?: boolean
  companyTimezone?: string
}

function formatTime(iso: string, locale: string, timeZone?: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(timeZone && { timeZone }) })
}

function formatHoursToPickup(
  hours: number | null | undefined,
  labels: { today: string; tomorrow: string; days: (n: number) => string },
): string {
  if (hours == null) return ''
  if (hours <= 24) return labels.today
  if (hours <= 48) return labels.tomorrow
  return labels.days(Math.round(hours / 24))
}

function formatNextAction(action: string | null | undefined, labels: Record<string, string>): string {
  if (!action) return ''
  return labels[action] ?? action
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

export default function OperationsReturns({ returns, quiet, companyTimezone }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations')

  const countdownLabels = {
    today: t('countdown.today'),
    tomorrow: t('countdown.tomorrow'),
    days: (n: number) => t('countdown.days', { count: n }),
  }

  const actionLabels: Record<string, string> = {
    prepare_for_pickup: t('action.preparing'),
    start_handover: t('action.startHandover'),
    await_return: t('action.awaitReturn'),
    start_return: t('action.startReturn'),
  }

  // On quiet days with nothing scheduled, render a lightweight status line
  if (quiet && returns.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          border: '1px dashed rgb(var(--border))',
          borderRadius: 'var(--radius)',
          opacity: 0.55,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))' }}>
          {t('returns.title')}
        </span>
        <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>—</span>
        <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{t('returns.noneScheduled')}</span>
      </div>
    )
  }

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        {t('returns.title')}
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
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('returns.noneToday')}</p>
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
                {r.nextAction && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{formatNextAction(r.nextAction, actionLabels)}</span>
                )}
                {r.vehicleBlocked && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.blockedVehicle')}</span>
                )}
                {r.hasBlockingIssue && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.blockingChecklistIssue')}</span>
                )}
                {r.hasExpiredCompliance && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.expiredCompliance')}</span>
                )}
                {r.hasOpenVehicleIssue && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.openVehicleIssue')}</span>
                )}
                {r.returnItemsTotal != null && r.returnItemsTotal > 0 && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {t('returns.returnLabel')}: {r.returnItemsDone ?? 0} / {r.returnItemsTotal}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                {r.hoursToPickup != null && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {formatHoursToPickup(r.hoursToPickup, countdownLabels)}
                  </span>
                )}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--brand))' }}>
                  {formatTime(r.returnAt, locale, companyTimezone)}
                </span>
                <Link
                  href={`/${locale}/staff/bookings/${r.id}`}
                  style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                >
                  {t('returns.view')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
