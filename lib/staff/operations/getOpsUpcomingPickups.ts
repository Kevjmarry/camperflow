import { createClient } from '@/lib/supabase/server'
import { getDemoToday } from '@/lib/helpers/demoDate'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

export interface OpsUpcomingPickup {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string
  returnAt: string | null
  nights: number | null
  opsFlag: string | null
  opsPriority: number | null
  daysUntil: number
  nextAction?: string | null
  hoursToPickup?: number | null
  vehicleBlocked?: boolean
  hasBlockingIssue: boolean
  hasAttentionIssue: boolean
  hasUrgentIssue: boolean
  hasExpiredCompliance: boolean
  hasOpenVehicleIssue: boolean
  openVehicleIssueIsChecklistFlag: boolean
  vehicleStatus: 'ready' | 'preparing' | 'on_rent' | null
  vehicleId: string | null
  openVehicleIssueChecklistInstanceId: string | null
  handoverDone: boolean
  prepDone: boolean
  expiredComplianceName: string | null
  openVehicleIssueTitle: string | null
  // Resolved operational extras (staff_metadata takes priority over source_metadata)
  guestCount: number | null
  hasPets: boolean
  hasAirportPickup: boolean
  hasExtraDriver: boolean
}

function parseExtras(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return { guestCount: null, hasPets: false, hasAirportPickup: false, hasExtraDriver: false }

  const isTruthy = (v: unknown) =>
    v === true || v === 'true' || v === '1' || v === 'yes' || v === 'Yes'

  const asNum = (v: unknown): number | null => {
    if (typeof v === 'number' && !isNaN(v)) return v
    if (typeof v === 'string') { const n = parseInt(v, 10); return isNaN(n) ? null : n }
    return null
  }

  let guestCount: number | null = null
  for (const k of ['adults', 'guests', 'pax', 'passengers', 'num_guests', 'guest_count', 'persons', 'people']) {
    const n = asNum(meta[k])
    if (n != null) { guestCount = n; break }
  }

  const hasPets = ['pets', 'pet', 'with_pets', 'bring_pets', 'has_pets'].some(k => isTruthy(meta[k]))
  const hasAirportPickup = ['airport', 'airport_pickup', 'airport_transfer', 'airport_collection', 'airport_drop'].some(k => isTruthy(meta[k]))
  const hasExtraDriver = ['extra_driver', 'additional_driver', 'second_driver', 'extra_bestuurder'].some(k => isTruthy(meta[k]))

  return { guestCount, hasPets, hasAirportPickup, hasExtraDriver }
}

/**
 * Resolves operational extras using staff_metadata as the authoritative source
 * when a key is present, falling back to parsed source_metadata otherwise.
 */
function resolveExtras(
  sourceMeta: Record<string, unknown> | null | undefined,
  staffMeta: Record<string, unknown> | null | undefined,
) {
  const fromSource = parseExtras(sourceMeta)

  return {
    guestCount: (staffMeta && 'guest_count' in staffMeta && typeof staffMeta.guest_count === 'number')
      ? staffMeta.guest_count as number
      : fromSource.guestCount,
    hasPets: (staffMeta && 'pets' in staffMeta)
      ? Boolean(staffMeta.pets)
      : fromSource.hasPets,
    hasAirportPickup: (staffMeta && 'airport_transfer' in staffMeta)
      ? Boolean(staffMeta.airport_transfer)
      : fromSource.hasAirportPickup,
    hasExtraDriver: (staffMeta && 'extra_driver' in staffMeta)
      ? Boolean(staffMeta.extra_driver)
      : fromSource.hasExtraDriver,
  }
}

