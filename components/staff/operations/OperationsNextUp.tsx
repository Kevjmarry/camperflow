'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsUpcomingPickup } from '@/lib/staff/operations/getOpsUpcomingPickups'
import type { OpsUpcomingReturn } from '@/lib/staff/operations/getOpsUpcomingReturns'
import { getStatusChipStyle } from '@/lib/statusChip'

interface Props {
  nextPickup: OpsUpcomingPickup | null
  nextReturn: OpsUpcomingReturn | null
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

function countdown(iso: string) {
  const now = new Date()
  const target = new Date(iso)
  const diffDays = Math.floor(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000
  )
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return `in ${diffDays} days`
}

function NextCard({
  label,
  badge,
  children,
}: {
  label: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="surface"
      style={{
        padding: 'var(--space-5)',
        border: '1px solid rgb(var(--border))',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'rgb(var(--muted))',
          }}
        >
          {label}
        </span>
        {badge && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'rgb(var(--brand))',
              background: 'rgb(var(--brand-light))',
              padding: '2px 7px',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export default function OperationsNextUp({ nextPickup, nextReturn }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations.nextUp')

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      <NextCard label={t('nextPickup')} badge={nextPickup ? countdown(nextPickup.pickupAt) : undefined}>
        {nextPickup ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                {nextPickup.vehicleName}
              </span>
              {nextPickup.vehicleStatus && (
                <span style={getStatusChipStyle(nextPickup.vehicleStatus)}>
                  {nextPickup.vehicleStatus.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </span>
              )}
            </div>
            <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
              {nextPickup.customerName} · {nextPickup.bookingNumber}
            </span>
            <span style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
              {formatDate(nextPickup.pickupAt)}, {formatTime(nextPickup.pickupAt)}
            </span>
            {nextPickup.vehicleBlocked && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocked vehicle</span>
            )}
            {nextPickup.hasBlockingIssue && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocking checklist issue</span>
            )}
            {nextPickup.hasExpiredCompliance && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span>
            )}
            {nextPickup.hasOpenVehicleIssue && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span>
            )}
            <Link
              href={`/${locale}/staff/bookings/${nextPickup.id}`}
              style={{
                fontSize: '13px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginTop: 'var(--space-1)',
              }}
            >
              {t('view')} →
            </Link>
          </>
        ) : (
          <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{t('nonePickup')}</span>
        )}
      </NextCard>

      <NextCard label={t('nextReturn')} badge={nextReturn ? countdown(nextReturn.returnAt) : undefined}>
        {nextReturn ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                {nextReturn.vehicleName}
              </span>
              {nextReturn.vehicleStatus && (
                <span style={getStatusChipStyle(nextReturn.vehicleStatus)}>
                  {nextReturn.vehicleStatus.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </span>
              )}
            </div>
            <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
              {nextReturn.customerName} · {nextReturn.bookingNumber}
            </span>
            <span style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
              {formatDate(nextReturn.returnAt)}, {formatTime(nextReturn.returnAt)}
            </span>
            {nextReturn.vehicleBlocked && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocked vehicle</span>
            )}
            {nextReturn.hasExpiredCompliance && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span>
            )}
            {nextReturn.hasOpenVehicleIssue && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span>
            )}
            <Link
              href={`/${locale}/staff/bookings/${nextReturn.id}`}
              style={{
                fontSize: '13px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginTop: 'var(--space-1)',
              }}
            >
              {t('view')} →
            </Link>
          </>
        ) : (
          <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{t('noneReturn')}</span>
        )}
      </NextCard>
    </div>
  )
}
