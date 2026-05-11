import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email: rawEmail, profile_id, locale: rawLocale } = body

    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
    const locale =
      rawLocale && typeof rawLocale === 'string' && rawLocale.trim()
        ? rawLocale.trim()
        : 'en'

    if (!email || !profile_id) {
      return NextResponse.json(
        { error: 'Missing required fields: email and profile_id' },
        { status: 400 }
      )
    }

    const siteUrl =
      process.env.NODE_ENV === 'development'
        ? (process.env.NEXT_PUBLIC_SITE_URL || request.headers.get('origin') || 'http://localhost:3000')
        : (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '')

    const supabase = await createServerClient()

    // Verify the calling user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get caller's profile to check permissions
    const { data: callerProfile, error: callerError } = await supabase
      .from('staff_profiles')
      .select('company_id, role, can_manage')
      .eq('auth_user_id', user.id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (callerProfile.role !== 'admin' && !callerProfile.can_manage) {
      return NextResponse.json(
        { error: 'Insufficient permissions to send invitations' },
        { status: 403 }
      )
    }

    // Verify the target profile exists and belongs to the same company
    const { data: targetProfile, error: targetError } = await supabase
      .from('staff_profiles')
      .select('company_id, auth_user_id, email')
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

    // Use the service role client for admin operations
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // If already linked to an auth user → generate a recovery link using the auth user's email
    if (targetProfile.auth_user_id !== null) {
      const { data: authUserData, error: authUserError } =
        await adminClient.auth.admin.getUserById(targetProfile.auth_user_id)

      if (authUserError || !authUserData?.user) {
        return NextResponse.json(
          { error: 'Failed to retrieve linked auth user' },
          { status: 500 }
        )
      }

      const authUserEmail = authUserData.user.email

      if (!authUserEmail) {
        return NextResponse.json(
          { error: 'Linked auth user has no email address' },
          { status: 500 }
        )
      }

      const redirectTo = `${siteUrl || 'https://app.camperflow.io'}/${locale}/staff/reset`

      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: authUserEmail,
          options: { redirectTo },
        })

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 })
      }

      const actionLink = linkData?.properties?.action_link

      if (!actionLink) {
        return NextResponse.json(
          { error: 'Failed to generate recovery link' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, mode: 'recovery_link', action_link: actionLink })
    }

    // auth_user_id is null → send invite email
    // Validate that the request email matches the profile email (case-insensitive)
    const profileEmail =
      typeof targetProfile.email === 'string' ? targetProfile.email.trim().toLowerCase() : null

    if (profileEmail && profileEmail !== email) {
      return NextResponse.json(
        { error: 'Request email does not match the profile email' },
        { status: 400 }
      )
    }

    // Use the profile's stored email if available, otherwise fall back to request email
    const inviteEmail = profileEmail ?? email

    const redirectTo = `${siteUrl}/${locale}/staff/invite/accept?profile_id=${profile_id}`

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(inviteEmail, { redirectTo })

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    const invitedUserId = inviteData.user?.id

    if (!invitedUserId) {
      return NextResponse.json(
        { error: 'Failed to retrieve invited user ID' },
        { status: 500 }
      )
    }

    // Link auth user to staff profile only where auth_user_id is still NULL
    const { data: updatedRows, error: updateError } = await adminClient
      .from('staff_profiles')
      .update({ auth_user_id: invitedUserId })
      .eq('profile_id', profile_id)
      .is('auth_user_id', null)
      .select('profile_id')

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: 'Profile was already linked to an account' },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, mode: 'invite', user_id: invitedUserId })
  } catch (error) {
    console.error('Invite route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}