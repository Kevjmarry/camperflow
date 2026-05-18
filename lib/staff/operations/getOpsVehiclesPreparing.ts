import { createClient } from '@/lib/supabase/server'

export interface OpsVehiclePreparing {
  id: string
  name: string
  plate: string
  bookingNumber: string
  pickupAt: string
  vehicleBlocked: boolean
  hasOpenVehicleIssue: boolean
  hasExpiredCompliance: boolean
}

export async function getOpsVehiclesPreparing(): Promise<OpsVehiclePreparing[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user?.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!companyId) {
    return []
  }

  const now = new Date()
  const nowStr = now.toISOString()

  // Only surface vehicles that have a real confirmed booking within the next
  // 30 days. This prevents vehicles that were stuck in 'preparing' by old
  // iCal imports (never moved to on_rent / completed) from cluttering the list.
  const thirtyDaysFromNow = new Date(now)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const thirtyDaysStr = thirtyDaysFromNow.toISOString()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, name, registration_plate, operational_hold, bookings(booking_number, pickup_at, status)')
    .eq('status', 'preparing')
    .eq('company_id', companyId)

  if (error) throw error

  const vehicleIds = (data ?? []).map((v) => v.id)

  const { data: openIssues, error: issueError } = vehicleIds.length
    ? await supabase
        .from('vehicle_issues')
        .select('vehicle_id')
        .in('vehicle_id', vehicleIds)
        .eq('resolved', false)
    : { data: [], error: null }

  if (issueError) throw issueError

  const vehiclesWithOpenIssues = new Set((openIssues ?? []).map((i) => i.vehicle_id))

  const todayStr = now.toISOString().slice(0, 10)

  const { data: complianceRecords, error: complianceError } = vehicleIds.length
    ? await supabase
        .from('vehicle_compliance')
        .select('vehicle_id, expiry_date, service_due_odometer_km, compliance_types!inner(blocks_readiness), vehicles(latest_odometer)')
        .in('vehicle_id', vehicleIds)
        .eq('compliance_types.blocks_readiness', true)
    : { data: [], error: null }

  if (complianceError) throw complianceError

  const vehiclesWithExpiredCompliance = new Set<string>()
  for (const c of complianceRecords ?? []) {
    if (!c.vehicle_id) continue
    const dateExpired = c.expiry_date != null && c.expiry_date < todayStr
    const veh = Array.isArray(c.vehicles) ? c.vehicles[0] : c.vehicles as { latest_odometer: number | null } | null
    const kmOverdue = c.service_due_odometer_km != null && veh?.latest_odometer != null && veh.latest_odometer >= c.service_due_odometer_km
    if (dateExpired || kmOverdue) vehiclesWithExpiredCompliance.add(c.vehicle_id)
  }

  return (data ?? [])
    .map((v) => {
      const bookings = (v.bookings as unknown as { booking_number: string; pickup_at: string; status: string }[] | null) ?? []

      // Only consider confirmed bookings within the 30-day window.
      const next = bookings
        .filter(
          (b) =>
            b.status === 'confirmed' &&
            b.pickup_at >= nowStr &&
            b.pickup_at <= thirtyDaysStr,
        )
        .sort((a, b) => a.pickup_at.localeCompare(b.pickup_at))[0]

      // No relevant upcoming booking → exclude unless a blocking risk signal is present.
      const isRisky =
        v.operational_hold === true ||
        vehiclesWithExpiredCompliance.has(v.id) ||
        vehiclesWithOpenIssues.has(v.id)

      if (!next && !isRisky) return null

      return {
        id: v.id,
        name: v.name ?? '',
        plate: v.registration_plate ?? '',
        bookingNumber: next?.booking_number ?? '',
        pickupAt: next?.pickup_at ?? '',
        vehicleBlocked: v.operational_hold === true,
        hasOpenVehicleIssue: vehiclesWithOpenIssues.has(v.id),
        hasExpiredCompliance: vehiclesWithExpiredCompliance.has(v.id),
      }
    })
    .filter((v): v is OpsVehiclePreparing => v !== null)
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt))
}
