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

  if (type !== 'balance_invoice' && type !== 'pre_arrival' && type !== 'return_prep') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, staff_metadata')
    .eq('id', bookingId)
    .eq('company_id', profile.company_id)
    .single()

  if (fetchErr || !booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const field =
    type === 'balance_invoice' ? 'balance_invoice_sent_at' :
    type === 'return_prep'     ? 'return_prep_message_sent_at' :
                                 'pre_arrival_message_sent_at'
  const updatedMeta = {
    ...((booking.staff_metadata as Record<string, unknown>) ?? {}),
    [field]: new Date().toISOString(),
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ staff_metadata: updatedMeta })
    .eq('id', bookingId)
    .eq('company_id', profile.company_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
