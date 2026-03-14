import { createClient } from '@/lib/supabase/server'

export interface OpsUpcomingPickup {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string
  opsFlag: string | null
  opsPriority: number | null
  daysUntil: number
  nextAction?: string | null
  hoursToPickup?: number | null
  vehicleBlocked?: boolean
}

export async function getOpsUpcomingPickups(): Promise<OpsUpcomingPickup[]> {
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

  const { data, error } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, pickup_at, vehicle_name, next_action, hours_to_pickup, ops_flag, ops_priority, vehicle_blocked')
    .eq('company_id', companyId)
    .is('ops_flag', null)
    .gt('pickup_at', new Date().toISOString())
    .order('ops_priority', { ascending: true, nullsFirst: false })
    .order('pickup_at', { ascending: true })

  if (error) throw error

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return (data ?? []).map((b) => {
    const pickupDate = new Date(b.pickup_at)
    pickupDate.setHours(0, 0, 0, 0)
    const daysUntil = Math.round(
      (pickupDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      id: b.id,
      bookingNumber: b.booking_number ?? '',
      customerName: b.customer_name ?? '',
      vehicleName: b.vehicle_name ?? '',
      pickupAt: b.pickup_at,
      opsFlag: b.ops_flag ?? null,
      opsPriority: b.ops_priority ?? null,
      daysUntil,
      nextAction: b.next_action ?? null,
      hoursToPickup: b.hours_to_pickup ?? null,
      vehicleBlocked: b.vehicle_blocked === true,
    }
  })
}
