import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

export interface OpsInvoiceReminder {
  id: string
  bookingId: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  dueAt: string
  daysUntilDue: number
}

export async function getOpsInvoiceReminders(): Promise<OpsInvoiceReminder[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id || !isUUID(user.id)) return []
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!isUUID(companyId)) return []

  const { data, error } = await supabase
    .from('staff_tasks')
    .select(`
      id,
      due_at,
      booking_id,
      bookings (
        booking_number,
        customer_name,
        pickup_at,
        vehicle_id,
        vehicles ( name )
      )
    `)
    .eq('company_id', companyId)
    .eq('task_type', 'final_invoice')
    .is('completed_at', null)
    .order('due_at', { ascending: true })

  if (error) throw error

  const now = Date.now()

  return (data ?? []).map((t) => {
    const booking = Array.isArray(t.bookings) ? t.bookings[0] : t.bookings
    const vehicle = booking?.vehicles
      ? Array.isArray(booking.vehicles) ? booking.vehicles[0] : booking.vehicles
      : null
    const dueMs = new Date(t.due_at).getTime()
    const daysUntilDue = Math.round((dueMs - now) / 86400000)

    return {
      id: t.id,
      bookingId: t.booking_id,
      bookingNumber: booking?.booking_number ?? '',
      customerName: booking?.customer_name ?? '',
      vehicleName: vehicle?.name ?? '',
      dueAt: t.due_at,
      daysUntilDue,
    }
  })
}
