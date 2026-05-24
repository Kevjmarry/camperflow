import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

const ALPINE_DEMO_COMPANY_ID = 'aa8c5a35-8c06-4dee-8c13-7b3523f549d2'

export async function POST() {
  const supabase = await createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  if (profile.company_id !== ALPINE_DEMO_COMPANY_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // TODO: implement reset logic.
  // When implemented, this route must also sync the DB frozen date so the
  // ops_bookings view (get_company_now function) uses the same date as the
  // TS-side getDemoToday helper:
  //
  //   const frozenDate = process.env.DEMO_FROZEN_DATE  // e.g. '2026-05-24'
  //   if (frozenDate) {
  //     await supabase
  //       .from('company_settings')
  //       .update({ demo_frozen_date: `${frozenDate}T12:00:00.000Z` })
  //       .eq('id', ALPINE_DEMO_COMPANY_ID)
  //   }
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
