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
  hasBlockingIssue: boolean
  hasExpiredCompliance: boolean
  hasOpenVehicleIssue: boolean
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
    .select('id, booking_number, customer_name, pickup_at, booking_status, vehicle_name, vehicle_id, next_action, hours_to_pickup, ops_flag, ops_priority, vehicle_blocked, handover_items_done, handover_items_total')
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

  const instanceIds = (instances ?? []).map((ci) => ci.id)

  const { data: blockingItems, error: biError } = instanceIds.length
    ? await supabase
        .from('checklist_instance_items')
        .select('instance_id')
        .in('instance_id', instanceIds)
        .eq('issue_blocking', true)
    : { data: [], error: null }

  if (biError) throw biError

  const blockingInstanceIds = new Set((blockingItems ?? []).map((i) => i.instance_id))

  const vehicleIds = (data ?? []).map((b) => b.vehicle_id).filter(Boolean) as string[]
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
      hasBlockingIssue: handover ? blockingInstanceIds.has(handover.id) : false,
      hasExpiredCompliance: b.vehicle_id ? vehiclesWithExpiredCompliance.has(b.vehicle_id) : false,
      hasOpenVehicleIssue: b.vehicle_id ? vehiclesWithOpenIssues.has(b.vehicle_id) : false,
    }
  })
}
