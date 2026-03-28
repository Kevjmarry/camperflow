'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsUpcomingPickup } from '@/lib/staff/operations/getOpsUpcomingPickups'

interface Props {
  pickups: OpsUpcomingPickup[]
}

const LIMIT = 5

const nextActionLabels: Record<string, string> = {
  prepare_for_pickup: 'Preparing',
  start_handover: 'Start handover',
  await_return: 'Await return',
  start_return: 'Start return',
}

function formatNextAction(action: string | null | undefined): string {
  if (!action) return ''
  return nextActionLabels[action] ?? action
}

function formatHoursToPickup(hours: number | null | undefined): string {
  if (hours == null) return ''
  if (hours <= 24) return 'Today'
  if (hours <= 48) return 'Tomorrow'
  return `${Math.round(hours / 24)} days`
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

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function IconPerson() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 15c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  )
}

function IconPersonPlus() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 14c0-2.8 2.2-5 5-5" />
      <path d="M13 9v4m-2-2h4" />
    </svg>
  )
}

function IconPaw() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="5" r="2" />
      <circle cx="10" cy="3" r="2" />
      <circle cx="16" cy="5" r="2" />
      <circle cx="2.5" cy="10.5" r="1.5" />
      <circle cx="17.5" cy="10.5" r="1.5" />
      <ellipse cx="10" cy="14" rx="5" ry="4" />
    </svg>
  )
}

function IconPlane() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1 5.5 7H2.5l1 1.5 3.5-.5L8 15l1.5-1-1-4.5 3.5.5 1-1.5H10L8 1z" />
    </svg>
  )
}

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ label, severity }: { label: string; severity: 'critical' | 'warning' }) {
  const style: React.CSSProperties =
    severity === 'critical'
      ? {
          color: 'rgb(var(--danger))',
          background: 'rgb(var(--danger) / 0.14)',
          border: '1px solid rgb(var(--danger) / 0.28)',
        }
      : {
          color: 'rgb(var(--warning))',
          background: 'rgb(var(--warning) / 0.14)',
          border: '1px solid rgb(var(--warning) / 0.28)',
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
        ...style,
      }}
    >
      {label}
    </span>
  )
}

// ── Operational metadata badges ───────────────────────────────────────────────

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  fontSize: '11px',
  fontWeight: 500,
  padding: '2px 6px',
  borderRadius: '3px',
  background: 'rgb(var(--border) / 0.6)',
  color: 'rgb(var(--text))',
  whiteSpace: 'nowrap',
  lineHeight: 1,
}

function MetaBadges({
  p,
  t,
}: {
  p: OpsUpcomingPickup
  t: ReturnType<typeof useTranslations>
}) {
  const badges: React.ReactNode[] = []

  if (p.guestCount != null && p.guestCount > 0) {
    badges.push(
      <span key="guests" style={badgeStyle}>
        <IconPerson />
        {t('extras.guests', { count: p.guestCount })}
      </span>
    )
  }
  if (p.hasExtraDriver) {
    badges.push(
      <span key="driver" style={badgeStyle}>
        <IconPersonPlus />
        {t('extras.extraDriver')}
      </span>
    )
  }
  if (p.hasPets) {
    badges.push(
      <span key="pets" style={badgeStyle}>
        <IconPaw />
        {t('extras.pets')}
      </span>
    )
  }
  if (p.hasAirportPickup) {
    badges.push(
      <span key="airport" style={badgeStyle}>
        <IconPlane />
        {t('extras.airportPickup')}
      </span>
    )
  }

  if (badges.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
      {badges}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OperationsUpcomingPickups({ pickups }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations')
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? pickups : pickups.slice(0, LIMIT)
  const hidden = pickups.length - LIMIT

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
          Upcoming pickups
        </h2>
        <Link
          href={`/${locale}/staff/bookings`}
          style={{ fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
        >
          View all
        </Link>
      </div>

      {pickups.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No upcoming pickups.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {visible.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: 'var(--space-3)',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  gap: 'var(--space-4)',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left: booking identity + badges */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {p.vehicleName}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {p.customerName} · {p.bookingNumber}
                  </span>
                  {p.nextAction && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{formatNextAction(p.nextAction)}</span>
                  )}
                  {(p.vehicleBlocked || p.hasUrgentIssue || p.hasAttentionIssue || p.hasBlockingIssue || p.hasExpiredCompliance || p.hasOpenVehicleIssue) && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {p.vehicleBlocked && <StatusChip label="Blocked vehicle" severity="warning" />}
                      {p.hasUrgentIssue && <StatusChip label="Urgent issue" severity="critical" />}
                      {p.hasAttentionIssue && <StatusChip label="Attention issue" severity="warning" />}
                      {!p.hasUrgentIssue && !p.hasAttentionIssue && p.hasBlockingIssue && <StatusChip label="Blocking checklist issue" severity="critical" />}
                      {p.hasExpiredCompliance && (p.vehicleId
                        ? <Link href={`/${locale}/staff/vehicles/${p.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><StatusChip label="Expired compliance" severity="critical" /></Link>
                        : <StatusChip label="Expired compliance" severity="critical" />
                      )}
                      {p.hasOpenVehicleIssue && (() => {
                        const href = p.openVehicleIssueChecklistInstanceId
                          ? `/${locale}/staff/checklists/${p.openVehicleIssueChecklistInstanceId}`
                          : p.vehicleId ? `/${locale}/staff/vehicles/${p.vehicleId}` : null
                        return href
                          ? <Link href={href} style={{ textDecoration: 'none' }}><StatusChip label="Open vehicle issue" severity="warning" /></Link>
                          : <StatusChip label="Open vehicle issue" severity="warning" />
                      })()}
                    </div>
                  )}
                  <MetaBadges p={p} t={t} />
                </div>

                {/* Right: time, date, countdown, link */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {formatTime(p.pickupAt)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                      {formatDate(p.pickupAt)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                      {formatHoursToPickup(p.hoursToPickup) || `in ${p.daysUntil}d`}
                    </div>
                  </div>
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

          {pickups.length > LIMIT && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'rgb(var(--brand))',
                padding: 'var(--space-3) 0 0',
                textAlign: 'left',
              }}
            >
              {expanded ? t('showLess') : t('showMore', { count: hidden })}
            </button>
          )}
        </>
      )}
    </div>
  )
}
