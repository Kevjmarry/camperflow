import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

export interface OpsCompletedBooking {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  returnAt: string | null
  pickupAt: string
  vehicleBlocked: boolean
  hasExpiredCompliance: boolean
  hasOpenVehicleIssue: boolean
}

export async function getOpsCompletedBookings(): Promise<OpsCompletedBooking[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id || !isUUID(user.id)) return []
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!isUUID(companyId)) return []

  const { data, error } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, vehicle_name, vehicle_id, vehicle_blocked, return_at, pickup_at')
    .eq('company_id', companyId)
    .eq('booking_status', 'completed')
    .order('return_at', { ascending: false })
    .limit(20)

  if (error) throw error

  const vehicleIds = (data ?? []).map((b) => b.vehicle_id).filter(isUUID)
  const todayStr = new Date().toISOString().slice(0, 10)

  const { data: expiredCompliance, error: ecError } = vehicleIds.length
    ? await supabase
        .from('vehicle_compliance')
        .select('vehicle_id, expiry_date, compliance_types!inner(blocks_readiness)')
        .in('vehicle_id', vehicleIds)
        .not('expiry_date', 'is', null)
        .lt('expiry_date', todayStr)
        .eq('compliance_types.blocks_readiness', true)
    : { data: [], error: null }

  if (ecError) throw ecError

  const vehiclesWithExpiredCompliance = new Set((expiredCompliance ?? []).map((c) => c.vehicle_id))

  const { data: openIssues, error: oiError } = vehicleIds.length
    ? await supabase
        .from('vehicle_issues')
        .select('vehicle_id')
        .in('vehicle_id', vehicleIds)
        .eq('resolved', false)
    : { data: [], error: null }

  if (oiError) throw oiError

  const vehiclesWithOpenIssues = new Set((openIssues ?? []).map((i) => i.vehicle_id))

  return (data ?? []).map((b) => ({
    id: b.id,
    bookingNumber: b.booking_number ?? '',
    customerName: b.customer_name ?? '',
    vehicleName: b.vehicle_name ?? '',
    returnAt: b.return_at ?? null,
    pickupAt: b.pickup_at,
    vehicleBlocked: b.vehicle_blocked === true,
    hasExpiredCompliance: b.vehicle_id ? vehiclesWithExpiredCompliance.has(b.vehicle_id) : false,
    hasOpenVehicleIssue: b.vehicle_id ? vehiclesWithOpenIssues.has(b.vehicle_id) : false,
  }))
}
