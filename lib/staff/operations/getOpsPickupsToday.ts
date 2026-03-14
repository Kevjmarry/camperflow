import { createClient } from '@/lib/supabase/server'

export interface OpsPickup {
  id: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string
  status: 'confirmed' | 'blocked'
  handoverStatus?: 'pending' | 'in_progress' | 'completed'
  checklistInstanceId?: string
}

export async function getOpsPickupsToday(): Promise<OpsPickup[]> {
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
    .select('id, booking_number, customer_name, pickup_at, status, vehicles(name), checklist_instances(id, status, checklist_type)')
    .eq('company_id', companyId)
    .in('status', ['confirmed', 'blocked'])
    .gte('pickup_at', todayStart.toISOString())
    .lte('pickup_at', todayEnd.toISOString())
    .order('pickup_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((b) => {
    const instances = b.checklist_instances as unknown as { id: string; status: string; checklist_type: string }[] | null
    const handover = Array.isArray(instances)
      ? instances.find((c) => c.checklist_type === 'handover')
      : undefined

    const handoverStatus = handover
      ? (handover.status as 'pending' | 'in_progress' | 'completed')
      : 'pending'

    return {
      id: b.id,
      bookingNumber: b.booking_number ?? '',
      customerName: b.customer_name ?? '',
      vehicleName: (b.vehicles as unknown as { name: string } | null)?.name ?? '',
      pickupAt: b.pickup_at,
      status: b.status as 'confirmed' | 'blocked',
      handoverStatus,
      checklistInstanceId: handover?.id,
    }
  })
}
