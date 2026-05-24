import { createClient } from '@/lib/supabase/server'
import { getDemoToday } from '@/lib/helpers/demoDate'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

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
  openVehicleIssueIsChecklistFlag: boolean
  vehicleStatus: 'ready' | 'preparing' | 'on_rent' | null
  vehicleId: string | null
  openVehicleIssueChecklistInstanceId: string | null
  expiredComplianceName: string | null
  openVehicleIssueTitle: string | null
}

export async function getOpsPickupsToday(): Promise<OpsPickup[]> {
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
        // 'handover' is the checklist type for vehicle transfer to the guest — the staff-side action that happens during the guest's pickup.
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
        .eq('issue_flag', true)
        .eq('issue_blocking', true)
    : { data: [], error: null }

  if (biError) throw biError

  const blockingInstanceIds = new Set((blockingItems ?? []).map((i) => i.instance_id))

  const vehicleIds = (data ?? []).map((b) => b.vehicle_id).filter(isUUID)
  const todayStr = getDemoToday(companyId).toISOString().slice(0, 10)

  const { data: expiredCompliance, error: ecError } = vehicleIds.length
    ? await supabase
        .from('vehicle_compliance')
        .select('vehicle_id, expiry_date, compliance_types!inner(blocks_readiness, name)')
        .in('vehicle_id', vehicleIds)
        .not('expiry_date', 'is', null)
        .lt('expiry_date', todayStr)
        .eq('compliance_types.blocks_readiness', true)
    : { data: [], error: null }

  if (ecError) throw ecError

  const vehiclesWithExpiredCompliance = new Set((expiredCompliance ?? []).map((c) => c.vehicle_id))

  const vehicleFirstExpiredComplianceName = new Map<string, string>()
  for (const c of (expiredCompliance ?? [])) {
    if (!c.vehicle_id || vehicleFirstExpiredComplianceName.has(c.vehicle_id)) continue
    const ct = Array.isArray(c.compliance_types) ? c.compliance_types[0] : c.compliance_types as { name?: string } | null
    if (ct?.name) vehicleFirstExpiredComplianceName.set(c.vehicle_id, ct.name)
  }

  const { data: openIssues, error: oiError } = vehicleIds.length
    ? await supabase
        .from('vehicle_issues')
        .select('id, vehicle_id, source_checklist_instance_id, source_checklist_item_id')
        .in('vehicle_id', vehicleIds)
        .eq('resolved', false)
    : { data: [], error: null }

  if (oiError) throw oiError

  const vehiclesWithOpenIssues = new Set((openIssues ?? []).map((i) => i.vehicle_id))

  const issueItemIds = (openIssues ?? []).map((i) => (i as { source_checklist_item_id?: string | null }).source_checklist_item_id).filter(isUUID)
  const { data: issueItemTitles } = issueItemIds.length
    ? await supabase.from('checklist_instance_items').select('id, issue_title').in('id', issueItemIds)
    : { data: [] }
  const itemTitleMap = new Map<string, string>((issueItemTitles ?? []).filter((i) => i.issue_title).map((i) => [i.id, i.issue_title as string]))

  const vehicleFirstIssueTitleMap = new Map<string, string>()
  const vehiclesWithChecklistFlaggedIssue = new Set<string>()
  for (const issue of (openIssues ?? [])) {
    if (!isUUID(issue.vehicle_id)) continue
    const itemId = (issue as { source_checklist_item_id?: string | null }).source_checklist_item_id
    if (isUUID(itemId)) {
      vehiclesWithChecklistFlaggedIssue.add(issue.vehicle_id)
      if (!vehicleFirstIssueTitleMap.has(issue.vehicle_id)) {
        const title = itemTitleMap.get(itemId)
        if (title) vehicleFirstIssueTitleMap.set(issue.vehicle_id, title)
      }
    }
  }

  // Prefer the durable source column; fall back to reverse lookup for legacy rows.
  const issueChecklistMap = new Map<string, string>()
  for (const issue of (openIssues ?? [])) {
    if (issue.source_checklist_instance_id && isUUID(issue.source_checklist_instance_id)) {
      issueChecklistMap.set(issue.id, issue.source_checklist_instance_id)
    }
  }
  const legacyIssueIds = (openIssues ?? [])
    .filter((i) => isUUID(i.id) && !i.source_checklist_instance_id)
    .map((i) => i.id)
  const { data: linkedItems } = legacyIssueIds.length
    ? await supabase
        .from('checklist_instance_items')
        .select('linked_vehicle_issue_id, instance_id')
        .in('linked_vehicle_issue_id', legacyIssueIds)
    : { data: [] }
  for (const item of (linkedItems ?? [])) {
    if (item.linked_vehicle_issue_id && item.instance_id && isUUID(item.instance_id)) {
      if (!issueChecklistMap.has(item.linked_vehicle_issue_id)) {
        issueChecklistMap.set(item.linked_vehicle_issue_id, item.instance_id)
      }
    }
  }
  const vehicleIssueChecklistMap = new Map<string, string>()
  for (const issue of (openIssues ?? [])) {
    if (!isUUID(issue.id) || !isUUID(issue.vehicle_id)) continue
    const checklistId = issueChecklistMap.get(issue.id)
    if (checklistId && !vehicleIssueChecklistMap.has(issue.vehicle_id)) {
      vehicleIssueChecklistMap.set(issue.vehicle_id, checklistId)
    }
  }

  const ALLOWED_STATUSES = new Set(['ready', 'preparing', 'on_rent'])
  const { data: vehicleStatuses } = vehicleIds.length
    ? await supabase.from('vehicles').select('id, status').in('id', vehicleIds)
    : { data: [] }
  const vehicleStatusMap = new Map(
    (vehicleStatuses ?? []).map((v) => [v.id, ALLOWED_STATUSES.has(v.status) ? v.status as 'ready' | 'preparing' | 'on_rent' : null])
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
      hasBlockingIssue: handover ? blockingInstanceIds.has(handover.id) : false,
      hasExpiredCompliance: b.vehicle_id ? vehiclesWithExpiredCompliance.has(b.vehicle_id) : false,
      hasOpenVehicleIssue: b.vehicle_id ? vehiclesWithOpenIssues.has(b.vehicle_id) : false,
      openVehicleIssueIsChecklistFlag: b.vehicle_id ? vehiclesWithChecklistFlaggedIssue.has(b.vehicle_id) : false,
      vehicleStatus: b.vehicle_id ? (vehicleStatusMap.get(b.vehicle_id) ?? null) : null,
      vehicleId: b.vehicle_id ?? null,
      openVehicleIssueChecklistInstanceId: b.vehicle_id ? (vehicleIssueChecklistMap.get(b.vehicle_id) ?? null) : null,
      expiredComplianceName: b.vehicle_id ? (vehicleFirstExpiredComplianceName.get(b.vehicle_id) ?? null) : null,
      openVehicleIssueTitle: b.vehicle_id ? (vehicleFirstIssueTitleMap.get(b.vehicle_id) ?? null) : null,
    }
  })
}
