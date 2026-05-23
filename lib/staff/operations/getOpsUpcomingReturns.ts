import { createClient } from '@/lib/supabase/server'
import { getDemoToday } from '@/lib/helpers/demoDate'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

export interface OpsUpcomingReturn {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string | null
  returnAt: string
  nights: number | null
  daysUntil: number
  vehicleBlocked: boolean
  hasExpiredCompliance: boolean
  hasOpenVehicleIssue: boolean
  vehicleStatus: 'ready' | 'preparing' | 'on_rent' | null
  vehicleId: string | null
  openVehicleIssueChecklistInstanceId: string | null
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

export interface OpsUpcomingReturnsResult {
  rows: OpsUpcomingReturn[]
  companyTimezone: string
}

export async function getOpsUpcomingReturns(): Promise<OpsUpcomingReturnsResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id || !isUUID(user.id)) return { rows: [], companyTimezone: 'UTC' }
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!isUUID(companyId)) return { rows: [], companyTimezone: 'UTC' }

  const today = getDemoToday(companyId)

  const { data: companySettings } = await supabase
    .from('company_settings')
    .select('company_timezone')
    .eq('id', companyId)
    .maybeSingle()
  const companyTimezone: string = (companySettings as any)?.company_timezone ?? 'UTC'

  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, pickup_at, return_at, vehicle_name, vehicle_id, vehicle_blocked, booking_status')
    .eq('company_id', companyId)
    .neq('booking_status', 'completed')
    .neq('booking_status', 'cancelled')
    .gte('return_at', startOfToday.toISOString())
    .order('return_at', { ascending: true })
    .limit(20)

  if (error) throw error

  const bookingIds = (data ?? []).map((b) => b.id)

  const { data: completedReturnChecklists } = bookingIds.length
    ? await supabase
        .from('checklist_instances')
        .select('booking_id')
        .in('booking_id', bookingIds)
        .eq('checklist_type', 'return')
        .eq('status', 'completed')
    : { data: [] }

  const bookingsWithCompletedReturn = new Set((completedReturnChecklists ?? []).map((c) => c.booking_id))

  const { data: bookingsData } = bookingIds.length
    ? await supabase.from('bookings').select('id, source_metadata, staff_metadata').in('id', bookingIds)
    : { data: [] }

  const metaByBooking = new Map(
    (bookingsData ?? []).map((b) => [b.id, {
      source: b.source_metadata as Record<string, unknown> | null,
      staff: b.staff_metadata as Record<string, unknown> | null,
    }])
  )

  const vehicleIds = (data ?? []).map((b) => b.vehicle_id).filter(isUUID)
  const todayStr = today.toISOString().slice(0, 10)

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
        .select('id, vehicle_id, source_checklist_instance_id')
        .in('vehicle_id', vehicleIds)
        .eq('resolved', false)
    : { data: [], error: null }

  if (oiError) throw oiError

  const vehiclesWithOpenIssues = new Set((openIssues ?? []).map((i) => i.vehicle_id))

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

  const rows = (data ?? []).filter((b) => !bookingsWithCompletedReturn.has(b.id)).map((b) => {
    const returnDate = new Date(b.return_at)
    returnDate.setHours(0, 0, 0, 0)
    const daysUntil = Math.round(
      (returnDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    )

    let nights: number | null = null
    if (b.pickup_at) {
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
      pickupAt: b.pickup_at ?? null,
      returnAt: b.return_at,
      nights,
      daysUntil,
      vehicleBlocked: b.vehicle_blocked === true,
      hasExpiredCompliance: b.vehicle_id ? vehiclesWithExpiredCompliance.has(b.vehicle_id) : false,
      hasOpenVehicleIssue: b.vehicle_id ? vehiclesWithOpenIssues.has(b.vehicle_id) : false,
      vehicleStatus: b.vehicle_id ? (vehicleStatusMap.get(b.vehicle_id) ?? null) : null,
      vehicleId: b.vehicle_id ?? null,
      openVehicleIssueChecklistInstanceId: b.vehicle_id ? (vehicleIssueChecklistMap.get(b.vehicle_id) ?? null) : null,
      ...extras,
    }
  })
  return { rows, companyTimezone }
}
