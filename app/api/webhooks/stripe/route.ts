import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { PRICE_PLAN_MAP } from '@/lib/billing/plans'

export async function POST(request: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const stripe = new Stripe(stripeKey)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('[webhooks/stripe] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    const priceId = sub.items.data[0]?.price?.id ?? null
    const planConfig = priceId ? (PRICE_PLAN_MAP[priceId] ?? null) : null
    if (priceId && !planConfig) {
      console.warn('[webhooks/stripe] unknown price ID %s — plan/limits not updated for customer %s', priceId, customerId)
    }

    const update: Record<string, unknown> = { subscription_status: sub.status }
    if (planConfig) {
      update.subscription_plan    = planConfig.plan
      update.included_vehicles    = planConfig.included_vehicles
      update.included_staff       = planConfig.included_staff
      update.max_extra_vehicles   = planConfig.max_extra_vehicles
      update.max_extra_staff      = planConfig.max_extra_staff
    }

    // Compute over_limit against new plan limits (requires over_limit boolean column on companies)
    if (planConfig) {
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (company) {
        const [vehiclesRes, staffRes] = await Promise.all([
          supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('staff_profiles').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('active', true),
        ])
        const vehicleCount = vehiclesRes.count ?? 0
        const staffCount = staffRes.count ?? 0
        update.over_limit =
          vehicleCount > planConfig.included_vehicles ||
          staffCount > planConfig.included_staff
      }
    }

    const { error } = await supabase
      .from('companies')
      .update(update)
      .eq('stripe_customer_id', customerId)

    if (error) {
      console.error('[webhooks/stripe] update failed event=%s customer=%s error=%s', event.type, customerId, error.message)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }
  } else if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const raw = invoice.customer
    const customerId =
      typeof raw === 'string' ? raw :
      raw && typeof raw === 'object' && 'id' in raw ? (raw as { id: string }).id :
      null

    if (customerId) {
      const { error } = await supabase
        .from('companies')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', customerId)

      if (error) {
        console.error('[webhooks/stripe] update failed event=invoice.payment_failed customer=%s error=%s', customerId, error.message)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}
