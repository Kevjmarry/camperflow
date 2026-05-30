'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import WidgetTimeline, { type WidgetVehicle, type WidgetBookingSlot, type WidgetBlockSlot } from './WidgetTimeline'
import WidgetCalendar from './WidgetCalendar'
import WidgetEnquirySection from './WidgetEnquirySection'

export interface DayPrefill {
  vehicleId: string
  pickupDate: string
  returnDate?: string
  seq: number
}

interface FormVehicle {
  id: string
  name: string
  registration: string
}

interface Props {
  tlVehicles: WidgetVehicle[]
  tlBookings: WidgetBookingSlot[]
  tlBlocks: WidgetBlockSlot[]
  companyTimezone: string
  companyId: string
  formVehicles: FormVehicle[]
  primaryColor: string
}

export default function WidgetClient({
  tlVehicles, tlBookings, tlBlocks, companyTimezone,
  companyId, formVehicles, primaryColor,
}: Props) {
  const t = useTranslations('widget')
  const [prefill, setPrefill] = useState<DayPrefill | null>(null)
  const [rangeSelection, setRangeSelection] = useState<{
    vehicleId: string
    pickupDate: string
    returnDate?: string
  } | null>(null)

  const handleDayClick = useCallback((vehicleId: string, dateStr: string) => {
    // Second click: same vehicle, no return date yet, clicked day is strictly later
    if (
      rangeSelection !== null &&
      rangeSelection.vehicleId === vehicleId &&
      rangeSelection.returnDate === undefined &&
      dateStr > rangeSelection.pickupDate
    ) {
      const newRange = { vehicleId, pickupDate: rangeSelection.pickupDate, returnDate: dateStr }
      setRangeSelection(newRange)
      setPrefill(p => ({ ...newRange, seq: (p?.seq ?? 0) + 1 }))
      return
    }

    // First click, different vehicle, or reset
    const newRange = { vehicleId, pickupDate: dateStr }
    setRangeSelection(newRange)
    setPrefill(p => ({ vehicleId, pickupDate: dateStr, returnDate: undefined, seq: (p?.seq ?? 0) + 1 }))
  }, [rangeSelection])

  return (
    <>
      {tlVehicles.length === 0 ? (
        <p style={{ fontSize: 14, color: '#888' }}>{t('noVehicles')}</p>
      ) : tlVehicles.length === 1 ? (
        <WidgetCalendar
          vehicle={tlVehicles[0]}
          bookings={tlBookings}
          vehicleBlocks={tlBlocks}
          companyTimezone={companyTimezone}
          onDayClick={handleDayClick}
          rangeSelection={rangeSelection ?? undefined}
        />
      ) : (
        <WidgetTimeline
          vehicles={tlVehicles}
          bookings={tlBookings}
          vehicleBlocks={tlBlocks}
          companyTimezone={companyTimezone}
          onDayClick={handleDayClick}
          rangeSelection={rangeSelection ?? undefined}
        />
      )}

      {/* Legend — below calendar/timeline, above enquiry button */}
      {tlVehicles.length > 0 && (
        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid #ddd', background: '#fff', flexShrink: 0 }} />
            {t('legend.available')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
            <div style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              background: 'rgb(var(--wt-brand) / 0.75)',
              border: '1px solid rgb(var(--wt-brand) / 0.90)',
            }} />
            {t('legend.booked')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: 'rgb(220 38 38 / 0.22)', border: '1px solid rgb(220 38 38 / 0.55)' }} />
            {t('legend.unavailable')}
          </div>
        </div>
      )}

      <WidgetEnquirySection
        companyId={companyId}
        vehicles={formVehicles}
        primaryColor={primaryColor}
        prefill={prefill}
      />
    </>
  )
}
