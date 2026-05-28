'use client'

import { useRef, useEffect, useState } from 'react'

export interface WidgetVehicle {
  id: string
  name: string
}

export interface WidgetBookingSlot {
  vehicleId: string
  pickupAt: string
  returnAt: string
}

export interface WidgetBlockSlot {
  vehicleId: string
  startAt: string
  endAt: string
}

interface RangeSelection {
  vehicleId: string
  pickupDate: string
  returnDate?: string
}

interface Props {
  vehicles: WidgetVehicle[]
  bookings: WidgetBookingSlot[]
  vehicleBlocks: WidgetBlockSlot[]
  companyTimezone?: string
  onDayClick?: (vehicleId: string, dateStr: string) => void
  rangeSelection?: RangeSelection
}

// Same visual constants as OperationsBookingTimeline
const DAYS_BACK = 7
const DAYS_FORWARD = 90
const TOTAL_DAYS = DAYS_BACK + DAYS_FORWARD
const PX_PER_DAY = 28
const TIMELINE_PX = TOTAL_DAYS * PX_PER_DAY
const LEFT_COL_PX = 144
const ROW_H = 34

const DAY_BG = `repeating-linear-gradient(to right, rgb(var(--wt-muted) / 0.03) 0, rgb(var(--wt-muted) / 0.03) ${PX_PER_DAY}px, transparent ${PX_PER_DAY}px, transparent ${PX_PER_DAY * 2}px)`
const TODAY_L = DAYS_BACK * PX_PER_DAY

// Bars: brand color for booked, muted red for vehicle blocks
const BOOKED_BG = 'rgb(var(--wt-brand) / 0.65)'
const BOOKED_BORDER = 'rgb(var(--wt-brand) / 0.90)'
const BLOCK_BG = 'rgb(220 38 38 / 0.20)'
const BLOCK_BORDER = 'rgb(220 38 38 / 0.55)'

