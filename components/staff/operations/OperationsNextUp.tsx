'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsUpcomingPickup } from '@/lib/staff/operations/getOpsUpcomingPickups'
import type { OpsUpcomingReturn } from '@/lib/staff/operations/getOpsUpcomingReturns'
import { getStatusChipStyle } from '@/lib/statusChip'

interface Props {
  pickups: OpsUpcomingPickup[]
  returns: OpsUpcomingReturn[]
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

function NavDots({
  total,
  current,
  onGo,
  ariaLabel,
}: {
  total: number
  current: number
  onGo: (i: number) => void
  ariaLabel: (i: number) => string
}) {
  if (total <= 1) return null
  return (
    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginTop: 'var(--space-1)' }}>
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onGo(i)}
          aria-label={ariaLabel(i)}
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            background: i === current ? 'rgb(var(--brand))' : 'rgb(var(--border))',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

function NextCard({
  label,
  badge,
  total,
  current,
  onPrev,
  onNext,
  onGo,
  prevLabel,
  nextLabel,
  dotLabel,
  children,
}: {
  label: string
  badge?: string
  total: number
  current: number
  onPrev: () => void
  onNext: () => void
  onGo: (i: number) => void
  prevLabel: string
  nextLabel: string
  dotLabel: (i: number) => string
  children: React.ReactNode
}) {
  const showNav = total > 1
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {showNav && (
            <button
              onClick={onPrev}
              aria-label={prevLabel}
              style={{
                background: 'none',
                border: 'none',
                padding: '1px 5px',
                cursor: 'pointer',
                color: 'rgb(var(--muted))',
                fontSize: '14px',
                lineHeight: 1,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              ‹
            </button>
          )}
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
          {showNav && (
            <button
              onClick={onNext}
              aria-label={nextLabel}
              style={{
                background: 'none',
                border: 'none',
                padding: '1px 5px',
                cursor: 'pointer',
                color: 'rgb(var(--muted))',
                fontSize: '14px',
                lineHeight: 1,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              ›
            </button>
          )}
        </div>
      </div>
      {children}
      <NavDots total={total} current={current} onGo={onGo} ariaLabel={dotLabel} />
    </div>
  )
}

export default function OperationsNextUp({ pickups, returns }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations.nextUp')

  const [pickupIdx, setPickupIdx] = useState(0)
  const [returnIdx, setReturnIdx] = useState(0)

  const pickupTotal = pickups.length
  const returnTotal = returns.length

  useEffect(() => {
    if (pickupTotal > 0) setPickupIdx((i) => Math.min(i, pickupTotal - 1))
  }, [pickupTotal])

  useEffect(() => {
    if (returnTotal > 0) setReturnIdx((i) => Math.min(i, returnTotal - 1))
  }, [returnTotal])

  const pickup = pickups[pickupIdx] ?? null
  const ret = returns[returnIdx] ?? null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      <NextCard
        label={t('nextPickup')}
        badge={pickup ? countdown(pickup.pickupAt) : undefined}
        total={pickupTotal}
        current={pickupIdx}
        onPrev={() => setPickupIdx((i) => (i - 1 + pickupTotal) % Math.max(pickupTotal, 1))}
        onNext={() => setPickupIdx((i) => (i + 1) % Math.max(pickupTotal, 1))}
        onGo={setPickupIdx}
        prevLabel={t('prev')}
        nextLabel={t('next')}
        dotLabel={(i) => t('itemOf', { current: i + 1, total: pickupTotal })}
      >
        {pickup ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                {pickup.vehicleName}
              </span>
              {pickup.vehicleStatus && (
                <span style={getStatusChipStyle(pickup.vehicleStatus)}>
                  {pickup.vehicleStatus.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </span>
              )}
            </div>
            <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
              {pickup.customerName} · {pickup.bookingNumber}
            </span>
            <span style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
              {formatDate(pickup.pickupAt)}, {formatTime(pickup.pickupAt)}
            </span>
            {pickup.vehicleBlocked && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocked vehicle</span>
            )}
            {pickup.hasBlockingIssue && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocking checklist issue</span>
            )}
            {pickup.hasExpiredCompliance && (pickup.vehicleId
              ? <Link href={`/${locale}/staff/vehicles/${pickup.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span></Link>
              : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span>
            )}
            {pickup.hasOpenVehicleIssue && (() => {
              const href = pickup.openVehicleIssueChecklistInstanceId
                ? `/${locale}/staff/checklists/${pickup.openVehicleIssueChecklistInstanceId}`
                : pickup.vehicleId ? `/${locale}/staff/vehicles/${pickup.vehicleId}#issues` : null
              return href
                ? <Link href={href} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span></Link>
                : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span>
            })()}
            <Link
              href={`/${locale}/staff/bookings/${pickup.id}`}
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

      <NextCard
        label={t('nextReturn')}
        badge={ret ? countdown(ret.returnAt) : undefined}
        total={returnTotal}
        current={returnIdx}
        onPrev={() => setReturnIdx((i) => (i - 1 + returnTotal) % Math.max(returnTotal, 1))}
        onNext={() => setReturnIdx((i) => (i + 1) % Math.max(returnTotal, 1))}
        onGo={setReturnIdx}
        prevLabel={t('prev')}
        nextLabel={t('next')}
        dotLabel={(i) => t('itemOf', { current: i + 1, total: returnTotal })}
      >
        {ret ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                {ret.vehicleName}
              </span>
              {ret.vehicleStatus && (
                <span style={getStatusChipStyle(ret.vehicleStatus)}>
                  {ret.vehicleStatus.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </span>
              )}
            </div>
            <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
              {ret.customerName} · {ret.bookingNumber}
            </span>
            <span style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
              {formatDate(ret.returnAt)}, {formatTime(ret.returnAt)}
            </span>
            {ret.vehicleBlocked && (
              <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocked vehicle</span>
            )}
            {ret.hasExpiredCompliance && (ret.vehicleId
              ? <Link href={`/${locale}/staff/vehicles/${ret.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span></Link>
              : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span>
            )}
            {ret.hasOpenVehicleIssue && (() => {
              const href = ret.openVehicleIssueChecklistInstanceId
                ? `/${locale}/staff/checklists/${ret.openVehicleIssueChecklistInstanceId}`
                : ret.vehicleId ? `/${locale}/staff/vehicles/${ret.vehicleId}#issues` : null
              return href
                ? <Link href={href} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span></Link>
                : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span>
            })()}
            <Link
              href={`/${locale}/staff/bookings/${ret.id}`}
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
