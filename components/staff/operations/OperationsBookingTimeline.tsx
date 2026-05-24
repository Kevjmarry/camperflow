'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsTimelineVehicle, OpsTimelineBooking } from '@/lib/staff/operations/getOpsBookingTimeline'

export interface TimelineVehicleBlock {
  id: string
  vehicleId: string
  label: string | null
  blockType?: string | null
  startAt: string
  endAt: string
}

const BLOCK_TYPE_ICON: Record<string, string> = {
  maintenance:   '🔧',
  work:          '🛠',
  owner_use:     '🏠',
  manual_note:   '📝',
  external_hold: '🔗',
  unavailable:   '⛔',
}

interface Props {
  vehicles: OpsTimelineVehicle[]
  bookings: OpsTimelineBooking[]
  vehicleBlocks?: TimelineVehicleBlock[]
  companyTimezone?: string
  today?: string // ISO string from server loader — frozen for demo company
}

const DAYS_BACK = 30
const DAYS_FORWARD = 180
const TOTAL_DAYS = DAYS_BACK + DAYS_FORWARD
const PX_PER_DAY = 28
const PX_PER_HOUR = PX_PER_DAY / 24
const TIMELINE_PX = TOTAL_DAYS * PX_PER_DAY // 5880
const LEFT_COL_PX = 144
const ROW_H = 34
const DAY_BG = `repeating-linear-gradient(to right, rgb(var(--muted) / 0.03) 0, rgb(var(--muted) / 0.03) ${PX_PER_DAY}px, transparent ${PX_PER_DAY}px, transparent ${PX_PER_DAY * 2}px)`
const TODAY_L = DAYS_BACK * PX_PER_DAY

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; bgImage?: string }> = {
  draft:     { bg: 'rgb(234 179 8 / 0.13)', bgImage: 'repeating-linear-gradient(45deg, rgb(234 179 8 / 0.30) 0, rgb(234 179 8 / 0.30) 3px, transparent 3px, transparent 9px)', border: 'rgb(234 179 8 / 0.60)', text: 'rgb(var(--muted))' },
  confirmed: { bg: 'rgb(var(--success) / 0.65)', border: 'rgb(var(--success) / 0.90)', text: '#fff' },
  blocked:   { bg: 'rgb(var(--danger) / 0.22)',  border: 'rgb(var(--danger) / 0.65)',  text: '#fff' },
  on_rent:   { bg: 'rgb(var(--success) / 0.85)', border: 'rgb(var(--success))',        text: '#fff' },
  completed: { bg: 'rgb(134 155 140 / 0.13)',    border: 'rgb(134 155 140 / 0.35)',    text: '#fff' },
}
const FALLBACK_STYLE = STATUS_STYLE.draft


const LEGEND_STATUSES = ['confirmed', 'on_rent', 'blocked', 'draft', 'completed'] as const

