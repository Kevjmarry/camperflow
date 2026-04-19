'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsPickup } from '@/lib/staff/operations/getOpsPickupsToday'

interface Props {
  pickups: OpsPickup[]
  quiet?: boolean
}

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
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

export default function OperationsPickups({ pickups, quiet }: Props) {
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
  if (quiet && pickups.length === 0) {
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
          {t('pickups.title')}
        </span>
        <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>—</span>
        <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{t('pickups.noneScheduled')}</span>
      </div>
    )
  }

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        {t('pickups.title')}
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
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('pickups.noneToday')}</p>
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
                {p.nextAction && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{formatNextAction(p.nextAction, actionLabels)}</span>
                )}
                {p.vehicleBlocked && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.blockedVehicle')}</span>
                )}
                {p.hasBlockingIssue && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.blockingChecklistIssue')}</span>
                )}
                {p.hasExpiredCompliance && (p.vehicleId
                  ? <Link href={`/${locale}/staff/vehicles/${p.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.expiredCompliance')}</span></Link>
                  : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.expiredCompliance')}</span>
                )}
                {p.hasOpenVehicleIssue && (() => {
                  const href = p.openVehicleIssueChecklistInstanceId
                    ? `/${locale}/staff/checklists/${p.openVehicleIssueChecklistInstanceId}`
                    : p.vehicleId ? `/${locale}/staff/vehicles/${p.vehicleId}` : null
                  return href
                    ? <Link href={href} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.openVehicleIssue')}</span></Link>
                    : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{t('status.openVehicleIssue')}</span>
                })()}
                {p.handoverItemsTotal != null && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {t('pickups.handover')}: {p.handoverStatus === 'completed' ? `${p.handoverItemsTotal} / ${p.handoverItemsTotal}` : `${p.handoverItemsDone ?? 0} / ${p.handoverItemsTotal}`}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                {p.hoursToPickup != null && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {formatHoursToPickup(p.hoursToPickup, countdownLabels)}
                  </span>
                )}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--brand))' }}>
                  {formatTime(p.pickupAt, locale)}
                </span>
                {p.handoverStatus === 'completed' ? (
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{t('status.readyForPickup')}</span>
                ) : p.checklistInstanceId ? (
                  <Link
                    href={`/${locale}/staff/checklists/${p.checklistInstanceId}`}
                    style={{ fontSize: '13px', color: 'rgb(var(--muted))', textDecoration: 'none' }}
                  >
                    {p.handoverStatus === 'in_progress' ? t('action.continueHandover') : t('action.startHandover')}
                  </Link>
                ) : (
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {p.handoverStatus === 'in_progress' ? t('action.continueHandover') : t('action.startHandover')}
                  </span>
                )}
                <Link
                  href={`/${locale}/staff/bookings/${p.id}`}
                  style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                >
                  {t('pickups.view')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
