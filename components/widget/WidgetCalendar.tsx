'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { WidgetVehicle, WidgetBookingSlot, WidgetBlockSlot } from './WidgetTimeline'

interface RangeSelection {
  vehicleId: string
  pickupDate: string
  returnDate?: string
}

interface Props {
  vehicle: WidgetVehicle
  bookings: WidgetBookingSlot[]
  vehicleBlocks: WidgetBlockSlot[]
  companyTimezone: string
  onDayClick?: (vehicleId: string, dateStr: string) => void
  rangeSelection?: RangeSelection
}

const DOW_MAP: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

function toLocalDateStr(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: tz })
}

function buildMonthGrid(year: number, month: number, tz: string): (string | null)[][] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstDayStr = new Date(Date.UTC(year, month - 1, 1, 12))
    .toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' })
  const firstDow = DOW_MAP[firstDayStr] ?? 0

  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export default function WidgetCalendar({
  vehicle, bookings, vehicleBlocks, companyTimezone, onDayClick, rangeSelection,
}: Props) {
  const t = useTranslations('widget')
  const locale = useLocale()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  // Derive locale-aware weekday headers (Mon-first, short format)
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))
  )

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: companyTimezone })

  const bookedRanges = bookings
    .filter(b => b.vehicleId === vehicle.id)
    .map(b => ({
      start: toLocalDateStr(b.pickupAt, companyTimezone),
      end:   toLocalDateStr(b.returnAt, companyTimezone),
    }))

  const blockedRanges = vehicleBlocks
    .filter(bl => bl.vehicleId === vehicle.id)
    .map(bl => ({
      start: toLocalDateStr(bl.startAt, companyTimezone),
      end:   toLocalDateStr(bl.endAt, companyTimezone),
    }))

  const isBooked  = (d: string) => bookedRanges.some(r => d >= r.start && d < r.end)
  const isBlocked = (d: string) => blockedRanges.some(r => d >= r.start && d < r.end)

  const activeRange = rangeSelection?.vehicleId === vehicle.id ? rangeSelection : undefined
  const pickupStr   = activeRange?.pickupDate
  const returnStr   = activeRange?.returnDate
  const awaitingReturn = pickupStr !== undefined && returnStr === undefined

  // 3 rolling months starting from current month in company timezone
  const nowParts = new Date().toLocaleDateString('en-CA', {
    timeZone: companyTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('-').map(Number)
  const [curYear, curMonth] = nowParts

  const months: { year: number; month: number }[] = []
  for (let i = 0; i < 3; i++) {
    let y = curYear, m = curMonth + i
    if (m > 12) { m -= 12; y++ }
    months.push({ year: y, month: m })
  }

  function handleClick(dateStr: string) {
    if (!onDayClick) return
    if (dateStr < todayStr) return
    if (isBooked(dateStr) || isBlocked(dateStr)) return
    if (awaitingReturn && dateStr <= pickupStr!) return
    onDayClick(vehicle.id, dateStr)
  }

  return (
    <div>
      {awaitingReturn && (
        <div style={{
          marginBottom: 14,
          fontSize: 13,
          color: 'rgb(var(--wt-brand))',
          fontWeight: 500,
          padding: '8px 14px',
          background: 'rgb(var(--wt-brand) / 0.07)',
          borderRadius: 6,
          borderLeft: '3px solid rgb(var(--wt-brand) / 0.55)',
        }}>
          {t('calendar.pickupSelected')}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
        {months.map(({ year, month }) => {
          const grid = buildMonthGrid(year, month, companyTimezone)
          return (
            <div key={`${year}-${month}`} style={{ flex: '1 1 220px', minWidth: 220, maxWidth: 340 }}>

              {/* Month title */}
              <div style={{
                textAlign: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: 'rgb(var(--wt-text))',
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: '1.5px solid rgb(var(--wt-brand) / 0.25)',
              }}>
                {new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(year, month - 1))} {year}
              </div>

              {/* Weekday labels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                {weekdays.map(d => (
                  <div key={d} style={{
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'rgb(var(--wt-muted))',
                    paddingBottom: 4,
                    userSelect: 'none',
                  }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              {grid.map((week, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
                  {week.map((dateStr, di) => {
                    if (!dateStr) return <div key={di} />

                    const isPast   = dateStr < todayStr
                    const booked   = isBooked(dateStr)
                    const blocked  = isBlocked(dateStr)
                    const isToday  = dateStr === todayStr
                    const isPickup = dateStr === pickupStr
                    const isReturn = dateStr === returnStr
                    const inRange  = !!(pickupStr && returnStr && dateStr > pickupStr && dateStr < returnStr)
                    const isWeekend = di === 5 || di === 6

                    let cellBg      = isWeekend ? 'rgb(var(--wt-muted) / 0.05)' : 'transparent'
                    let cellColor   = 'rgb(var(--wt-text))'
                    let cellBorder  = '1.5px solid transparent'
                    let cellCursor  = 'default'
                    let cellFw: number | undefined = undefined
                    let cellOpacity = 1

                    if (isPickup || isReturn) {
                      cellBg     = 'rgb(var(--wt-brand))'
                      cellColor  = '#fff'
                      cellFw     = 700
                      cellCursor = 'default'
                    } else if (inRange) {
                      cellBg     = 'rgb(var(--wt-brand) / 0.14)'
                      cellBorder = '1.5px solid rgb(var(--wt-brand) / 0.22)'
                    } else if (booked) {
                      cellBg     = 'rgb(var(--wt-brand) / 0.72)'
                      cellColor  = '#fff'
                      cellBorder = '1.5px solid rgb(var(--wt-brand) / 0.90)'
                      cellCursor = 'not-allowed'
                    } else if (blocked) {
                      cellBg     = 'rgb(220 38 38 / 0.18)'
                      cellBorder = '1.5px solid rgb(220 38 38 / 0.50)'
                      cellColor  = 'rgb(var(--wt-muted))'
                      cellCursor = 'not-allowed'
                    } else if (isPast) {
                      cellOpacity = 0.28
                    } else if (isToday) {
                      cellBorder = '2px solid rgb(var(--wt-brand) / 0.70)'
                      cellColor  = 'rgb(var(--wt-brand))'
                      cellFw     = 700
                      cellCursor = 'pointer'
                    } else {
                      cellCursor = 'pointer'
                    }

                    return (
                      <div
                        key={dateStr}
                        onClick={() => handleClick(dateStr)}
                        title={booked ? t('legend.booked') : blocked ? t('legend.unavailable') : undefined}
                        style={{
                          aspectRatio: '1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: cellFw,
                          color: cellColor,
                          background: cellBg,
                          border: cellBorder,
                          borderRadius: 6,
                          cursor: cellCursor,
                          opacity: cellOpacity,
                          userSelect: 'none',
                        }}
                      >
                        {parseInt(dateStr.split('-')[2], 10)}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
