import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/supabase/getEffectiveUser'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getEffectiveUser(supabase)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('staff_profiles')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 })
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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.camperflow.io'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${siteUrl}/en/staff/company`,
    })

    return NextResponse.redirect(portalSession.url)
  } catch (error) {
    console.error('[billing/portal] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
