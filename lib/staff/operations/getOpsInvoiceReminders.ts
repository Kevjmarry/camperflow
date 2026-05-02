import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

export interface OpsInvoiceReminder {
  type: 'balance_invoice' | 'pre_arrival' | 'return_prep'
  id: string
  bookingId: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string
  daysUntilPickup: number
  // return_prep only:
  returnAt?: string
  daysUntilReturn?: number
  // balance_invoice only:
  dueAt?: string
  daysUntilDue?: number
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

  const { data: settings } = await supabase
    .from('company_settings')
    .select('final_payment_reminders_enabled, final_payment_due_days, final_payment_urgent_days, pre_arrival_reminders_enabled, return_prep_reminders_enabled')
    .eq('id', companyId)
    .maybeSingle()

  const reminderDays: number = settings?.final_payment_due_days ?? 35
  const urgentDays: number   = settings?.final_payment_urgent_days ?? 14

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_number,
      customer_name,
      pickup_at,
      return_at,
      status,
      payment_type,
      balance_invoice_sent,
      prearrival_whatsapp_sent,
      return_whatsapp_sent,
      vehicles ( name )
    `)
    .eq('company_id', companyId)
    .eq('status', 'confirmed')
    .order('pickup_at', { ascending: true })

  if (error) throw error

  const now = Date.now()
  const results: OpsInvoiceReminder[] = []

  for (const b of data ?? []) {
    if (!b.pickup_at) continue
    const vehicle = b.vehicles
      ? Array.isArray(b.vehicles) ? b.vehicles[0] : b.vehicles
      : null
    const pickupMs = new Date(b.pickup_at).getTime()
    const daysUntilPickup = Math.round((pickupMs - now) / 86400000)

    // Balance invoice reminder: split payment, not yet sent, within company window, pickup upcoming
    if (
      settings?.final_payment_reminders_enabled &&
      b.payment_type === 'split' &&
      b.balance_invoice_sent === false &&
      daysUntilPickup > 0 &&
      daysUntilPickup > urgentDays &&
      daysUntilPickup <= reminderDays
    ) {
      const dueMs = pickupMs - reminderDays * 86400000
      results.push({
        type: 'balance_invoice',
        id: b.id,
        bookingId: b.id,
        bookingNumber: b.booking_number ?? '',
        customerName: b.customer_name ?? '',
        vehicleName: vehicle?.name ?? '',
        pickupAt: b.pickup_at,
        daysUntilPickup,
        dueAt: new Date(dueMs).toISOString(),
        daysUntilDue: Math.round((dueMs - now) / 86400000),
      })
    }

    // Pre-arrival WhatsApp: pickup is tomorrow, not yet sent, toggle enabled
    if (
      (settings?.pre_arrival_reminders_enabled ?? true) &&
      daysUntilPickup === 1 &&
      b.prearrival_whatsapp_sent === false
    ) {
      results.push({
        type: 'pre_arrival',
        id: `${b.id}-pre`,
        bookingId: b.id,
        bookingNumber: b.booking_number ?? '',
        customerName: b.customer_name ?? '',
        vehicleName: vehicle?.name ?? '',
        pickupAt: b.pickup_at,
        daysUntilPickup,
      })
    }

    // Return-prep WhatsApp: return is tomorrow, not yet sent, toggle enabled, return upcoming
    if ((settings?.return_prep_reminders_enabled ?? true) && b.return_at) {
      const returnMs = new Date(b.return_at).getTime()
      const daysUntilReturn = Math.round((returnMs - now) / 86400000)
      if (daysUntilReturn === 1 && b.return_whatsapp_sent === false) {
        results.push({
          type: 'return_prep',
          id: `${b.id}-return-prep`,
          bookingId: b.id,
          bookingNumber: b.booking_number ?? '',
          customerName: b.customer_name ?? '',
          vehicleName: vehicle?.name ?? '',
          pickupAt: b.pickup_at,
          daysUntilPickup,
          returnAt: b.return_at,
          daysUntilReturn,
        })
      }
    }
  }

  return results
}
