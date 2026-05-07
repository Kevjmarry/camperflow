import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpsPickupsToday } from '@/lib/staff/operations/getOpsPickupsToday'
import { getOpsUpcomingPickups } from '@/lib/staff/operations/getOpsUpcomingPickups'
import { getOpsUpcomingReturns } from '@/lib/staff/operations/getOpsUpcomingReturns'
import { getOpsInvoiceReminders } from '@/lib/staff/operations/getOpsInvoiceReminders'
import { getOpsCompletedBookings } from '@/lib/staff/operations/getOpsCompletedBookings'
import { getOpsBlockedVehicles } from '@/lib/staff/operations/getOpsBlockedVehicles'
import { getOpsOnRentNow } from '@/lib/staff/operations/getOpsOnRentNow'
import { getOpsBookingTimeline } from '@/lib/staff/operations/getOpsBookingTimeline'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settled = await Promise.allSettled([
    getOpsPickupsToday(),
    getOpsUpcomingPickups(),
    getOpsUpcomingReturns(),
    getOpsInvoiceReminders(),
    getOpsCompletedBookings(),
    getOpsBlockedVehicles(),
    getOpsOnRentNow(),
    getOpsBookingTimeline(),
  ])

  const firstFailure = settled.find((r) => r.status === 'rejected')
  if (firstFailure) {
    const reason = (firstFailure as PromiseRejectedResult).reason
    return NextResponse.json(
      { error: reason?.message ?? 'Loader failed' },
      { status: 500 },
    )
  }

  const [
    pickups,
    upcomingPickups,
    upcomingReturns,
    invoiceReminders,
    completed,
    blockedVehicles,
    onRentNow,
    timelineData,
  ] = settled.map((r) => (r as PromiseFulfilledResult<unknown>).value)

  return NextResponse.json(
    { pickups, upcomingPickups, upcomingReturns, invoiceReminders, completed, blockedVehicles, onRentNow, timelineData },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
