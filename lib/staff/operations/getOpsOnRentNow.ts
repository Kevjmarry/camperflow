import { createClient } from '@/lib/supabase/server'
import { getDemoToday } from '@/lib/helpers/demoDate'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

export interface OpsOnRentRow {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  vehicleId: string | null
  returnAt: string
  /** ms between returnAt and next booking's pickupAt; null = no next booking */
  prepWindowMs: number | null
  /** ISO string of the next booking's pickupAt; null = none */
  nextBookingPickupAt: string | null
  nextBookingId: string | null
  isOverdue: boolean
  /** 'short' < 24h; 'medium' 24–48h; 'comfortable' > 48h; null = no next booking */
  prepSeverity: 'short' | 'medium' | 'comfortable' | null
}

export async function getOpsOnRentNow(): Promise<OpsOnRentRow[]> {
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

  const now = getDemoToday(companyId)

  const { data: onRent, error: onRentError } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, vehicle_name, vehicle_id, return_at, is_overdue')
    .eq('company_id', companyId)
    .eq('operational_status', 'on_rent')
    .order('return_at', { ascending: true })

  if (onRentError) throw onRentError
  if (!onRent || onRent.length === 0) return []

  const vehicleIds = onRent.map((b) => b.vehicle_id).filter(isUUID)

  const minReturnAt = onRent.reduce<string>(
    (min, b) => (b.return_at < min ? b.return_at : min),
    onRent[0].return_at,
  )

  const { data: upcoming } = vehicleIds.length
    ? await supabase
        .from('ops_bookings')
        .select('id, vehicle_id, pickup_at')
        .eq('company_id', companyId)
        .in('operational_status', ['confirmed', 'blocked'])
        .in('vehicle_id', vehicleIds)
        .gte('pickup_at', minReturnAt)
        .order('pickup_at', { ascending: true })
    : { data: [] }

  const upcomingByVehicle = new Map<string, Array<{ id: string; pickupAt: string }>>()
  for (const u of upcoming ?? []) {
    if (!isUUID(u.vehicle_id)) continue
    if (!upcomingByVehicle.has(u.vehicle_id)) upcomingByVehicle.set(u.vehicle_id, [])
    upcomingByVehicle.get(u.vehicle_id)!.push({ id: u.id, pickupAt: u.pickup_at })
  }

  const MS_PER_DAY = 1000 * 60 * 60 * 24

  return onRent.map((b) => {
    const returnMs = new Date(b.return_at).getTime()

    let prepWindowMs: number | null = null
    let nextBookingPickupAt: string | null = null
    let nextBookingId: string | null = null

    if (isUUID(b.vehicle_id)) {
      const candidates = upcomingByVehicle.get(b.vehicle_id) ?? []
      const next = candidates.find((u) => u.pickupAt >= b.return_at)
      if (next) {
        nextBookingPickupAt = next.pickupAt
        nextBookingId = next.id
        prepWindowMs = Math.max(0, new Date(next.pickupAt).getTime() - returnMs)
      }
    }

    let prepSeverity: 'short' | 'medium' | 'comfortable' | null = null
    if (prepWindowMs !== null) {
      if (prepWindowMs < MS_PER_DAY) prepSeverity = 'short'
      else if (prepWindowMs < 2 * MS_PER_DAY) prepSeverity = 'medium'
      else prepSeverity = 'comfortable'
    }

    return {
      id: b.id,
      bookingNumber: b.booking_number ?? '',
      customerName: b.customer_name ?? '',
      vehicleName: b.vehicle_name ?? '',
      vehicleId: b.vehicle_id ?? null,
      returnAt: b.return_at,
      prepWindowMs,
      nextBookingPickupAt,
      nextBookingId,
      isOverdue: new Date(b.return_at) < now,
      prepSeverity,
    }
  })
}
