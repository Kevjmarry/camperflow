import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { profile_id, email: rawEmail } = body

    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''

    if (!profile_id || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: profile_id and email' },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerProfile, error: callerError } = await supabase
      .from('staff_profiles')
      .select('company_id, role, can_manage')
      .eq('auth_user_id', user.id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (callerProfile.role !== 'admin' && !callerProfile.can_manage) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from('staff_profiles')
      .select('company_id, auth_user_id')
      .eq('profile_id', profile_id)
      .single()

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: 'Target profile not found' }, { status: 404 })
    }

    if (targetProfile.company_id !== callerProfile.company_id) {
      return NextResponse.json(
        { error: 'Profile belongs to a different company' },
        { status: 403 }
      )
    }

    if (!targetProfile.auth_user_id) {
      return NextResponse.json({ skipped: true })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetProfile.auth_user_id,
      { email }
    )

    if (updateError) {
      // GoTrue returns 422 / error_code "email_exists" when the address belongs to another account
      const status = (updateError as any).status
      if (status === 422 || /already|in use|email_exists/i.test(updateError.message)) {
        return NextResponse.json(
          { error: 'This email is already used by another account' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('update-auth-email route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
