import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const returnPath = searchParams.get('returnPath') ?? '/en/staff/settings/billing'
    const safeReturnPath = /^\/[a-z]{2}\/staff\//.test(returnPath)
      ? returnPath
      : '/en/staff/settings/billing'

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('staff_profiles')
      .select('company_id, role, can_manage')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 })
    }

    if (profile.role !== 'admin' && !profile.can_manage) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('stripe_customer_id')
      .eq('id', profile.company_id)
      .maybeSingle()

    if (!company?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please contact support.' },
        { status: 400 }
      )
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 })
    }

    const stripe = new Stripe(stripeKey)
    const siteUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : (process.env.NEXT_PUBLIC_SITE_URL || 'https://app.camperflow.io')

    const flow = searchParams.get('flow')

    let flowData: Stripe.BillingPortal.SessionCreateParams['flow_data'] | undefined
    if (flow === 'subscription_update') {
      const subs = await stripe.subscriptions.list({
        customer: company.stripe_customer_id,
        status: 'active',
        limit: 1,
      })
      const sub = subs.data[0]
      if (sub) {
        flowData = {
          type: 'subscription_update',
          subscription_update: { subscription: sub.id },
        }
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${siteUrl}${safeReturnPath}`,
      ...(flowData ? { flow_data: flowData } : {}),
    })

    return NextResponse.redirect(portalSession.url)
  } catch (error) {
    console.error('[billing/portal] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
