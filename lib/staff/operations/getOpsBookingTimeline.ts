import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

export interface OpsTimelineVehicle {
  id: string
  name: string
}

export interface OpsTimelineBooking {
  id: string
  bookingNumber: string
  customerName: string
  vehicleId: string
  pickupAt: string
  returnAt: string
  status: string
}

export interface OpsTimelineData {
  vehicles: OpsTimelineVehicle[]
  bookings: OpsTimelineBooking[]
}

export async function getOpsBookingTimeline(): Promise<OpsTimelineData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id || !isUUID(user.id)) return { vehicles: [], bookings: [] }

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const companyId = profile?.company_id
  if (!isUUID(companyId)) return { vehicles: [], bookings: [] }

  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setDate(windowStart.getDate() - 30)
  const windowEnd = new Date(now)
  windowEnd.setDate(windowEnd.getDate() + 180)

  const { data: vehicles, error: vError } = await supabase
    .from('vehicles')
    .select('id, name')
    .eq('company_id', companyId)
    .order('name', { ascending: true })

  if (vError) throw vError

  const vehicleIds = (vehicles ?? []).map((v) => v.id).filter(isUUID)
  if (!vehicleIds.length) return { vehicles: [], bookings: [] }

  // Bookings overlapping the window: return_at >= windowStart AND pickup_at <= windowEnd
  const { data: bookings, error: bError } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, vehicle_id, pickup_at, return_at, booking_status')
    .eq('company_id', companyId)
    .in('vehicle_id', vehicleIds)
    .not('booking_status', 'eq', 'cancelled')
    .not('return_at', 'is', null)
    .gte('return_at', windowStart.toISOString())
    .lte('pickup_at', windowEnd.toISOString())
    .order('pickup_at', { ascending: true })

  if (bError) throw bError

  return {
    vehicles: (vehicles ?? [])
      .filter((v) => isUUID(v.id))
      .map((v) => ({ id: v.id as string, name: v.name ?? '' })),
    bookings: (bookings ?? [])
      .filter((b) => isUUID(b.vehicle_id) && b.pickup_at && b.return_at)
      .map((b) => ({
        id: b.id,
        bookingNumber: b.booking_number ?? '',
        customerName: b.customer_name ?? '',
        vehicleId: b.vehicle_id as string,
        pickupAt: b.pickup_at,
        returnAt: b.return_at!,
        status: b.booking_status ?? 'draft',
      })),
  }
}
