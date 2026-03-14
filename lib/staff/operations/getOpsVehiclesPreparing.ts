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

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, name, registration_plate, bookings(booking_number, pickup_at)')
    .eq('status', 'preparing')
    .eq('company_id', companyId)

  if (error) throw error

  return (data ?? [])
    .map((v) => {
      const bookings = (v.bookings as unknown as { booking_number: string; pickup_at: string }[] | null) ?? []
      const next = bookings
        .filter((b) => b.pickup_at >= now)
        .sort((a, b) => a.pickup_at.localeCompare(b.pickup_at))[0]

      return {
        id: v.id,
        name: v.name ?? '',
        plate: v.registration_plate ?? '',
        bookingNumber: next?.booking_number ?? '',
        pickupAt: next?.pickup_at ?? '',
      }
    })
    .sort((a, b) => {
      if (a.pickupAt && b.pickupAt) return a.pickupAt.localeCompare(b.pickupAt)
      if (a.pickupAt) return -1
      if (b.pickupAt) return 1
      return 0
    })
}
