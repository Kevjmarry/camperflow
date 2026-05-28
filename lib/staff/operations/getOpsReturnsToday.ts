import { createClient } from '@/lib/supabase/server'
import { getDemoToday } from '@/lib/helpers/demoDate'

export interface OpsReturn {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  returnAt: string
  opsFlag: 'return_today' | 'overdue_return' | null
  opsPriority: number | null
  status: 'on_rent'
  nextAction?: string | null
  hoursToPickup?: number | null
  returnItemsDone: number | null
  returnItemsTotal: number | null
  vehicleBlocked?: boolean
  hasBlockingIssue: boolean
  hasExpiredCompliance: boolean
  hasOpenVehicleIssue: boolean
}

export async function getOpsReturnsToday(): Promise<OpsReturn[]> {
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
    .select('id, booking_number, customer_name, return_at, booking_status, vehicle_name, vehicle_id, next_action, hours_to_pickup, ops_flag, ops_priority, return_items_done, return_items_total, vehicle_blocked')
    .eq('company_id', companyId)
    // Only genuinely active rentals can have a real overdue or today-return event.
    // Confirmed iCal imports that were never activated must not appear here.
    .eq('booking_status', 'on_rent')
    .in('ops_flag', ['return_today', 'overdue_return'])
    .order('ops_priority', { ascending: true, nullsFirst: false })
    .order('return_at', { ascending: true })

  if (error) throw error

  const bookingIds = (data ?? []).map((b) => b.id)

  const { data: instances, error: ciError } = bookingIds.length
    ? await supabase
        .from('checklist_instances')
        .select('id, booking_id')
        .in('booking_id', bookingIds)
    : { data: [], error: null }

  if (ciError) throw ciError

  const instanceIds = (instances ?? []).map((ci) => ci.id)

  const { data: blockingItems, error: biError } = instanceIds.length
    ? await supabase
        .from('checklist_instance_items')
        .select('instance_id')
        .in('instance_id', instanceIds)
        .eq('issue_flag', true)
        .eq('issue_blocking', true)
    : { data: [], error: null }

  if (biError) throw biError

  const blockingInstanceIds = new Set((blockingItems ?? []).map((i) => i.instance_id))
  const bookingsWithBlockingIssue = new Set(
    (instances ?? [])
      .filter((ci) => blockingInstanceIds.has(ci.id))
      .map((ci) => ci.booking_id)
  )

  const vehicleIds = (data ?? []).map((b) => b.vehicle_id).filter(Boolean) as string[]

  const { data: companySettings } = await supabase
    .from('company_settings')
    .select('company_timezone')
    .eq('id', companyId)
    .maybeSingle()
  const companyTimezone: string = (companySettings as any)?.company_timezone ?? 'UTC'
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: companyTimezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayStr = dateFmt.format(getDemoToday(companyId))

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
    returnAt: b.return_at,
    opsFlag: b.ops_flag as 'return_today' | 'overdue_return' | null,
    opsPriority: b.ops_priority ?? null,
    status: 'on_rent' as const,
    nextAction: b.next_action ?? null,
    hoursToPickup: b.hours_to_pickup ?? null,
    returnItemsDone: b.return_items_done ?? null,
    returnItemsTotal: b.return_items_total ?? null,
    vehicleBlocked: b.vehicle_blocked === true,
    hasBlockingIssue: bookingsWithBlockingIssue.has(b.id),
    hasExpiredCompliance: b.vehicle_id ? vehiclesWithExpiredCompliance.has(b.vehicle_id) : false,
    hasOpenVehicleIssue: b.vehicle_id ? vehiclesWithOpenIssues.has(b.vehicle_id) : false,
  }))
}
