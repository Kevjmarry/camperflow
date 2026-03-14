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

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const [pickups, returns, preparing, overdue] = await Promise.all([
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

    // vehicles table kept: view cannot deduplicate vehicles with multiple bookings
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'preparing'),

    supabase
      .from('ops_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_overdue', true),
  ])

  if (pickups.error) throw pickups.error
  if (returns.error) throw returns.error
  if (preparing.error) throw preparing.error
  if (overdue.error) throw overdue.error

  return {
    pickupsToday: pickups.count ?? 0,
    returnsToday: returns.count ?? 0,
    vehiclesPreparing: preparing.count ?? 0,
    overdueReturns: overdue.count ?? 0,
  }
}
