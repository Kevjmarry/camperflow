import { createClient } from '@/lib/supabase/server'

export interface OpsUpcomingReturn {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string | null
  returnAt: string
  nights: number | null
  daysUntil: number
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

export async function getOpsUpcomingReturns(): Promise<OpsUpcomingReturn[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user?.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!companyId) return []

  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, pickup_at, return_at, vehicle_name')
    .eq('company_id', companyId)
    .gt('return_at', endOfToday.toISOString())
    .order('return_at', { ascending: true })
    .limit(20)

  if (error) throw error

  const bookingIds = (data ?? []).map((b) => b.id)

  const { data: bookingsData } = bookingIds.length
    ? await supabase.from('bookings').select('id, source_metadata, staff_metadata').in('id', bookingIds)
    : { data: [] }

  const metaByBooking = new Map(
    (bookingsData ?? []).map((b) => [b.id, {
      source: b.source_metadata as Record<string, unknown> | null,
      staff: b.staff_metadata as Record<string, unknown> | null,
    }])
  )

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return (data ?? []).map((b) => {
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
      ...extras,
    }
  })
}
