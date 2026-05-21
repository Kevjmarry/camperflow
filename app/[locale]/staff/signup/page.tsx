import type { ReactNode } from 'react'
import Stripe from 'stripe'
import SignupForm from './SignupForm'

export default async function StaffSignupPage({
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id } = await searchParams

  if (!session_id) {
    return (
      <Shell title="Missing session" isError>
        No <code>?session_id=</code> parameter was found in the URL. The marketing
        site must redirect here with <code>?session_id=cs_…</code> after checkout.
      </Shell>
    )
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return (
      <Shell title="Configuration error" isError>
        <code>STRIPE_SECRET_KEY</code> is not set in the environment.
      </Shell>
    )
  }

  const stripe = new Stripe(stripeKey)

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return (
      <Shell title="Stripe error" isError>
        {msg}
      </Shell>
    )
  }

  if (session.payment_status !== 'paid') {
    return (
      <Shell title="Payment not completed" isError>
        This session has not been paid. Please complete checkout first.
      </Shell>
    )
  }

  if (session.mode !== 'subscription') {
    return (
      <Shell title="Invalid session" isError>
        Unexpected session mode: <code>{session.mode}</code>
      </Shell>
    )
  }

  const customerEmail = session.customer_details?.email
  if (!customerEmail) {
    return (
      <Shell title="Missing email" isError>
        No customer email was found in the Stripe session. Please contact support.
      </Shell>
    )
  }

  const plan = session.metadata?.plan ?? null

  return (
    <Shell title="Complete your account">
      <SignupForm
        email={customerEmail}
        sessionId={session_id}
        plan={plan}
      />
    </Shell>
  )
}

function Shell({
  title,
  isError = false,
  children,
}: {
  title: string
  isError?: boolean
  children: ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'rgb(var(--app-bg))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <div
        className="surface"
        style={{ width: '100%', maxWidth: '520px', padding: 'var(--space-8)' }}
      >
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            marginBottom: 'var(--space-5)',
            color: isError ? 'rgb(var(--error))' : 'rgb(var(--text))',
          }}
        >
          {title}
        </h1>
        {isError ? (
          <div
            style={{
              fontSize: '14px',
              color: 'rgb(var(--error))',
              background: 'rgb(var(--error) / 0.08)',
              border: '1px solid rgb(var(--error) / 0.3)',
              borderRadius: 'var(--radius)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
