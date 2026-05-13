import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

const IMPORT_SOURCE_TYPES = ['ical', 'bookingmood_csv', 'bookingmood_json'] as const

const TZ = 'Europe/Bratislava'
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
function isTodayOrTomorrow(isoString: string): boolean {
  const now = new Date()
  const todayStr    = dateFmt.format(now)
  const tomorrowStr = dateFmt.format(new Date(now.getTime() + 86_400_000))
  const eventStr    = dateFmt.format(new Date(isoString))
  return eventStr === todayStr || eventStr === tomorrowStr
}

export interface OpsInvoiceReminder {
  type: 'balance_invoice' | 'pre_arrival' | 'return_prep' | 'review_imported'
  key?: string
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
    .select('final_payment_reminders_enabled, pre_arrival_reminders_enabled, return_prep_reminders_enabled')
    .eq('id', companyId)
    .maybeSingle()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_number,
      customer_name,
      pickup_at,
      return_at,
      status,
      source_type,
      payment_type,
      balance_invoice_sent,
      prearrival_whatsapp_sent,
      return_whatsapp_sent,
      balance_invoice_reminder_enabled,
      prearrival_reminder_enabled,
      return_prep_reminder_enabled,
      vehicles ( name )
    `)
    .eq('company_id', companyId)
    .in('status', ['confirmed', 'on_rent'])
    .gte('return_at', new Date().toISOString())
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

    // Final payment check: split payment, not yet sent, pickup within 10 days
    if (
      b.status === 'confirmed' &&
      settings?.final_payment_reminders_enabled &&
      b.balance_invoice_reminder_enabled === true &&
      b.payment_type === 'split' &&
      b.balance_invoice_sent !== true &&
      daysUntilPickup >= 0 &&
      daysUntilPickup <= 10
    ) {
      results.push({
        type: 'balance_invoice',
        id: b.id,
        bookingId: b.id,
        bookingNumber: b.booking_number ?? '',
        customerName: b.customer_name ?? '',
        vehicleName: vehicle?.name ?? '',
        pickupAt: b.pickup_at,
        daysUntilPickup,
      })
    }

    // Pre-arrival WhatsApp: confirmed, not yet sent, pickup today or tomorrow (Bratislava)
    if (
      b.status === 'confirmed' &&
      (settings?.pre_arrival_reminders_enabled ?? true) &&
      b.prearrival_reminder_enabled === true &&
      b.prearrival_whatsapp_sent !== true &&
      isTodayOrTomorrow(b.pickup_at)
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

    // Return-prep WhatsApp: confirmed/on_rent, not yet sent, return today or tomorrow (Bratislava)
    if ((settings?.return_prep_reminders_enabled ?? true) && b.return_prep_reminder_enabled === true && b.return_at && isTodayOrTomorrow(b.return_at)) {
      const returnMs = new Date(b.return_at).getTime()
      const daysUntilReturn = Math.round((returnMs - now) / 86400000)
      if (b.return_whatsapp_sent !== true) {
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

    // Review imported: booking was imported from an external source,
    // is still active, the return date has not yet passed,
    // and at least one per-booking reminder field has not yet been reviewed (still null).
    const needsReview =
      b.balance_invoice_reminder_enabled === null ||
      b.prearrival_reminder_enabled === null ||
      b.return_prep_reminder_enabled === null

    const isImportedCandidate =
      b.source_type &&
      (IMPORT_SOURCE_TYPES as readonly string[]).includes(b.source_type) &&
      b.status !== 'completed' &&
      b.status !== 'cancelled' &&
      b.return_at &&
      new Date(b.return_at).getTime() >= now

    if (
      isImportedCandidate &&
      needsReview
    ) {
      results.push({
        type: 'review_imported',
        key: 'ops.review_imported_booking',
        id: `${b.id}-review-imported`,
        bookingId: b.id,
        bookingNumber: b.booking_number ?? '',
        customerName: b.customer_name ?? '',
        vehicleName: vehicle?.name ?? '',
        pickupAt: b.pickup_at,
        daysUntilPickup,
      })
    }
  }

  return results
}
