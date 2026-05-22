import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'

const PRICE_PLAN_MAP: Record<string, {
  plan: string
  included_vehicles: number
  included_staff: number
  max_extra_vehicles: number
  max_extra_staff: number
}> = {
  price_1TZXTPIhm4YI8m30XpwGR05g: { plan: 'starter', included_vehicles: 3,  included_staff: 3,  max_extra_vehicles: 0, max_extra_staff: 0 },
  price_1TZXVCIhm4YI8m306ZWJWBfu: { plan: 'core',    included_vehicles: 5,  included_staff: 5,  max_extra_vehicles: 0, max_extra_staff: 0 },
  price_1TZXXpIhm4YI8m308GZATyhu: { plan: 'growth',  included_vehicles: 15, included_staff: 15, max_extra_vehicles: 0, max_extra_staff: 0 },
  price_1TZXZRIhm4YI8m308YOwthl4: { plan: 'pro',     included_vehicles: 30, included_staff: 30, max_extra_vehicles: 0, max_extra_staff: 0 },
}

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

    const update: Record<string, unknown> = { subscription_status: sub.status }
    if (planConfig) {
      update.subscription_plan    = planConfig.plan
      update.included_vehicles    = planConfig.included_vehicles
      update.included_staff       = planConfig.included_staff
      update.max_extra_vehicles   = planConfig.max_extra_vehicles
      update.max_extra_staff      = planConfig.max_extra_staff
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
