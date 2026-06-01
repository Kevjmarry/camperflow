'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsUpcomingPickup } from '@/lib/staff/operations/getOpsUpcomingPickups'
import type { OpsUpcomingReturn } from '@/lib/staff/operations/getOpsUpcomingReturns'
import type { OpsInvoiceReminder } from '@/lib/staff/operations/getOpsInvoiceReminders'
import type { OpsWhatsAppTemplates } from '@/lib/staff/operations/getOpsWhatsAppTemplates'
import { replaceTemplatePlaceholders } from '@/lib/whatsapp/replaceTemplatePlaceholders'
import { getStatusChipStyle } from '@/lib/statusChip'

const FALLBACK_MSG_TEMPLATES = {
  pre_arrival: 'Hello again, just a reminder that your {vehicle_name} pickup is tomorrow. We look forward to seeing you!',
  return_prep: 'Hello again, just a reminder that your {vehicle_name} return is due tomorrow. Safe travels!',
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.camperflow.io'

interface Props {
  pickups: OpsUpcomingPickup[]
  returns: OpsUpcomingReturn[]
  companyTimezone?: string
  preArrivalReminders?: OpsInvoiceReminder[]
  returnPrepReminders?: OpsInvoiceReminder[]
  whatsappTemplates?: OpsWhatsAppTemplates
  today?: string
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(iso: string, locale: string, timeZone?: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(timeZone && { timeZone }) })
}

function countdownDays(iso: string, now: Date): number {
  const target = new Date(iso)
  return Math.floor(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000
  )
}

/** Returns touch event handlers that trigger onPrev/onNext on a deliberate horizontal swipe. */
function useSwipeHandlers(onPrev: () => void, onNext: () => void) {
  const startX = useRef(0)
  const startY = useRef(0)

  return {
    onTouchStart: (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current
      // Ignore taps (< 40 px) and primarily-vertical gestures (scroll)
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
      if (dx < 0) onNext()
      else onPrev()
    },
  }
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
  const swipe = useSwipeHandlers(onPrev, onNext)

  return (
    <div
      className="surface"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      style={{
        padding: 'var(--space-5)',
        border: '1px solid rgb(var(--border))',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        touchAction: 'pan-y', // allow vertical scroll; horizontal is handled by swipe
      }}
    >
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          {showNav && (
            <button
              onClick={onPrev}
              aria-label={prevLabel}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 4px',
                cursor: 'pointer',
                color: 'rgb(var(--brand))',
                fontSize: '20px',
                lineHeight: 1,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              ‹
            </button>
          )}
          <span
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'rgb(var(--brand))',
              background: 'none',
              padding: '3px 8px',
              borderBottom: '2px solid rgb(var(--brand))',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}
          >
            {badge}
          </span>
          {showNav && (
            <button
              onClick={onNext}
              aria-label={nextLabel}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 4px',
                cursor: 'pointer',
                color: 'rgb(var(--brand))',
                fontSize: '20px',
                lineHeight: 1,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              ›
            </button>
          )}
        </div>
      )}
      {children}
      <NavDots total={total} current={current} onGo={onGo} ariaLabel={dotLabel} />
    </div>
  )
}

