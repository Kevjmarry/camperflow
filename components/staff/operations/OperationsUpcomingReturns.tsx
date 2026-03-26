'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsUpcomingReturn } from '@/lib/staff/operations/getOpsUpcomingReturns'

interface Props {
  returns: OpsUpcomingReturn[]
}

const LIMIT = 5

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
  r,
  t,
}: {
  r: OpsUpcomingReturn
  t: (k: string, v?: Record<string, unknown>) => string
}) {
  const badges: React.ReactNode[] = []

  if (r.guestCount != null && r.guestCount > 0) {
    badges.push(
      <span key="guests" style={badgeStyle}>
        <IconPerson />
        {t('extras.guests', { count: r.guestCount })}
      </span>
    )
  }
  if (r.hasExtraDriver) {
    badges.push(
      <span key="driver" style={badgeStyle}>
        <IconPersonPlus />
        {t('extras.extraDriver')}
      </span>
    )
  }
  if (r.hasPets) {
    badges.push(
      <span key="pets" style={badgeStyle}>
        <IconPaw />
        {t('extras.pets')}
      </span>
    )
  }
  if (r.hasAirportPickup) {
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

export default function OperationsUpcomingReturns({ returns }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations')
  const tSection = useTranslations('staff.operations.upcomingReturns')
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? returns : returns.slice(0, LIMIT)
  const hidden = returns.length - LIMIT

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
          {tSection('title')}
        </h2>
        <Link
          href={`/${locale}/staff/bookings`}
          style={{ fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
        >
          {tSection('viewAll')}
        </Link>
      </div>

      {returns.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{tSection('empty')}</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {visible.map((r) => (
              <div
                key={r.id}
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
                {/* Left: booking identity + extras */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {r.vehicleName}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {r.customerName} · {r.bookingNumber}
                  </span>
                  {r.vehicleBlocked && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocked vehicle</span>
                  )}
                  {r.hasExpiredCompliance && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span>
                  )}
                  {r.hasOpenVehicleIssue && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span>
                  )}
                  <MetaBadges r={r} t={t} />
                </div>

                {/* Right: return time, date, countdown, link */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {formatTime(r.returnAt)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                      {formatDate(r.returnAt)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                      {tSection('inDays', { count: r.daysUntil })}
                    </div>
                  </div>
                  <Link
                    href={`/${locale}/staff/bookings/${r.id}`}
                    style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                  >
                    {tSection('view')}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {returns.length > LIMIT && (
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
