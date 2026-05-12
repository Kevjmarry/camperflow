import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { full_name: rawName, company_name: rawCompany, email: rawEmail, password } = body

    const full_name = typeof rawName === 'string' ? rawName.trim() : ''
    const company_name = typeof rawCompany === 'string' ? rawCompany.trim() : ''
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''

    if (!full_name || !company_name || !email || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    })

    if (signUpError) {
      return NextResponse.json({ error: signUpError.message }, { status: 400 })
    }

    const user = authData.user
    if (!user) {
      return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
    }

    // Supabase returns empty identities array when the email is already registered
    if (user.identities && user.identities.length === 0) {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 })
    }

    const spaceIdx = full_name.indexOf(' ')
    const first_name = spaceIdx === -1 ? full_name : full_name.slice(0, spaceIdx)
    const last_name = spaceIdx === -1 ? null : full_name.slice(spaceIdx + 1) || null

    const company_id = crypto.randomUUID()
    const adminClient = createServiceClient()

    const { error: companyError } = await adminClient
      .from('companies')
      .insert({ id: company_id, name: company_name })

    if (companyError) {
      await adminClient.auth.admin.deleteUser(user.id).catch(() => {})
      return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
    }

    const { error: settingsError } = await adminClient
      .from('company_settings')
      .insert({
        id: company_id,
        name: company_name,
        primary_color: '#368F8B',
        secondary_color: '#BC8235',
        accent_color: '#0A0A0A',
      })

    if (settingsError) {
      await adminClient.auth.admin.deleteUser(user.id).catch(() => {})
      await adminClient.from('companies').delete().eq('id', company_id).catch(() => {})
      return NextResponse.json({ error: 'Failed to create company settings' }, { status: 500 })
    }

    const { error: profileError } = await adminClient
      .from('staff_profiles')
      .insert({
        auth_user_id: user.id,
        company_id,
        name: full_name,
        first_name,
        last_name,
        email,
        role: 'admin',
        can_manage: true,
        can_clean: false,
        can_mechanical: false,
        active: true,
      })

    if (profileError) {
      await adminClient.auth.admin.deleteUser(user.id).catch(() => {})
      await adminClient.from('company_settings').delete().eq('id', company_id).catch(() => {})
      await adminClient.from('companies').delete().eq('id', company_id).catch(() => {})
      return NextResponse.json({ error: 'Failed to create staff profile' }, { status: 500 })
    }

    const { error: tplError } = await adminClient.rpc(
      'provision_default_checklist_templates',
      { p_company_id: company_id },
    )
    if (tplError) {
      console.error('[signup] provision_default_checklist_templates failed company_id=%s code=%s message=%s', company_id, tplError.code, tplError.message)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Signup route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