export default function OperationsNextUp({ pickups, returns, companyTimezone, preArrivalReminders = [], returnPrepReminders = [], whatsappTemplates, today }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations.nextUp')
  const tOps = useTranslations('staff.operations')
  const effectiveToday = today ? new Date(today) : new Date()

  const vehicleStatusLabels: Record<string, string> = {
    ready: tOps('vehicleStatus.ready'),
    preparing: tOps('vehicleStatus.preparing'),
    blocked: tOps('vehicleStatus.blocked'),
    on_rent: tOps('vehicleStatus.on_rent'),
    in_progress: tOps('vehicleStatus.in_progress'),
    confirmed: tOps('vehicleStatus.confirmed'),
    cancelled: tOps('vehicleStatus.cancelled'),
    completed: tOps('vehicleStatus.completed'),
    not_started: tOps('vehicleStatus.not_started'),
    draft: tOps('vehicleStatus.draft'),
    pending: tOps('vehicleStatus.pending'),
  }

  function getVehicleStatusLabel(status: string): string {
    return vehicleStatusLabels[status] ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  }

  function countdown(iso: string): string {
    const diff = countdownDays(iso, effectiveToday)
    if (diff === 0) return tOps('countdown.today')
    if (diff === 1) return tOps('countdown.tomorrow')
    return tOps('countdown.days', { count: diff })
  }

  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [pickupIdx, setPickupIdx] = useState(0)
  const [returnIdx, setReturnIdx] = useState(0)
  const [handledReminderIds, setHandledReminderIds] = useState<Set<string>>(new Set())
  const [handlingIds, setHandlingIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const buildReminderMessage = (r: OpsInvoiceReminder): string | null => {
    if (!whatsappTemplates) return null
    const template = r.type === 'pre_arrival'
      ? (whatsappTemplates.pre_arrival ?? FALLBACK_MSG_TEMPLATES.pre_arrival)
      : (whatsappTemplates.return_prep ?? FALLBACK_MSG_TEMPLATES.return_prep)
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    return replaceTemplatePlaceholders(template, {
      customer_name: r.customerName,
      vehicle_name: r.vehicleName,
      pickup_date: r.pickupAt ? fmtDate(r.pickupAt) : '',
      return_date: r.returnAt ? fmtDate(r.returnAt) : '',
      guest_link: `${APP_URL}/${locale}/guest?code=${r.bookingNumber}&token=${r.guestAccessToken}`,
      booking_code: r.bookingNumber,
      company_phone: whatsappTemplates.company_phone,
      map_link: whatsappTemplates.map_link,
    })
  }

  const handleMarkSent = async (r: OpsInvoiceReminder) => {
    setHandlingIds((prev) => new Set(prev).add(r.id))
    try {
      const res = await fetch(`/api/staff/bookings/${r.bookingId}/mark-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: r.type }),
      })
      if (res.ok) setHandledReminderIds((prev) => new Set(prev).add(r.id))
    } finally {
      setHandlingIds((prev) => { const next = new Set(prev); next.delete(r.id); return next })
    }
  }

  const handleCopy = async (id: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedId(id)
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000)
    } catch { /* clipboard unavailable */ }
  }

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

  if (pickups.length === 0 && returns.length === 0) return null

  const listSectionStyle: React.CSSProperties = {
    border: '1px solid rgb(var(--border))',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  }
  const listHeaderStyle: React.CSSProperties = {
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid rgb(var(--border))',
  }
  const listLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'rgb(var(--muted))',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <style>{`
        .next-up-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--space-4);
        }
        @media (max-width: 767px) {
          .next-up-card-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {(['card', 'list'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                fontWeight: viewMode === mode ? 600 : 400,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === mode ? 'rgb(var(--brand-light))' : 'none',
                color: viewMode === mode ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
                transition: 'background 0.15s, color 0.15s',
                lineHeight: '1.5',
              }}
            >
              {mode === 'card' ? t('cardView') : t('listView')}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'card' && (
        <div className="next-up-card-grid">
          {pickups.length > 0 && <NextCard
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
            {pickup ? (() => {
              const preArrivalReminder = preArrivalReminders.find(r => r.bookingId === pickup.id && !handledReminderIds.has(r.id)) ?? null
              const preArrivalMsg = preArrivalReminder ? buildReminderMessage(preArrivalReminder) : null
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {pickup.vehicleName}
                    </span>
                    {pickup.handoverDone
                      ? <span style={getStatusChipStyle('completed')}>{tOps('status.handoverComplete')}</span>
                      : pickup.prepDone
                        ? <span style={getStatusChipStyle('ready')}>{tOps('status.readyForPickup')}</span>
                        : <span style={getStatusChipStyle('preparing')}>{tOps('status.prepNeeded')}</span>
                    }
                  </div>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {(pickup.customerName ?? '').replace(/^(\[\?\]|\?)\s*/, '')} · {pickup.bookingNumber}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
                    {formatDate(pickup.pickupAt, locale)} · {formatTime(pickup.pickupAt, locale, companyTimezone)}
                  </span>
                  {pickup.vehicleBlocked && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.blockedVehicle')}</span>
                  )}
                  {pickup.hasBlockingIssue && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.blockingChecklistIssue')}</span>
                  )}
                  {pickup.hasExpiredCompliance && (pickup.vehicleId
                    ? <Link href={`/${locale}/staff/vehicles/${pickup.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span></Link>
                    : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span>
                  )}
                  {pickup.hasOpenVehicleIssue && (() => {
                    const href = pickup.openVehicleIssueChecklistInstanceId
                      ? `/${locale}/staff/checklists/${pickup.openVehicleIssueChecklistInstanceId}`
                      : pickup.vehicleId ? `/${locale}/staff/vehicles/${pickup.vehicleId}#issues` : null
                    return href
                      ? <Link href={href} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span></Link>
                      : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span>
                  })()}
                  {preArrivalReminder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', borderTop: '1px solid rgb(var(--border))', paddingTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgb(var(--muted))' }}>
                        {t('preArrivalMessage')}
                      </span>
                      {preArrivalMsg && (
                        <button
                          type="button"
                          onClick={() => handleCopy(preArrivalReminder.id, preArrivalMsg)}
                          style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: copiedId === preArrivalReminder.id ? 'rgb(var(--success) / 0.12)' : 'none', color: copiedId === preArrivalReminder.id ? 'rgb(var(--success))' : 'rgb(var(--muted))', cursor: 'pointer', lineHeight: '1.4' }}
                        >
                          {copiedId === preArrivalReminder.id ? t('messageCopied') : t('copyMessage')}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={handlingIds.has(preArrivalReminder.id)}
                        onClick={() => handleMarkSent(preArrivalReminder)}
                        style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: 'none', color: 'rgb(var(--muted))', cursor: handlingIds.has(preArrivalReminder.id) ? 'default' : 'pointer', opacity: handlingIds.has(preArrivalReminder.id) ? 0.5 : 1, lineHeight: '1.4' }}
                      >
                        {t('markSent')}
                      </button>
                    </div>
                  )}
                  <Link
                    href={`/${locale}/staff/bookings/${pickup.id}`}
                    style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none', marginTop: 'var(--space-1)' }}
                  >
                    {t('view')} →
                  </Link>
                </>
              )
            })() : (
              <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{t('nonePickup')}</span>
            )}
          </NextCard>}

          {returns.length > 0 && <NextCard
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
            {ret ? (() => {
              const returnPrepReminder = returnPrepReminders.find(r => r.bookingId === ret.id && !handledReminderIds.has(r.id)) ?? null
              const returnPrepMsg = returnPrepReminder ? buildReminderMessage(returnPrepReminder) : null
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {ret.vehicleName}
                    </span>
                    {(() => {
                      const diff = countdownDays(ret.returnAt, effectiveToday)
                      const label = diff === 0 ? t('dueToday') : diff === 1 ? t('dueTomorrow') : t('dueInDays', { count: diff })
                      return <span style={getStatusChipStyle('on_rent')}>{label}</span>
                    })()}
                  </div>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {(ret.customerName ?? '').replace(/^(\[\?\]|\?)\s*/, '')} · {ret.bookingNumber}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--text))' }}>
                    {formatDate(ret.returnAt, locale)} · {formatTime(ret.returnAt, locale, companyTimezone)}
                  </span>
                  {ret.vehicleBlocked && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.blockedVehicle')}</span>
                  )}
                  {ret.hasExpiredCompliance && (ret.vehicleId
                    ? <Link href={`/${locale}/staff/vehicles/${ret.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span></Link>
                    : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span>
                  )}
                  {ret.hasOpenVehicleIssue && (() => {
                    const href = ret.openVehicleIssueChecklistInstanceId
                      ? `/${locale}/staff/checklists/${ret.openVehicleIssueChecklistInstanceId}`
                      : ret.vehicleId ? `/${locale}/staff/vehicles/${ret.vehicleId}#issues` : null
                    return href
                      ? <Link href={href} style={{ textDecoration: 'none' }}><span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span></Link>
                      : <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span>
                  })()}
                  {returnPrepReminder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', borderTop: '1px solid rgb(var(--border))', paddingTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgb(var(--muted))' }}>
                        {t('returnPrepMessage')}
                      </span>
                      {returnPrepMsg && (
                        <button
                          type="button"
                          onClick={() => handleCopy(returnPrepReminder.id, returnPrepMsg)}
                          style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: copiedId === returnPrepReminder.id ? 'rgb(var(--success) / 0.12)' : 'none', color: copiedId === returnPrepReminder.id ? 'rgb(var(--success))' : 'rgb(var(--muted))', cursor: 'pointer', lineHeight: '1.4' }}
                        >
                          {copiedId === returnPrepReminder.id ? t('messageCopied') : t('copyMessage')}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={handlingIds.has(returnPrepReminder.id)}
                        onClick={() => handleMarkSent(returnPrepReminder)}
                        style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: 'none', color: 'rgb(var(--muted))', cursor: handlingIds.has(returnPrepReminder.id) ? 'default' : 'pointer', opacity: handlingIds.has(returnPrepReminder.id) ? 0.5 : 1, lineHeight: '1.4' }}
                      >
                        {t('markSent')}
                      </button>
                    </div>
                  )}
                  <Link
                    href={`/${locale}/staff/bookings/${ret.id}`}
                    style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none', marginTop: 'var(--space-1)' }}
                  >
                    {t('view')} →
                  </Link>
                </>
              )
            })() : (
              <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{t('noneReturn')}</span>
            )}
          </NextCard>}
        </div>
      )}

      {viewMode === 'list' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {pickups.length > 0 && (
            <div className="surface" style={listSectionStyle}>
              <div style={listHeaderStyle}>
                <span style={listLabelStyle}>{t('nextPickup')}</span>
              </div>
              <div>
                {pickups.map((p, idx) => {
                  const preArrivalReminder = preArrivalReminders.find(r => r.bookingId === p.id && !handledReminderIds.has(r.id)) ?? null
                  const preArrivalMsg = preArrivalReminder ? buildReminderMessage(preArrivalReminder) : null
                  const diff = countdownDays(p.pickupAt, effectiveToday)
                  const cdText = diff === 0 ? tOps('countdown.today') : diff === 1 ? tOps('countdown.tomorrow') : tOps('countdown.days', { count: diff })
                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        borderBottom: idx < pickups.length - 1 ? '1px solid rgb(var(--border))' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgb(var(--text))' }}>{p.vehicleName}</span>
                        {p.handoverDone
                          ? <span style={getStatusChipStyle('completed')}>{tOps('status.handoverComplete')}</span>
                          : p.prepDone
                            ? <span style={getStatusChipStyle('ready')}>{tOps('status.readyForPickup')}</span>
                            : <span style={getStatusChipStyle('preparing')}>{tOps('status.prepNeeded')}</span>
                        }
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap' }}>
                          {formatDate(p.pickupAt, locale)} · {formatTime(p.pickupAt, locale, companyTimezone)}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>
                        {cdText} · {(p.customerName ?? '').replace(/^(\[\?\]|\?)\s*/, '')} · {p.bookingNumber}
                      </span>
                      {(p.vehicleBlocked || p.hasBlockingIssue || p.hasExpiredCompliance || p.hasOpenVehicleIssue) && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {p.vehicleBlocked && <span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.blockedVehicle')}</span>}
                          {p.hasBlockingIssue && <span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.blockingChecklistIssue')}</span>}
                          {p.hasExpiredCompliance && (p.vehicleId
                            ? <Link href={`/${locale}/staff/vehicles/${p.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span></Link>
                            : <span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span>
                          )}
                          {p.hasOpenVehicleIssue && (() => {
                            const href = p.openVehicleIssueChecklistInstanceId
                              ? `/${locale}/staff/checklists/${p.openVehicleIssueChecklistInstanceId}`
                              : p.vehicleId ? `/${locale}/staff/vehicles/${p.vehicleId}#issues` : null
                            return href
                              ? <Link href={href} style={{ textDecoration: 'none' }}><span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span></Link>
                              : <span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span>
                          })()}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                        {preArrivalReminder && (
                          <>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgb(var(--muted))' }}>{t('preArrivalMessage')}</span>
                            {preArrivalMsg && (
                              <button
                                type="button"
                                onClick={() => handleCopy(preArrivalReminder.id, preArrivalMsg)}
                                style={{ padding: '1px 6px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: copiedId === preArrivalReminder.id ? 'rgb(var(--success) / 0.12)' : 'none', color: copiedId === preArrivalReminder.id ? 'rgb(var(--success))' : 'rgb(var(--muted))', cursor: 'pointer', lineHeight: '1.4' }}
                              >
                                {copiedId === preArrivalReminder.id ? t('messageCopied') : t('copyMessage')}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={handlingIds.has(preArrivalReminder.id)}
                              onClick={() => handleMarkSent(preArrivalReminder)}
                              style={{ padding: '1px 6px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: 'none', color: 'rgb(var(--muted))', cursor: handlingIds.has(preArrivalReminder.id) ? 'default' : 'pointer', opacity: handlingIds.has(preArrivalReminder.id) ? 0.5 : 1, lineHeight: '1.4' }}
                            >
                              {t('markSent')}
                            </button>
                          </>
                        )}
                        <Link
                          href={`/${locale}/staff/bookings/${p.id}`}
                          style={{ fontSize: '12px', color: 'rgb(var(--brand))', textDecoration: 'none', marginLeft: 'auto' }}
                        >
                          {t('view')} →
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {returns.length > 0 && (
            <div className="surface" style={listSectionStyle}>
              <div style={listHeaderStyle}>
                <span style={listLabelStyle}>{t('nextReturn')}</span>
              </div>
              <div>
                {returns.map((rtn, idx) => {
                  const returnPrepReminder = returnPrepReminders.find(r => r.bookingId === rtn.id && !handledReminderIds.has(r.id)) ?? null
                  const returnPrepMsg = returnPrepReminder ? buildReminderMessage(returnPrepReminder) : null
                  const diff = countdownDays(rtn.returnAt, effectiveToday)
                  const cdText = diff === 0 ? tOps('countdown.today') : diff === 1 ? tOps('countdown.tomorrow') : tOps('countdown.days', { count: diff })
                  return (
                    <div
                      key={rtn.id}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        borderBottom: idx < returns.length - 1 ? '1px solid rgb(var(--border))' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgb(var(--text))' }}>{rtn.vehicleName}</span>
                        {(() => {
                          const label = diff === 0 ? t('dueToday') : diff === 1 ? t('dueTomorrow') : t('dueInDays', { count: diff })
                          return <span style={getStatusChipStyle('on_rent')}>{label}</span>
                        })()}
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap' }}>
                          {formatDate(rtn.returnAt, locale)} · {formatTime(rtn.returnAt, locale, companyTimezone)}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>
                        {cdText} · {(rtn.customerName ?? '').replace(/^(\[\?\]|\?)\s*/, '')} · {rtn.bookingNumber}
                      </span>
                      {(rtn.vehicleBlocked || rtn.hasExpiredCompliance || rtn.hasOpenVehicleIssue) && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {rtn.vehicleBlocked && <span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.blockedVehicle')}</span>}
                          {rtn.hasExpiredCompliance && (rtn.vehicleId
                            ? <Link href={`/${locale}/staff/vehicles/${rtn.vehicleId}#compliance`} style={{ textDecoration: 'none' }}><span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span></Link>
                            : <span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.expiredCompliance')}</span>
                          )}
                          {rtn.hasOpenVehicleIssue && (() => {
                            const href = rtn.openVehicleIssueChecklistInstanceId
                              ? `/${locale}/staff/checklists/${rtn.openVehicleIssueChecklistInstanceId}`
                              : rtn.vehicleId ? `/${locale}/staff/vehicles/${rtn.vehicleId}#issues` : null
                            return href
                              ? <Link href={href} style={{ textDecoration: 'none' }}><span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span></Link>
                              : <span style={{ fontSize: '11px', color: 'rgb(var(--danger))', fontWeight: 500 }}>{tOps('status.openVehicleIssue')}</span>
                          })()}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                        {returnPrepReminder && (
                          <>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgb(var(--muted))' }}>{t('returnPrepMessage')}</span>
                            {returnPrepMsg && (
                              <button
                                type="button"
                                onClick={() => handleCopy(returnPrepReminder.id, returnPrepMsg)}
                                style={{ padding: '1px 6px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: copiedId === returnPrepReminder.id ? 'rgb(var(--success) / 0.12)' : 'none', color: copiedId === returnPrepReminder.id ? 'rgb(var(--success))' : 'rgb(var(--muted))', cursor: 'pointer', lineHeight: '1.4' }}
                              >
                                {copiedId === returnPrepReminder.id ? t('messageCopied') : t('copyMessage')}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={handlingIds.has(returnPrepReminder.id)}
                              onClick={() => handleMarkSent(returnPrepReminder)}
                              style={{ padding: '1px 6px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border))', background: 'none', color: 'rgb(var(--muted))', cursor: handlingIds.has(returnPrepReminder.id) ? 'default' : 'pointer', opacity: handlingIds.has(returnPrepReminder.id) ? 0.5 : 1, lineHeight: '1.4' }}
                            >
                              {t('markSent')}
                            </button>
                          </>
                        )}
                        <Link
                          href={`/${locale}/staff/bookings/${rtn.id}`}
                          style={{ fontSize: '12px', color: 'rgb(var(--brand))', textDecoration: 'none', marginLeft: 'auto' }}
                        >
                          {t('view')} →
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
