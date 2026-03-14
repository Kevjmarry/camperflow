import { createClient } from '@/lib/supabase/server'

export interface OpsReturn {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  returnAt: string
  opsFlag: 'return_today' | 'overdue_return' | null
  opsPriority: number | null
  status: 'on_rent'
  nextAction?: string | null
  hoursToPickup?: number | null
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

  const { data, error } = await supabase
    .from('ops_bookings')
    .select('id, booking_number, customer_name, return_at, booking_status, vehicle_name, next_action, hours_to_pickup, ops_flag, ops_priority')
    .eq('company_id', companyId)
    .in('ops_flag', ['return_today', 'overdue_return'])
    .order('ops_priority', { ascending: true, nullsFirst: false })
    .order('return_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((b) => ({
    id: b.id,
    bookingNumber: b.booking_number ?? '',
    customerName: b.customer_name ?? '',
    vehicleName: b.vehicle_name ?? '',
    returnAt: b.return_at,
    opsFlag: b.ops_flag as 'return_today' | 'overdue_return' | null,
    opsPriority: b.ops_priority ?? null,
    status: 'on_rent' as const,
    nextAction: b.next_action ?? null,
    hoursToPickup: b.hours_to_pickup ?? null,
  }))
}
