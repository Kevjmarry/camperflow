import { createClient } from '@/lib/supabase/server'

export interface OpsPickup {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string
  opsFlag: string | null
  opsPriority: number | null
  status: 'confirmed' | 'blocked'
  handoverStatus?: 'pending' | 'in_progress' | 'completed'
  checklistInstanceId?: string
  nextAction?: string | null
  hoursToPickup?: number | null
  vehicleBlocked?: boolean
  handoverItemsDone: number | null
  handoverItemsTotal: number | null
}

export async function getOpsPickupsToday(): Promise<OpsPickup[]> {
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
    .select('id, booking_number, customer_name, pickup_at, booking_status, vehicle_name, next_action, hours_to_pickup, ops_flag, ops_priority, vehicle_blocked, handover_items_done, handover_items_total')
    .eq('company_id', companyId)
    .eq('ops_flag', 'pickup_today')
    .order('ops_priority', { ascending: true, nullsFirst: false })
    .order('pickup_at', { ascending: true })

  if (error) throw error

  const bookingIds = (data ?? []).map((b) => b.id)

  const { data: instances, error: ciError } = bookingIds.length
    ? await supabase
        .from('checklist_instances')
        .select('id, booking_id, status, checklist_type')
        .in('booking_id', bookingIds)
        .eq('checklist_type', 'handover')
    : { data: [], error: null }

  if (ciError) throw ciError

  const instancesByBooking = new Map(
    (instances ?? []).map((ci) => [ci.booking_id, ci])
  )

  return (data ?? []).map((b) => {
    const handover = instancesByBooking.get(b.id)
    return {
      id: b.id,
      bookingNumber: b.booking_number ?? '',
      customerName: b.customer_name ?? '',
      vehicleName: b.vehicle_name ?? '',
      pickupAt: b.pickup_at,
      opsFlag: b.ops_flag ?? null,
      opsPriority: b.ops_priority ?? null,
      status: b.booking_status as 'confirmed' | 'blocked',
      handoverStatus: handover
        ? (handover.status as 'pending' | 'in_progress' | 'completed')
        : 'pending',
      checklistInstanceId: handover?.id,
      nextAction: b.next_action ?? null,
      hoursToPickup: b.hours_to_pickup ?? null,
      vehicleBlocked: b.vehicle_blocked === true,
      handoverItemsDone: b.handover_items_done ?? null,
      handoverItemsTotal: b.handover_items_total ?? null,
    }
  })
}
