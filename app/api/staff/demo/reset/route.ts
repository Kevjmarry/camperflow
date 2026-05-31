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

  // Demo seed not yet implemented — refuse without touching any data.
  return NextResponse.json({ error: 'Demo seed not configured yet' }, { status: 501 })
}
