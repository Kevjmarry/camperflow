import { createClient } from '@/lib/supabase/server'

export interface OpsVehiclePreparing {
  id: string
  name: string
  plate: string
  bookingNumber: string
  pickupAt: string
}

export async function getOpsVehiclesPreparing(): Promise<OpsVehiclePreparing[]> {
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

  const now = new Date()
  const nowStr = now.toISOString()

  // Only surface vehicles that have a real confirmed booking within the next
  // 30 days. This prevents vehicles that were stuck in 'preparing' by old
  // iCal imports (never moved to on_rent / completed) from cluttering the list.
  const thirtyDaysFromNow = new Date(now)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const thirtyDaysStr = thirtyDaysFromNow.toISOString()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, name, registration_plate, bookings(booking_number, pickup_at, status)')
    .eq('status', 'preparing')
    .eq('company_id', companyId)

  if (error) throw error

  return (data ?? [])
    .map((v) => {
      const bookings = (v.bookings as unknown as { booking_number: string; pickup_at: string; status: string }[] | null) ?? []

      // Only consider confirmed bookings within the 30-day window.
      const next = bookings
        .filter(
          (b) =>
            b.status === 'confirmed' &&
            b.pickup_at >= nowStr &&
            b.pickup_at <= thirtyDaysStr,
        )
        .sort((a, b) => a.pickup_at.localeCompare(b.pickup_at))[0]

      // No relevant upcoming booking → this vehicle is stuck; exclude it.
      if (!next) return null

      return {
        id: v.id,
        name: v.name ?? '',
        plate: v.registration_plate ?? '',
        bookingNumber: next.booking_number,
        pickupAt: next.pickup_at,
      }
    })
    .filter((v): v is OpsVehiclePreparing => v !== null)
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt))
}
