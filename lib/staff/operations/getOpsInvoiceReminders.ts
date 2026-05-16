import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v) }

const IMPORT_SOURCE_TYPES = ['ical', 'bookingmood_csv', 'bookingmood_json'] as const

const TZ = 'Europe/Bratislava'
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export interface OpsInvoiceReminder {
  type: 'balance_invoice' | 'pre_arrival' | 'return_prep' | 'review_request' | 'review_imported'
  key?: string
  id: string
  bookingId: string
  bookingNumber: string
  customerName: string
  vehicleName: string
  pickupAt: string
  daysUntilPickup: number
  // return_prep / review_request only:
  returnAt?: string
  daysUntilReturn?: number
  returnIsToday?: boolean
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
    .select('final_payment_reminders_enabled, pre_arrival_reminders_enabled, return_prep_reminders_enabled, review_request_reminders_enabled')
    .eq('id', companyId)
    .maybeSingle()

  const now = Date.now()

  const [activeResult, completedResult] = await Promise.all([
    supabase
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
      .gte('return_at', new Date(now).toISOString())
      .order('pickup_at', { ascending: true }),
    supabase
      .from('bookings')
      .select(`
        id,
        booking_number,
        customer_name,
        pickup_at,
        return_at,
        review_request_reminder_enabled,
        review_request_whatsapp_sent,
        vehicles ( name )
      `)
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .not('review_request_whatsapp_sent', 'is', true)
      .order('return_at', { ascending: false }),
  ])

  if (activeResult.error) throw activeResult.error

  const results: OpsInvoiceReminder[] = []

  for (const b of activeResult.data ?? []) {
    if (!b.pickup_at) continue
    const vehicle = b.vehicles
      ? Array.isArray(b.vehicles) ? b.vehicles[0] : b.vehicles
      : null
    const pickupMs = new Date(b.pickup_at).getTime()
    const daysUntilPickup = Math.round((pickupMs - now) / 86400000)

    // Final payment check: split or custom payment, not yet sent
    if (
      b.status === 'confirmed' &&
      settings?.final_payment_reminders_enabled &&
      b.balance_invoice_reminder_enabled !== false &&
      (b.payment_type === 'split' || b.payment_type === 'custom') &&
      b.balance_invoice_sent !== true
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

    // Pre-arrival WhatsApp: confirmed, not yet sent
    if (
      b.status === 'confirmed' &&
      (settings?.pre_arrival_reminders_enabled ?? true) &&
      b.prearrival_reminder_enabled !== false &&
      b.prearrival_whatsapp_sent !== true
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

    // Return-prep WhatsApp: confirmed/on_rent, not yet sent
    if (
      (settings?.return_prep_reminders_enabled ?? true) &&
      b.return_prep_reminder_enabled !== false &&
      b.return_at &&
      b.return_whatsapp_sent !== true
    ) {
      const returnMs = new Date(b.return_at).getTime()
      const daysUntilReturn = Math.round((returnMs - now) / 86400000)
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

    if (isImportedCandidate && needsReview) {
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

  // Review-request WhatsApp: completed bookings, not yet sent
  if (settings?.review_request_reminders_enabled ?? true) {
    const todayStr = dateFmt.format(new Date(now))
    for (const b of completedResult.data ?? []) {
      if (!b.return_at) continue
      if (b.review_request_reminder_enabled === false) continue
      if (b.review_request_whatsapp_sent === true) continue
      const vehicle = b.vehicles
        ? Array.isArray(b.vehicles) ? b.vehicles[0] : b.vehicles
        : null
      const pickupMs = b.pickup_at ? new Date(b.pickup_at).getTime() : now
      const daysUntilPickup = Math.round((pickupMs - now) / 86400000)
      const returnMs = new Date(b.return_at).getTime()
      const daysUntilReturn = Math.round((returnMs - now) / 86400000)
      const returnIsToday = dateFmt.format(new Date(b.return_at)) === todayStr
      results.push({
        type: 'review_request',
        id: `${b.id}-review-request`,
        bookingId: b.id,
        bookingNumber: b.booking_number ?? '',
        customerName: b.customer_name ?? '',
        vehicleName: vehicle?.name ?? '',
        pickupAt: b.pickup_at ?? '',
        daysUntilPickup,
        returnAt: b.return_at,
        daysUntilReturn,
        returnIsToday,
      })
    }
  }

  return results
}
