import { createClient } from '@/lib/supabase/server'

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
  hasExpiredCompliance: boolean
  hasOpenVehicleIssue: boolean
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
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user?.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!companyId) return []

  const { data, error } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, pickup_at, return_at, vehicle_name, vehicle_id, next_action, hours_to_pickup, ops_flag, ops_priority, vehicle_blocked')
    .eq('company_id', companyId)
    .is('ops_flag', null)
    .gt('pickup_at', new Date().toISOString())
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

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

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
      hasExpiredCompliance: b.vehicle_id ? vehiclesWithExpiredCompliance.has(b.vehicle_id) : false,
      hasOpenVehicleIssue: b.vehicle_id ? vehiclesWithOpenIssues.has(b.vehicle_id) : false,
      ...extras,
    }
  })
}
