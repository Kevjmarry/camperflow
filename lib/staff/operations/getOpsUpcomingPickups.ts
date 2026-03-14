import { createClient } from '@/lib/supabase/server'

export interface OpsUpcomingPickup {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string
  daysUntil: number
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

  if (!companyId) {
    return []
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
  sevenDaysFromNow.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_number, customer_name, pickup_at, vehicles(name)')
    .eq('company_id', companyId)
    .gte('pickup_at', tomorrow.toISOString())
    .lte('pickup_at', sevenDaysFromNow.toISOString())
    .order('pickup_at', { ascending: true })

  if (error) throw error

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return (data ?? []).map((b) => {
    const pickupDate = new Date(b.pickup_at)
    pickupDate.setHours(0, 0, 0, 0)
    const daysUntil = Math.round(
      (pickupDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      id: b.id,
      bookingNumber: b.booking_number ?? '',
      customerName: b.customer_name ?? '',
      vehicleName: (b.vehicles as unknown as { name: string } | null)?.name ?? '',
      pickupAt: b.pickup_at,
      daysUntil,
    }
  })
}
