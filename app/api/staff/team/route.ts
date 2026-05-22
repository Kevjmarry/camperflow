import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    if (callerProfile.role !== 'admin' && !callerProfile.can_manage) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('over_limit, included_staff, purchased_extra_staff')
      .eq('id', callerProfile.company_id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 403 })
    }

    if (company.over_limit) {
      return NextResponse.json({ error: 'over_limit' }, { status: 402 })
    }

    const staffLimit = (company.included_staff ?? 0) + (company.purchased_extra_staff ?? 0)
    if (staffLimit > 0) {
      const { count: staffCount } = await supabase
        .from('staff_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', callerProfile.company_id)
        .eq('active', true)

      if ((staffCount ?? 0) >= staffLimit) {
        return NextResponse.json({ error: 'staff_limit_reached' }, { status: 402 })
      }
    }

    const body = await request.json()
    const {
      first_name, last_name, role, can_manage,
      can_clean, can_mechanical, phone, email, notes,
    } = body

    const name = `${String(first_name).trim()} ${String(last_name).trim()}`

    const { data: newMember, error: insertError } = await supabase
      .from('staff_profiles')
      .insert({
        company_id: callerProfile.company_id,
        name,
        first_name: String(first_name).trim(),
        last_name: String(last_name).trim(),
        role,
        can_manage: can_manage ?? false,
        can_clean: can_clean ?? false,
        can_mechanical: can_mechanical ?? false,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
        active: true,
      })
      .select('profile_id')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json(newMember, { status: 201 })
  } catch (err) {
    console.error('[team POST] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
