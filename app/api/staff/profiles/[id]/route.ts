import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: profileId } = await params

    if (!profileId) {
      return NextResponse.json({ error: 'Missing profile ID' }, { status: 400 })
    }

    const supabase = await createServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerProfile, error: callerError } = await supabase
      .from('staff_profiles')
      .select('company_id, role')
      .eq('auth_user_id', user.id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete staff members' }, { status: 403 })
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from('staff_profiles')
      .select('profile_id, company_id, auth_user_id, active')
      .eq('profile_id', profileId)
      .single()

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: 'Staff profile not found' }, { status: 404 })
    }

    if (targetProfile.company_id !== callerProfile.company_id) {
      return NextResponse.json({ error: 'Profile belongs to a different company' }, { status: 403 })
    }

    if (targetProfile.profile_id === profileId && targetProfile.auth_user_id === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own profile' }, { status: 403 })
    }

    if (targetProfile.active === true) {
      return NextResponse.json(
        { error: 'Staff member must be deactivated before deletion' },
        { status: 409 }
      )
    }

    const { error: deleteProfileError } = await supabase
      .from('staff_profiles')
      .delete()
      .eq('profile_id', profileId)
      .eq('company_id', callerProfile.company_id)

    if (deleteProfileError) {
      console.error('[staff/profiles DELETE] profile delete error:', deleteProfileError)
      return NextResponse.json({ error: deleteProfileError.message }, { status: 500 })
    }

    if (targetProfile.auth_user_id) {
      const adminClient = createServiceClient()
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(
        targetProfile.auth_user_id
      )

      if (authDeleteError) {
        console.error(
          '[staff/profiles DELETE] auth user delete failed for',
          targetProfile.auth_user_id,
          authDeleteError
        )
        return NextResponse.json(
          {
            error: `Staff profile deleted but failed to remove linked auth account: ${authDeleteError.message}`,
            partial: true,
          },
          { status: 500 }
        )
      }

      console.log(
        '[staff/profiles DELETE] deleted auth user',
        targetProfile.auth_user_id,
        'for profile',
        profileId
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[staff/profiles DELETE] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
