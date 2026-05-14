import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const type = body?.type

  if (
    type !== 'balance_invoice' &&
    type !== 'pre_arrival' &&
    type !== 'return_prep' &&
    type !== 'review_request'
  ) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const field =
    type === 'balance_invoice'  ? 'balance_invoice_sent' :
    type === 'return_prep'      ? 'return_whatsapp_sent' :
    type === 'review_request'   ? 'review_request_whatsapp_sent' :
                                  'prearrival_whatsapp_sent'

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ [field]: true })
    .eq('id', bookingId)
    .eq('company_id', profile.company_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
