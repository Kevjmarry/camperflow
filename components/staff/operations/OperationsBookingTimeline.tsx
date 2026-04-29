'use client'

import { useRef, useEffect } from 'react'
import type { OpsTimelineVehicle, OpsTimelineBooking } from '@/lib/staff/operations/getOpsBookingTimeline'

interface Props {
  vehicles: OpsTimelineVehicle[]
  bookings: OpsTimelineBooking[]
}

const DAYS_BACK = 30
const DAYS_FORWARD = 180
const TOTAL_DAYS = DAYS_BACK + DAYS_FORWARD
const PX_PER_DAY = 6
const TIMELINE_PX = TOTAL_DAYS * PX_PER_DAY // 1260
const LEFT_COL_PX = 144
const ROW_H = 34

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  draft:     { bg: 'rgb(var(--muted) / 0.18)', border: 'rgb(var(--muted) / 0.35)',   text: 'rgb(var(--muted))' },
  confirmed: { bg: 'rgb(var(--brand) / 0.15)', border: 'rgb(var(--brand) / 0.45)',   text: 'rgb(var(--brand))' },
  blocked:   { bg: 'rgb(var(--warning) / 0.15)', border: 'rgb(var(--warning) / 0.5)', text: 'rgb(var(--warning))' },
  on_rent:   { bg: 'rgb(var(--success) / 0.15)', border: 'rgb(var(--success) / 0.5)', text: 'rgb(var(--success))' },
  completed: { bg: 'rgb(var(--muted) / 0.08)', border: 'rgb(var(--border))',          text: 'rgb(var(--muted))' },
}
const FALLBACK_STYLE = STATUS_STYLE.draft

const LEGEND = [
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'on_rent',   label: 'On Rent' },
  { status: 'blocked',   label: 'Blocked' },
  { status: 'draft',     label: 'Draft' },
  { status: 'completed', label: 'Completed' },
] as const

export default function OperationsBookingTimeline({ vehicles, bookings }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll so today is visible near the left of the viewport on mount
  useEffect(() => {
    if (scrollRef.current) {
      const todayPx = (DAYS_BACK / TOTAL_DAYS) * TIMELINE_PX
      scrollRef.current.scrollLeft = Math.max(0, todayPx - 240)
    }
  }, [])

  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setDate(windowStart.getDate() - DAYS_BACK)
  windowStart.setHours(0, 0, 0, 0)

  function dayOffset(date: Date): number {
    return (date.getTime() - windowStart.getTime()) / 86_400_000
  }

  // Month boundary markers
  const monthMarkers: { label: string; leftPct: number }[] = []
  const cur = new Date(windowStart)
  cur.setDate(1)
  if (cur < windowStart) cur.setMonth(cur.getMonth() + 1)
  while (dayOffset(cur) < TOTAL_DAYS) {
    const off = dayOffset(cur)
    if (off >= 0) {
      monthMarkers.push({
        label: cur.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        leftPct: (off / TOTAL_DAYS) * 100,
      })
    }
    cur.setMonth(cur.getMonth() + 1)
  }

  const todayPct = (DAYS_BACK / TOTAL_DAYS) * 100

  const bookingsByVehicle = new Map<string, OpsTimelineBooking[]>()
  for (const b of bookings) {
    if (!bookingsByVehicle.has(b.vehicleId)) bookingsByVehicle.set(b.vehicleId, [])
    bookingsByVehicle.get(b.vehicleId)!.push(b)
  }

  if (vehicles.length === 0) {
    return (
      <div className="surface" style={{ padding: 'var(--space-6)' }}>
        <h2 style={{ fontSize: '18px', margin: '0 0 var(--space-4)', color: 'rgb(var(--text))' }}>
          Vehicle Booking Timeline
        </h2>
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No vehicles found.</p>
      </div>
    )
  }

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>

      {/* Header + legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: '18px', margin: 0, color: 'rgb(var(--text))' }}>
          Vehicle Booking Timeline
        </h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {LEGEND.map(({ status, label }) => {
            const s = STATUS_STYLE[status]
            return (
              <span key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'rgb(var(--muted))' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: s.bg, border: `1px solid ${s.border}`, display: 'inline-block' }} />
                {label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} style={{ overflowX: 'auto', width: '100%' }}>
        <div style={{ minWidth: `${LEFT_COL_PX + TIMELINE_PX}px` }}>

          {/* Month header row */}
          <div style={{ display: 'flex', marginBottom: '2px' }}>
            <div style={{ width: LEFT_COL_PX, flexShrink: 0 }} />
            <div style={{ flex: 1, position: 'relative', height: '18px' }}>
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

          {/* Rows */}
          <div style={{ display: 'flex' }}>

            {/* Vehicle name column */}
            <div style={{ width: LEFT_COL_PX, flexShrink: 0 }}>
              {vehicles.map((v, i) => (
                <div
                  key={v.id}
                  style={{
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'center',
                    borderTop: '1px solid rgb(var(--border) / 0.4)',
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
              <div style={{ borderTop: '1px solid rgb(var(--border) / 0.4)' }} />
            </div>

            {/* Bar area (position:relative anchors the today line) */}
            <div style={{ flex: 1, position: 'relative' }}>

              {/* Today vertical line */}
              <div
                style={{
                  position: 'absolute',
                  left: `${todayPct}%`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  background: 'rgb(var(--danger))',
                  opacity: 0.55,
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              />

              {vehicles.map((v, i) => {
                const vBookings = bookingsByVehicle.get(v.id) ?? []
                return (
                  <div
                    key={v.id}
                    style={{
                      height: ROW_H,
                      position: 'relative',
                      borderTop: '1px solid rgb(var(--border) / 0.4)',
                      background: i % 2 !== 0 ? 'rgb(var(--muted) / 0.04)' : 'transparent',
                    }}
                  >
                    {vBookings.map((b) => {
                      const startDay = dayOffset(new Date(b.pickupAt))
                      const endDay = dayOffset(new Date(b.returnAt))
                      const cStart = Math.max(0, startDay)
                      const cEnd = Math.min(TOTAL_DAYS, endDay)
                      if (cStart >= cEnd) return null
                      const leftPct = (cStart / TOTAL_DAYS) * 100
                      const widthPct = ((cEnd - cStart) / TOTAL_DAYS) * 100
                      const s = STATUS_STYLE[b.status] ?? FALLBACK_STYLE
                      const label = [b.bookingNumber, b.customerName].filter(Boolean).join(' · ')
                      return (
                        <div
                          key={b.id}
                          title={`${label}\n${b.status}`}
                          style={{
                            position: 'absolute',
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            top: '5px',
                            height: `${ROW_H - 10}px`,
                            background: s.bg,
                            border: `1px solid ${s.border}`,
                            borderRadius: '3px',
                            overflow: 'hidden',
                            zIndex: 1,
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
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid rgb(var(--border) / 0.4)' }} />
            </div>
          </div>
        </div>
      </div>

      <p style={{ marginTop: 'var(--space-2)', fontSize: '11px', color: 'rgb(var(--muted))', margin: 'var(--space-2) 0 0' }}>
        Red line = today · Scroll to navigate · Cancelled bookings hidden
      </p>
    </div>
  )
}
