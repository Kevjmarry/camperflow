import { createClient } from '@/lib/supabase/server'

export interface OpsReturn {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  returnAt: string
  status: 'on_rent'
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

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_number, customer_name, return_at, status, vehicles(name)')
    .eq('company_id', companyId)
    .eq('status', 'on_rent')
    .gte('return_at', todayStart.toISOString())
    .lte('return_at', todayEnd.toISOString())
    .order('return_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((b) => ({
    id: b.id,
    bookingNumber: b.booking_number ?? '',
    customerName: b.customer_name ?? '',
    vehicleName: (b.vehicles as unknown as { name: string } | null)?.name ?? '',
    returnAt: b.return_at,
    status: 'on_rent' as const,
  }))
}