export default function WidgetTimeline({ vehicles, bookings, vehicleBlocks, companyTimezone = 'UTC', onDayClick, rangeSelection }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && scrollRef.current) {
      scrollRef.current.scrollLeft = (DAYS_BACK - 2) * PX_PER_DAY
    }
  }, [mounted])

  if (!mounted) return null

  const now = new Date()

  // Compute company-local today midnight (same pattern as OperationsBookingTimeline)
  const tzParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: companyTimezone,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now)
  const tzH = +(tzParts.find(p => p.type === 'hour')!.value)
  const tzM = +(tzParts.find(p => p.type === 'minute')!.value)
  const tzS = +(tzParts.find(p => p.type === 'second')!.value)
  const todayMidnight = new Date(now.getTime() - (tzH * 3600 + tzM * 60 + tzS) * 1000 - now.getMilliseconds())

  const windowStart = new Date(todayMidnight.getTime() - DAYS_BACK * 86_400_000)

  function dayOffset(date: Date): number {
    return (date.getTime() - windowStart.getTime()) / 86_400_000
  }

  // Find the day-index for a YYYY-MM-DD string (company-timezone local date)
  function findDayIndex(dateStr: string): number {
    for (let d = 0; d < TOTAL_DAYS; d++) {
      if (new Date(windowStart.getTime() + d * 86_400_000)
          .toLocaleDateString('en-CA', { timeZone: companyTimezone }) === dateStr) {
        return d
      }
    }
    return -1
  }

  // Month markers
  const monthMarkers: { label: string; leftPct: number }[] = []
  {
    const wsParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: companyTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(windowStart)
    let mYear  = +(wsParts.find(p => p.type === 'year')!.value)
    let mMonth = +(wsParts.find(p => p.type === 'month')!.value)
    const mDay = +(wsParts.find(p => p.type === 'day')!.value)
    if (mDay > 1) { if (++mMonth > 12) { mMonth = 1; mYear++ } }
    while (true) {
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

  // Day markers
  const dayMarkers: { label: string; leftPx: number; isToday: boolean }[] = []
  const weekendOffsets: number[] = []
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: companyTimezone, weekday: 'short' })
  for (let d = 0; d < TOTAL_DAYS; d++) {
    const date = new Date(windowStart.getTime() + d * 86_400_000)
    const dayNum = date.toLocaleDateString('en-CA', { timeZone: companyTimezone, day: 'numeric' })
    dayMarkers.push({ label: dayNum, leftPx: (d + 0.5) * PX_PER_DAY, isToday: d === DAYS_BACK })
    if (weekdayFmt.format(date) === 'Sun') weekendOffsets.push(d * PX_PER_DAY)
  }

  // Group by vehicle
  const bookingsByVehicle = new Map<string, WidgetBookingSlot[]>()
  for (const b of bookings) {
    if (!bookingsByVehicle.has(b.vehicleId)) bookingsByVehicle.set(b.vehicleId, [])
    bookingsByVehicle.get(b.vehicleId)!.push(b)
  }
  const blocksByVehicle = new Map<string, WidgetBlockSlot[]>()
  for (const bl of vehicleBlocks) {
    if (!blocksByVehicle.has(bl.vehicleId)) blocksByVehicle.set(bl.vehicleId, [])
    blocksByVehicle.get(bl.vehicleId)!.push(bl)
  }

  // True when we're waiting for the user to click a return date on the pending vehicle
  const awaitingReturn = rangeSelection !== undefined && rangeSelection.returnDate === undefined

  return (
    <div style={{ overflowX: 'auto', width: '100%', overscrollBehaviorX: 'contain' }} ref={scrollRef}>
      <div style={{ minWidth: `${LEFT_COL_PX + TIMELINE_PX}px` }}>

        {/* Month header row */}
        <div style={{ display: 'flex' }}>
          <div style={{ width: LEFT_COL_PX, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, background: 'rgb(var(--wt-surface))' }} />
          <div style={{ flex: 1, position: 'relative', height: 16 }}>
            {monthMarkers.map(({ label, leftPct }) => (
              <div
                key={label}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  fontSize: 10,
                  color: 'rgb(var(--wt-muted))',
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
        <div style={{ display: 'flex', marginBottom: 2 }}>
          <div style={{ width: LEFT_COL_PX, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, background: 'rgb(var(--wt-surface))' }} />
          <div style={{ flex: 1, position: 'relative', height: 16 }}>
            {dayMarkers.map(({ label, leftPx, isToday }) => (
              <div
                key={leftPx}
                style={{
                  position: 'absolute',
                  left: leftPx,
                  transform: 'translateX(-50%)',
                  fontSize: isToday ? 10 : 9,
                  fontWeight: isToday ? 700 : undefined,
                  color: isToday ? 'rgb(var(--wt-brand))' : 'rgb(var(--wt-muted) / 0.65)',
                  userSelect: 'none',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Vehicle rows */}
        <div style={{ display: 'flex' }}>

          {/* Sticky vehicle name column */}
          <div style={{ width: LEFT_COL_PX, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, background: 'rgb(var(--wt-surface))' }}>
            {vehicles.map((v, i) => (
              <div
                key={v.id}
                style={{
                  height: ROW_H,
                  display: 'flex',
                  alignItems: 'center',
                  borderTop: '1px solid rgb(var(--wt-border) / 0.7)',
                  background: i % 2 !== 0 ? 'rgb(var(--wt-muted) / 0.04)' : 'transparent',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'rgb(var(--wt-text))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: 8,
                    maxWidth: '100%',
                  }}
                >
                  {v.name}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgb(var(--wt-border) / 0.7)' }} />
          </div>

          {/* Bar area */}
          <div style={{ flex: 1, position: 'relative', zIndex: 0 }}>

            {/* Today highlight */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: TODAY_L, width: PX_PER_DAY, background: 'rgb(var(--wt-brand) / 0.18)', pointerEvents: 'none', zIndex: 0 }} />

            {vehicles.map((v, i) => {
              const vBookings = bookingsByVehicle.get(v.id) ?? []
              const vBlocks = blocksByVehicle.get(v.id) ?? []

              // Cursor: crosshair on the active vehicle while awaiting return date
              const rowCursor = onDayClick
                ? (awaitingReturn && rangeSelection!.vehicleId === v.id ? 'crosshair' : 'pointer')
                : undefined

              return (
                <div
                  key={v.id}
                  onClick={onDayClick ? (e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const d = Math.floor((e.clientX - rect.left) / PX_PER_DAY)
                    if (d < DAYS_BACK || d >= TOTAL_DAYS) return
                    const isOccupied =
                      vBookings.some(b => {
                        const s = dayOffset(new Date(b.pickupAt))
                        const en = dayOffset(new Date(b.returnAt))
                        return s < d + 1 && en > d
                      }) ||
                      vBlocks.some(bl => {
                        const s = dayOffset(new Date(bl.startAt))
                        const en = dayOffset(new Date(bl.endAt))
                        return s < d + 1 && en > d
                      })
                    if (isOccupied) return
                    const dateStr = new Date(windowStart.getTime() + d * 86_400_000)
                      .toLocaleDateString('en-CA', { timeZone: companyTimezone })
                    onDayClick(v.id, dateStr)
                  } : undefined}
                  style={{
                    height: ROW_H,
                    position: 'relative',
                    borderTop: '1px solid rgb(var(--wt-border) / 0.7)',
                    background: i % 2 !== 0 ? `${DAY_BG}, rgb(var(--wt-muted) / 0.04)` : DAY_BG,
                    cursor: rowCursor,
                  }}
                >
                  {weekendOffsets.map(leftPx => (
                    <div key={leftPx} style={{ position: 'absolute', top: 0, bottom: 0, left: leftPx, width: PX_PER_DAY, background: '#f3f0ff', pointerEvents: 'none', zIndex: 0 }} />
                  ))}

                  {/* Range selection highlight — rendered before booking/block bars so they appear on top */}
                  {(() => {
                    if (!rangeSelection || rangeSelection.vehicleId !== v.id) return null
                    const startD = findDayIndex(rangeSelection.pickupDate)
                    if (startD < 0) return null
                    const endD = rangeSelection.returnDate
                      ? findDayIndex(rangeSelection.returnDate)
                      : startD + 1
                    if (rangeSelection.returnDate && endD < 0) return null
                    const cStart = Math.max(0, startD)
                    const cEnd = Math.min(TOTAL_DAYS, endD < 0 ? TOTAL_DAYS : endD)
                    if (cStart >= cEnd) return null
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          left: cStart * PX_PER_DAY,
                          width: (cEnd - cStart) * PX_PER_DAY,
                          top: 0,
                          height: ROW_H,
                          background: rangeSelection.returnDate
                            ? 'rgb(var(--wt-brand) / 0.12)'
                            : 'rgb(var(--wt-brand) / 0.22)',
                          borderLeft: '2px solid rgb(var(--wt-brand) / 0.80)',
                          borderRight: rangeSelection.returnDate
                            ? '2px solid rgb(var(--wt-brand) / 0.80)'
                            : undefined,
                          zIndex: 1,
                          pointerEvents: 'none',
                        }}
                      />
                    )
                  })()}

                  {/* Vehicle block bars */}
                  {vBlocks.map((bl, idx) => {
                    const startDay = dayOffset(new Date(bl.startAt))
                    const endDay = dayOffset(new Date(bl.endAt))
                    const cStart = Math.max(0, startDay)
                    const cEnd = Math.min(TOTAL_DAYS, endDay)
                    if (cStart >= cEnd) return null
                    return (
                      <div
                        key={`bl-${idx}`}
                        title="Unavailable"
                        style={{
                          position: 'absolute',
                          left: cStart * PX_PER_DAY,
                          width: (cEnd - cStart) * PX_PER_DAY,
                          top: 5,
                          height: ROW_H - 10,
                          background: BLOCK_BG,
                          border: `1px solid ${BLOCK_BORDER}`,
                          borderRadius: 3,
                          zIndex: 1,
                          pointerEvents: 'none',
                        }}
                      />
                    )
                  })}

                  {/* Booking bars */}
                  {vBookings.map((b, idx) => {
                    const startDay = dayOffset(new Date(b.pickupAt))
                    const endDay = dayOffset(new Date(b.returnAt))
                    const cStart = Math.max(0, startDay)
                    const cEnd = Math.min(TOTAL_DAYS, endDay)
                    if (cStart >= cEnd) return null
                    return (
                      <div
                        key={`b-${idx}`}
                        title="Booked"
                        style={{
                          position: 'absolute',
                          left: cStart * PX_PER_DAY,
                          width: (cEnd - cStart) * PX_PER_DAY,
                          top: 5,
                          height: ROW_H - 10,
                          background: BOOKED_BG,
                          border: `1px solid ${BOOKED_BORDER}`,
                          borderRadius: 3,
                          zIndex: 2,
                          pointerEvents: 'none',
                        }}
                      />
                    )
                  })}
                </div>
              )
            })}
            <div style={{ borderTop: '1px solid rgb(var(--wt-border) / 0.7)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
