import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server'
import { PRICE_PLAN_MAP, FALLBACK_LIMITS } from '@/lib/billing/plans'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { session_id, full_name: rawName, company_name: rawCompany, password } = body

    const full_name = typeof rawName === 'string' ? rawName.trim() : ''
    const company_name = typeof rawCompany === 'string' ? rawCompany.trim() : ''

    // [TEMP LOG] prove which route received the submit
    console.log('[stripe-signup] POST received route=/api/staff/stripe-signup session_id=%s full_name=%s company_name=%s', session_id ? 'present' : 'MISSING', full_name || '(empty)', company_name || '(empty)')

    if (!session_id || !full_name || !company_name || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    const stripe = new Stripe(stripeKey)
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['subscription', 'subscription.items.data.price'],
      })
    } catch {
      return NextResponse.json({ error: 'Invalid or expired Stripe session' }, { status: 400 })
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    if (session.mode !== 'subscription') {
      return NextResponse.json({ error: 'Invalid session type' }, { status: 400 })
    }

    const email = session.customer_details?.email
    if (!email) {
      return NextResponse.json({ error: 'No email found in Stripe session' }, { status: 400 })
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id ?? null

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription | null)?.id ?? null

    const expandedSub =
      session.subscription !== null && typeof session.subscription === 'object'
        ? (session.subscription as Stripe.Subscription)
        : null

    const priceId = expandedSub?.items?.data?.[0]?.price?.id ?? null
    const planConfig = priceId ? (PRICE_PLAN_MAP[priceId] ?? null) : null
    const plan = planConfig?.plan ?? null
    const planLimits = planConfig ?? FALLBACK_LIMITS

    // [TEMP LOG] prove Stripe IDs were extracted
    console.log('[stripe-signup] stripe customer_id=%s subscription_id=%s price_id=%s plan=%s', customerId ?? 'NULL', subscriptionId ?? 'NULL', priceId ?? 'null', plan ?? 'null')

    if (!customerId) {
      console.error('[stripe-signup] Stripe session missing customer ID session_id=%s', session_id)
      return NextResponse.json({ error: 'Stripe session is missing a customer ID. Please contact support.' }, { status: 400 })
    }

    if (!subscriptionId) {
      console.error('[stripe-signup] Stripe session missing subscription ID session_id=%s', session_id)
      return NextResponse.json({ error: 'Stripe session is missing a subscription ID. Please contact support.' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.camperflow.io'
    const supabase = await createServerClient()
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name },
        emailRedirectTo: `${siteUrl}/api/auth/confirm`,
      },
    })

    if (signUpError) {
      return NextResponse.json({ error: signUpError.message }, { status: 400 })
    }

    const user = authData.user
    if (!user) {
      return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
    }

    if (user.identities && user.identities.length === 0) {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 })
    }

    const spaceIdx = full_name.indexOf(' ')
    const first_name = spaceIdx === -1 ? full_name : full_name.slice(0, spaceIdx)
    const last_name = spaceIdx === -1 ? null : full_name.slice(spaceIdx + 1) || null

    const company_id = crypto.randomUUID()
    const adminClient = createServiceClient()

    // [TEMP LOG] exact companies insert payload
    console.log('[stripe-signup] companies insert payload', JSON.stringify({ id: company_id, name: company_name, stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, subscription_status: 'active', subscription_plan: plan, ...planLimits }))

    const { error: companyError } = await adminClient
      .from('companies')
      .insert({
        id: company_id,
        name: company_name,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: 'active',
        subscription_plan: plan,
        included_vehicles: planLimits.included_vehicles,
        included_staff: planLimits.included_staff,
        max_extra_vehicles: planLimits.max_extra_vehicles,
        max_extra_staff: planLimits.max_extra_staff,
      })

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
      try { await adminClient.from('companies').delete().eq('id', company_id) } catch {}
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
      try { await adminClient.from('company_settings').delete().eq('id', company_id) } catch {}
      try { await adminClient.from('companies').delete().eq('id', company_id) } catch {}
      return NextResponse.json({ error: 'Failed to create staff profile' }, { status: 500 })
    }

    const { error: metaError } = await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { company_id },
    })
    if (metaError) {
      console.error('[stripe-signup] app_metadata update failed user=%s error=%s', user.id, metaError.message)
    }

    const { error: tplError } = await adminClient.rpc(
      'provision_default_checklist_templates',
      { p_company_id: company_id },
    )
    if (tplError) {
      console.error('[stripe-signup] provision_default_checklist_templates failed company_id=%s code=%s message=%s', company_id, tplError.code, tplError.message)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[stripe-signup] route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
