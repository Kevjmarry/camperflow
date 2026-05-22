import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: NextRequest) {
  try {
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
      .select(`
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status,
        subscription_plan,
        included_vehicles,
        included_staff,
        max_extra_vehicles,
        max_extra_staff,
        purchased_extra_vehicles,
        purchased_extra_staff
      `)
      .eq('id', profile.company_id)
      .maybeSingle()

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const [vehiclesRes, staffRes] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id),
      supabase
        .from('staff_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('active', true),
    ])

    const vehicleCount = vehiclesRes.count ?? 0
    const staffCount = staffRes.count ?? 0

    let stripeData: {
      current_period_end: number | null
      amount: number | null
      currency: string | null
      interval: string | null
    } = { current_period_end: null, amount: null, currency: null, interval: null }

    if (company.stripe_subscription_id) {
      const stripeKey = process.env.STRIPE_SECRET_KEY
      if (stripeKey) {
        try {
          const stripe = new Stripe(stripeKey)
          const sub = await stripe.subscriptions.retrieve(
            company.stripe_subscription_id,
            { expand: ['items.data.price'] },
          )
          const topLevel = (sub as unknown as Record<string, unknown>)['current_period_end']
          const item0 = sub.items.data[0] as unknown as Record<string, unknown> | undefined
          const fromItem = item0?.['current_period_end']
          const currentPeriodEnd =
            typeof topLevel === 'number' ? topLevel :
            typeof fromItem === 'number' ? fromItem :
            null
          const price = sub.items.data[0]?.price as Stripe.Price | undefined
          stripeData = {
            current_period_end: currentPeriodEnd,
            amount: price?.unit_amount ?? null,
            currency: price?.currency ?? null,
            interval: price?.recurring?.interval ?? null,
          }
        } catch (e) {
          console.error('[billing/info] Stripe fetch failed:', e)
        }
      }
    }

    const includedVehicles = company.included_vehicles ?? 0
    const includedStaff = company.included_staff ?? 0
    const over_limit =
      (includedVehicles > 0 && vehicleCount > includedVehicles) ||
      (includedStaff > 0 && staffCount > includedStaff)

    return NextResponse.json({
      subscription_status: company.subscription_status,
      subscription_plan: company.subscription_plan,
      included_vehicles: includedVehicles,
      included_staff: includedStaff,
      max_extra_vehicles: company.max_extra_vehicles,
      max_extra_staff: company.max_extra_staff,
      purchased_extra_vehicles: company.purchased_extra_vehicles,
      purchased_extra_staff: company.purchased_extra_staff,
      vehicle_count: vehicleCount,
      staff_count: staffCount,
      over_limit,
      current_period_end: stripeData.current_period_end,
      amount: stripeData.amount,
      currency: stripeData.currency,
      interval: stripeData.interval,
    })
  } catch (error) {
    console.error('[billing/info] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
