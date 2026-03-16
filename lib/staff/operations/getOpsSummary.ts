import { createClient } from '@/lib/supabase/server'

export interface OpsSummary {
  pickupsToday: number
  returnsToday: number
  vehiclesPreparing: number
  overdueReturns: number
}

export async function getOpsSummary(): Promise<OpsSummary> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user?.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!companyId) {
    return {
      pickupsToday: 0,
      returnsToday: 0,
      vehiclesPreparing: 0,
      overdueReturns: 0,
    }
  }

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  // Window for vehicles "preparing": only count those with a confirmed booking
  // within the next 30 days to avoid vehicles stuck from old iCal imports.
  const thirtyDaysFromNow = new Date(now)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const nowStr = now.toISOString()
  const thirtyDaysStr = thirtyDaysFromNow.toISOString()

  const [pickups, returns, preparingData, overdue] = await Promise.all([
    supabase
      .from('ops_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('booking_status', ['confirmed', 'blocked'])
      .gte('pickup_at', todayStart.toISOString())
      .lte('pickup_at', todayEnd.toISOString()),

    supabase
      .from('ops_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('booking_status', 'on_rent')
      .gte('return_at', todayStart.toISOString())
      .lte('return_at', todayEnd.toISOString()),

    // Fetch preparing vehicles with their bookings so we can filter to only
    // those with a real upcoming confirmed booking (avoids stuck iCal imports).
    supabase
      .from('vehicles')
      .select('id, bookings(pickup_at, status)')
      .eq('company_id', companyId)
      .eq('status', 'preparing'),

    // Only count genuinely active on_rent bookings as overdue — confirmed
    // iCal imports that were never activated should never appear here.
    supabase
      .from('ops_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('booking_status', 'on_rent')
      .eq('is_overdue', true),
  ])

  if (pickups.error) throw pickups.error
  if (returns.error) throw returns.error
  if (preparingData.error) throw preparingData.error
  if (overdue.error) throw overdue.error

  const vehiclesPreparing = (preparingData.data ?? []).filter((v) => {
    const bookings = (v.bookings as { pickup_at: string; status: string }[] | null) ?? []
    return bookings.some(
      (b) =>
        b.status === 'confirmed' &&
        b.pickup_at >= nowStr &&
        b.pickup_at <= thirtyDaysStr,
    )
  }).length

  return {
    pickupsToday: pickups.count ?? 0,
    returnsToday: returns.count ?? 0,
    vehiclesPreparing,
    overdueReturns: overdue.count ?? 0,
  }
}