export async function getOpsUpcomingPickups(): Promise<OpsUpcomingPickup[]> {
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

  const today = getDemoToday(companyId)

  const { data: companySettings } = await supabase
    .from('company_settings')
    .select('company_timezone')
    .eq('id', companyId)
    .maybeSingle()
  const companyTimezone: string = (companySettings as any)?.company_timezone ?? 'UTC'
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: companyTimezone, year: 'numeric', month: '2-digit', day: '2-digit' })

  const { data, error } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, pickup_at, return_at, vehicle_name, vehicle_id, next_action, hours_to_pickup, ops_flag, ops_priority, vehicle_blocked, operational_status')
    .eq('company_id', companyId)
    .is('ops_flag', null)
    .not('operational_status', 'in', '(cancelled,on_rent,completed)')
    .order('ops_priority', { ascending: true, nullsFirst: false })
    .order('pickup_at', { ascending: true })

  if (error) throw error

  const bookingIds = (data ?? []).map((b) => b.id)

  const { data: bookingsData, error: bookingsError } = bookingIds.length
    ? await supabase.from('bookings').select('id, source_metadata, staff_metadata').in('id', bookingIds)
    : { data: [], error: null }

  if (bookingsError) throw bookingsError

  const metaByBooking = new Map(
    (bookingsData ?? []).map((b) => [b.id, {
      source: b.source_metadata as Record<string, unknown> | null,
      staff: b.staff_metadata as Record<string, unknown> | null,
    }])
  )

  const { data: instances, error: ciError } = bookingIds.length
    ? await supabase
        .from('checklist_instances')
        .select('id, booking_id, status, checklist_type')
        .in('booking_id', bookingIds)
    : { data: [], error: null }

  if (ciError) throw ciError

  const instanceIds = (instances ?? []).map((ci) => ci.id)

  const { data: flaggedItems, error: biError } = instanceIds.length
    ? await supabase
        .from('checklist_instance_items')
        .select('instance_id, issue_blocking')
        .in('instance_id', instanceIds)
        .eq('issue_flag', true)
    : { data: [], error: null }

  if (biError) throw biError

  const blockingInstanceIds = new Set(
    (flaggedItems ?? []).filter((i) => i.issue_blocking === true).map((i) => i.instance_id)
  )
  const attentionInstanceIds = new Set(
    (flaggedItems ?? []).filter((i) => i.issue_blocking !== true).map((i) => i.instance_id)
  )
  const bookingsWithBlockingIssue = new Set(
    (instances ?? [])
      .filter((ci) => blockingInstanceIds.has(ci.id))
      .map((ci) => ci.booking_id)
  )
  const bookingsWithAttentionIssue = new Set(
    (instances ?? [])
      .filter((ci) => attentionInstanceIds.has(ci.id))
      .map((ci) => ci.booking_id)
  )
  const bookingsWithUrgentIssue = bookingsWithBlockingIssue

  // 'handover' = vehicle transfer to guest (staff action at guest pickup); 'pickup' = vehicle preparation before guest arrival.
  const handoverDoneSet = new Set(
    (instances ?? [])
      .filter((ci) => ci.checklist_type === 'handover' && ci.status === 'completed')
      .map((ci) => ci.booking_id)
  )
  const prepDoneSet = new Set(
    (instances ?? [])
      .filter((ci) => ci.checklist_type === 'pickup' && ci.status === 'completed')
      .map((ci) => ci.booking_id)
  )

  const vehicleIds = (data ?? []).map((b) => b.vehicle_id).filter(isUUID)
  const todayStr = dateFmt.format(today)

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

  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)

  const now = new Date(today)

  return (data ?? []).map((b) => {
    const pickupDate = new Date(b.pickup_at)
    pickupDate.setHours(0, 0, 0, 0)
    const daysUntil = Math.round(
      (pickupDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    )

    let nights: number | null = null
    if (b.return_at) {
      const ms = new Date(b.return_at).getTime() - new Date(b.pickup_at).getTime()
      nights = Math.round(ms / (1000 * 60 * 60 * 24))
    }

    const { source, staff } = metaByBooking.get(b.id) ?? { source: null, staff: null }
    const extras = resolveExtras(source, staff)

    return {
      id: b.id,
      bookingNumber: b.booking_number ?? '',
      customerName: b.customer_name ?? '',
      vehicleName: b.vehicle_name ?? '',
      pickupAt: b.pickup_at,
      returnAt: b.return_at ?? null,
      nights,
      opsFlag: b.ops_flag ?? null,
      opsPriority: b.ops_priority ?? null,
      daysUntil,
      nextAction: b.next_action ?? null,
      hoursToPickup: b.hours_to_pickup ?? null,
      vehicleBlocked: b.vehicle_blocked === true,
      hasBlockingIssue: bookingsWithBlockingIssue.has(b.id),
      hasAttentionIssue: bookingsWithAttentionIssue.has(b.id),
      hasUrgentIssue: bookingsWithUrgentIssue.has(b.id),
      hasExpiredCompliance: b.vehicle_id ? vehiclesWithExpiredCompliance.has(b.vehicle_id) : false,
      hasOpenVehicleIssue: b.vehicle_id ? vehiclesWithOpenIssues.has(b.vehicle_id) : false,
      openVehicleIssueIsChecklistFlag: b.vehicle_id ? vehiclesWithChecklistFlaggedIssue.has(b.vehicle_id) : false,
      vehicleStatus: b.vehicle_id ? (vehicleStatusMap.get(b.vehicle_id) ?? null) : null,
      vehicleId: b.vehicle_id ?? null,
      openVehicleIssueChecklistInstanceId: b.vehicle_id ? (vehicleIssueChecklistMap.get(b.vehicle_id) ?? null) : null,
      handoverDone: handoverDoneSet.has(b.id),
      prepDone: prepDoneSet.has(b.id),
      expiredComplianceName: b.vehicle_id ? (vehicleFirstExpiredComplianceName.get(b.vehicle_id) ?? null) : null,
      openVehicleIssueTitle: b.vehicle_id ? (vehicleFirstIssueTitleMap.get(b.vehicle_id) ?? null) : null,
      ...extras,
    }
  })
  .sort((a, b) => {
    if (a.daysUntil < 0 && b.daysUntil >= 0) return -1
    if (a.daysUntil >= 0 && b.daysUntil < 0) return 1
    return new Date(a.pickupAt).getTime() - new Date(b.pickupAt).getTime()
  })
}
