'use client'

import { useState, useCallback } from 'react'
import WidgetTimeline, { type WidgetVehicle, type WidgetBookingSlot, type WidgetBlockSlot } from './WidgetTimeline'
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
  const [prefill, setPrefill] = useState<DayPrefill | null>(null)
  const [rangeSelection, setRangeSelection] = useState<{
    vehicleId: string
    pickupDate: string
    returnDate?: string
  } | null>(null)

  const handleDayClick = useCallback((vehicleId: string, dateStr: string) => {
    // Second click: same vehicle, no return date yet, and clicked day is strictly later
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

    // First click, different vehicle, or reset (earlier/same date as current pickup)
    const newRange = { vehicleId, pickupDate: dateStr }
    setRangeSelection(newRange)
    setPrefill(p => ({ vehicleId, pickupDate: dateStr, returnDate: undefined, seq: (p?.seq ?? 0) + 1 }))
  }, [rangeSelection])

  return (
    <>
      {tlVehicles.length === 0 ? (
        <p style={{ fontSize: 14, color: '#888' }}>No vehicles configured for this widget.</p>
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
      <WidgetEnquirySection
        companyId={companyId}
        vehicles={formVehicles}
        primaryColor={primaryColor}
        prefill={prefill}
      />
    </>
  )
}
