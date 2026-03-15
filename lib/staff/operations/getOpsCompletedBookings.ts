import { createClient } from '@/lib/supabase/server'

export interface OpsCompletedBooking {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  returnAt: string | null
  pickupAt: string
}

export async function getOpsCompletedBookings(): Promise<OpsCompletedBooking[]> {
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
    .select('id, booking_number, customer_name, vehicle_name, return_at, pickup_at')
    .eq('company_id', companyId)
    .eq('booking_status', 'completed')
    .order('return_at', { ascending: false })
    .limit(20)

  if (error) throw error

  return (data ?? []).map((b) => ({
    id: b.id,
    bookingNumber: b.booking_number ?? '',
    customerName: b.customer_name ?? '',
    vehicleName: b.vehicle_name ?? '',
    returnAt: b.return_at ?? null,
    pickupAt: b.pickup_at,
  }))
}