export default function OperationsBookingTimeline({ vehicles, bookings, vehicleBlocks = [], companyTimezone = 'UTC', today }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const params = useParams()
  const locale = params.locale as string
  const t = useTranslations('staff.operations.bookingTimeline')
  const tTypes = useTranslations('staff.operations.blockTypes')

  useEffect(() => { setMounted(true) }, [])

  // Scroll so 5 days before today is at the left edge on first render.
  // Depends on `mounted` because the ref is null until the timeline renders.
  useEffect(() => {
    if (mounted && scrollRef.current) {
      scrollRef.current.scrollLeft = (DAYS_BACK - 5) * PX_PER_DAY
    }
  }, [mounted])

  if (!mounted) return null

  const now = today ? new Date(today) : new Date()

  // Compute company-local midnight for today by subtracting elapsed time since
  // midnight in the company timezone (no library needed — Intl gives us hh/mm/ss).
  const tzTimeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: companyTimezone,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now)
  const tzH = +(tzTimeParts.find(p => p.type === 'hour')!.value)
  const tzM = +(tzTimeParts.find(p => p.type === 'minute')!.value)
  const tzS = +(tzTimeParts.find(p => p.type === 'second')!.value)
  const todayMidnight = new Date(now.getTime() - (tzH * 3600 + tzM * 60 + tzS) * 1000 - now.getMilliseconds())

  const windowStart = new Date(todayMidnight)
  windowStart.setTime(windowStart.getTime() - DAYS_BACK * 86_400_000)

  function dayOffset(date: Date): number {
    return (date.getTime() - windowStart.getTime()) / 86_400_000
  }

  // Month boundary markers — use company-timezone year/month/day via Intl; no browser-local
  // Date mutators (setDate/setMonth/getMonth operate in browser tz, not companyTimezone).
  // For each month boundary, midnight of the 1st is computed with the same
  // "noon UTC minus elapsed-since-midnight-in-tz" trick used for todayMidnight.
  const monthMarkers: { label: string; leftPct: number }[] = []
  {
    const wsParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: companyTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(windowStart)
    let mYear  = +(wsParts.find(p => p.type === 'year')!.value)
    let mMonth = +(wsParts.find(p => p.type === 'month')!.value) // 1-based
    const mDay = +(wsParts.find(p => p.type === 'day')!.value)
    // If windowStart is not already the 1st, start from the next month
    if (mDay > 1) { if (++mMonth > 12) { mMonth = 1; mYear++ } }
    while (true) {
      // Noon UTC on the 1st is always the same calendar day in any timezone (offsets ≤ ±11 h),
      // so "noon minus elapsed hours/minutes/seconds in company tz" reliably gives that day's midnight.
      const noon = Date.UTC(mYear, mMonth - 1, 1, 12, 0, 0, 0)
      const np = new Intl.DateTimeFormat('en-GB', {
        timeZone: companyTimezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(new Date(noon))
      const nh = +(np.find(p => p.type === 'hour')!.value)
      const nm = +(np.find(p => p.type === 'minute')!.value)
      const ns = +(np.find(p => p.type === 'second')!.value)
      const firstMs = noon - (nh * 3600 + nm * 60 + ns) * 1000
      const off = (firstMs - windowStart.getTime()) / 86_400_000
      if (off >= TOTAL_DAYS) break
      if (off >= 0) {
        monthMarkers.push({
          label: new Date(firstMs).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: companyTimezone }),
          leftPct: (off / TOTAL_DAYS) * 100,
        })
      }
      if (++mMonth > 12) { mMonth = 1; mYear++ }
    }
  }

  const todayPct = ((DAYS_BACK + 0.5) / TOTAL_DAYS) * 100

  // Day markers — one per day, centered in each column
  const dayMarkers: { label: string; leftPx: number; isToday: boolean }[] = []
  const weekendOffsets: number[] = []
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: companyTimezone, weekday: 'short' })
  for (let d = 0; d < TOTAL_DAYS; d += 1) {
    const date = new Date(windowStart.getTime() + d * 86_400_000)
    const dayNum = date.toLocaleDateString('en-CA', { timeZone: companyTimezone, day: 'numeric' })
    dayMarkers.push({ label: dayNum, leftPx: (d + 0.5) * PX_PER_DAY, isToday: d === DAYS_BACK })
    if (weekdayFmt.format(date) === 'Sun') weekendOffsets.push(d * PX_PER_DAY)
  }

  const bookingsByVehicle = new Map<string, OpsTimelineBooking[]>()
  for (const b of bookings) {
    if (!bookingsByVehicle.has(b.vehicleId)) bookingsByVehicle.set(b.vehicleId, [])
    bookingsByVehicle.get(b.vehicleId)!.push(b)
  }

  const blocksByVehicle = new Map<string, TimelineVehicleBlock[]>()
  for (const bl of vehicleBlocks) {
    if (!blocksByVehicle.has(bl.vehicleId)) blocksByVehicle.set(bl.vehicleId, [])
    blocksByVehicle.get(bl.vehicleId)!.push(bl)
  }

  if (vehicles.length === 0) {
    return (
      <div className="surface ops-tl-outer" style={{ padding: 'var(--space-6)' }}>
        <h2 style={{ fontSize: '18px', margin: '0 0 var(--space-4)', color: 'rgb(var(--text))' }}>
          {t('title')}
        </h2>
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('empty')}</p>
      </div>
    )
  }

  return (
    <div className="surface ops-tl-outer">
      <style>{`
        .ops-tl-outer { padding: var(--space-6); }
        @media (max-width: 480px) {
          .ops-tl-outer { padding: var(--space-3); width: 100vw; margin-left: calc(50% - 50vw); border-radius: 0 !important; border: none !important; box-shadow: 0 -1px 0 rgb(var(--border) / 0.5), 0 1px 0 rgb(var(--border) / 0.5) !important; }
          .ops-tl-label-col { width: 80px !important; box-shadow: 6px 0 0 rgb(var(--surface)); }
          .ops-tl-day-row { margin-bottom: 0 !important; }
        }
      `}</style>

      {/* Header + legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: '18px', margin: 0, color: 'rgb(var(--text))' }}>
          {t('title')}
        </h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {LEGEND_STATUSES.map((status) => {
            const s = STATUS_STYLE[status]
            const labelKey = status === 'on_rent' ? 'onRent' : status === 'draft' ? 'pending' : status
            return (
              <span key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'rgb(var(--muted))' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, backgroundColor: s.bg, backgroundImage: s.bgImage, border: `1px solid ${s.border}`, display: 'inline-block' }} />
                {t(`legend.${labelKey}`)}
              </span>
            )
          })}
        </div>
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} style={{ overflowX: 'auto', width: '100%' }}>
        <div style={{ minWidth: `${LEFT_COL_PX + TIMELINE_PX}px` }}>

          {/* Month header row */}
          <div style={{ display: 'flex' }}>
            <div className="ops-tl-label-col" style={{ width: LEFT_COL_PX, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, background: 'rgb(var(--surface))' }} />
            <div style={{ flex: 1, position: 'relative', height: '16px' }}>
              {monthMarkers.map(({ label, leftPct }) => (
                <div
                  key={label}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    fontSize: '10px',
                    color: 'rgb(var(--muted))',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Day numbers row */}
          <div className="ops-tl-day-row" style={{ display: 'flex', marginBottom: '2px' }}>
            <div className="ops-tl-label-col" style={{ width: LEFT_COL_PX, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, background: 'rgb(var(--surface))' }} />
            <div style={{ flex: 1, position: 'relative', height: '16px' }}>
              {dayMarkers.map(({ label, leftPx, isToday }) => (
                <div
                  key={leftPx}
                  style={{
                    position: 'absolute',
                    left: `${leftPx}px`,
                    transform: 'translateX(-50%)',
                    fontSize: isToday ? '10px' : '9px',
                    fontWeight: isToday ? 700 : undefined,
                    color: isToday ? 'rgb(var(--brand))' : 'rgb(var(--muted) / 0.65)',
                    userSelect: 'none',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div style={{ display: 'flex' }}>

            {/* Vehicle name column */}
            <div className="ops-tl-label-col" style={{ width: LEFT_COL_PX, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, background: 'rgb(var(--surface))' }}>
              {vehicles.map((v, i) => (
                <div
                  key={v.id}
                  style={{
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'center',
                    borderTop: '1px solid rgb(var(--border) / 0.7)',
                    background: i % 2 !== 0 ? 'rgb(var(--muted) / 0.04)' : 'transparent',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'rgb(var(--text))',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingRight: '8px',
                      maxWidth: '100%',
                    }}
                  >
                    {v.name}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid rgb(var(--border) / 0.7)' }} />
            </div>

            {/* Bar area — explicit zIndex:0 creates a stacking context below the sticky left column (z:3) */}
            <div style={{ flex: 1, position: 'relative', zIndex: 0 }}>

              {/* Today column highlight — separate overlay so it never breaks row background layers */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: TODAY_L, width: PX_PER_DAY, background: 'rgb(var(--brand) / 0.18)', pointerEvents: 'none', zIndex: 0 }} />

              {vehicles.map((v, i) => {
                const vBookings = bookingsByVehicle.get(v.id) ?? []
                const vBlocks = blocksByVehicle.get(v.id) ?? []
                return (
                  <div
                    key={v.id}
                    style={{
                      height: ROW_H,
                      position: 'relative',
                      borderTop: '1px solid rgb(var(--border) / 0.7)',
                      background: i % 2 !== 0 ? `${DAY_BG}, rgb(var(--muted) / 0.04)` : DAY_BG,
                    }}
                  >
                    {weekendOffsets.map((leftPx) => (
                      <div key={leftPx} style={{ position: 'absolute', top: 0, bottom: 0, left: leftPx, width: PX_PER_DAY, background: '#f3f0ff', pointerEvents: 'none', zIndex: 0 }} />
                    ))}
                    {vBlocks.map((bl) => {
                      const startDay = dayOffset(new Date(bl.startAt))
                      const endDay = dayOffset(new Date(bl.endAt))
                      const cStart = Math.max(0, startDay)
                      const cEnd = Math.min(TOTAL_DAYS, endDay)
                      if (cStart >= cEnd) return null
                      const blS = new Date(bl.startAt).getTime()
                      const blE = new Date(bl.endAt).getTime()
                      const hasBookingOverlap = vBookings.some(
                        b => new Date(b.pickupAt).getTime() < blE && new Date(b.returnAt).getTime() > blS
                      )
                      const typeLabel = bl.blockType
                        ? tTypes(bl.blockType as Parameters<typeof tTypes>[0])
                        : t('legend.vehicleBlock')
                      const typeIcon = BLOCK_TYPE_ICON[bl.blockType ?? ''] ?? '⛔'
                      const displayLabel = bl.label
                        ? `${typeIcon} ${bl.label}`
                        : `${typeIcon} ${typeLabel}`
                      const tooltipText = hasBookingOverlap
                        ? t('legend.staleBlock', { label: bl.label ?? typeLabel })
                        : `${typeLabel}${bl.label ? ` · ${bl.label}` : ''}`
                      return (
                        <div
                          key={bl.id}
                          title={tooltipText}
                          style={{
                            position: 'absolute',
                            left: `${cStart * PX_PER_DAY}px`,
                            width: `${(cEnd - cStart) * PX_PER_DAY}px`,
                            top: '5px',
                            height: `${ROW_H - 10}px`,
                            background: STATUS_STYLE.blocked.bg,
                            border: `1px solid ${STATUS_STYLE.blocked.border}`,
                            borderRadius: '3px',
                            overflow: 'hidden',
                            zIndex: 1,
                            pointerEvents: 'none',
                            opacity: hasBookingOverlap ? 0.35 : 1,
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              fontSize: '10px',
                              fontWeight: 500,
                              color: STATUS_STYLE.blocked.text,
                              paddingLeft: '4px',
                              paddingTop: '2px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {displayLabel}
                          </span>
                        </div>
                      )
                    })}
                    {vBookings.map((b) => {
                      const pickupDate = new Date(b.pickupAt)
                      const returnDate = new Date(b.returnAt)
                      const startDay = dayOffset(pickupDate)
                      const endDay = dayOffset(returnDate)
                      const cStart = Math.max(0, startDay)
                      const cEnd = Math.min(TOTAL_DAYS, endDay)
                      if (cStart >= cEnd) return null
                      const s = STATUS_STYLE[b.status] ?? FALLBACK_STYLE
                      const label = (b.customerName || b.bookingNumber || '').replace(/^(\[\?\]|\?)\s*/, '')
                      return (
                        <Link
                          key={b.id}
                          href={`/${locale}/staff/bookings/${b.id}`}
                          title={`${label}\n${b.status}`}
                          style={{
                            position: 'absolute',
                            left: `${cStart * PX_PER_DAY}px`,
                            width: `${(cEnd - cStart) * PX_PER_DAY}px`,
                            top: '5px',
                            height: `${ROW_H - 10}px`,
                            backgroundColor: s.bg,
                            backgroundImage: s.bgImage,
                            border: `1px solid ${s.border}`,
                            borderRadius: '3px',
                            overflow: 'hidden',
                            zIndex: 1,
                            cursor: 'pointer',
                            textDecoration: 'none',
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              fontSize: '10px',
                              fontWeight: 500,
                              color: s.text,
                              paddingLeft: '4px',
                              paddingTop: '2px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {label}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid rgb(var(--border) / 0.7)' }} />
            </div>
          </div>
        </div>
      </div>

      <p style={{ marginTop: 'var(--space-2)', fontSize: '11px', color: 'rgb(var(--muted))', margin: 'var(--space-2) 0 0' }}>
        {t('footerHint')}
      </p>
    </div>
  )
}
