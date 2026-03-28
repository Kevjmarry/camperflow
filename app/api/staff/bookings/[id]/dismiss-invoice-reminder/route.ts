import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _request: NextRequest,
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

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, staff_metadata')
    .eq('id', bookingId)
    .eq('company_id', profile.company_id)
    .single()

  if (fetchErr || !booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updatedMeta = {
    ...((booking.staff_metadata as Record<string, unknown>) ?? {}),
    invoice_reminder_dismissed_at: new Date().toISOString(),
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ staff_metadata: updatedMeta })
    .eq('id', bookingId)
    .eq('company_id', profile.company_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
