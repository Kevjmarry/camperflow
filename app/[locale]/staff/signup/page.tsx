import type { ReactNode } from 'react';
import Stripe from 'stripe';

export default async function StaffSignupPage({
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <Shell title="Missing session_id" isError>
        No <code>?session_id=</code> parameter was found in the URL. The marketing
        site must redirect here with <code>?session_id=cs_…</code> after checkout.
      </Shell>
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return (
      <Shell title="Configuration error" isError>
        <code>STRIPE_SECRET_KEY</code> is not set in the environment.
      </Shell>
    );
  }

  const stripe = new Stripe(stripeKey);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return (
      <Shell title="Stripe retrieval failed" isError>
        {msg}
      </Shell>
    );
  }

  if (session.payment_status !== 'paid') {
    return (
      <Shell title="Session not paid" isError>
        Expected <code>payment_status</code> of <code>paid</code>, got{' '}
        <code>{session.payment_status}</code>.
      </Shell>
    );
  }

  if (session.mode !== 'subscription') {
    return (
      <Shell title="Unexpected session mode" isError>
        Expected mode <code>subscription</code>, got <code>{session.mode}</code>.
      </Shell>
    );
  }

  const customerEmail = session.customer_details?.email ?? null;

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : (session.customer as Stripe.Customer | null)?.id ?? null;

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null;

  const plan = session.metadata?.plan ?? null;

  const rows: [string, string][] = [
    ['payment_status', session.payment_status],
    ['mode', session.mode],
    ['customer_details.email', customerEmail ?? '—'],
    ['customer (id)', customerId ?? '—'],
    ['subscription (id)', subscriptionId ?? '—'],
    ['metadata.plan', plan ?? '(not set)'],
  ];

  return (
    <Shell title="Stripe session verified">
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} style={{ borderBottom: '1px solid rgb(var(--border))' }}>
              <td
                style={{
                  padding: '10px 24px 10px 0',
                  color: 'rgb(var(--muted))',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'top',
                }}
              >
                {label}
              </td>
              <td
                style={{
                  padding: '10px 0',
                  color: 'rgb(var(--text))',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          marginTop: 'var(--space-6)',
          fontSize: '12px',
          color: 'rgb(var(--muted))',
          borderTop: '1px solid rgb(var(--border))',
          paddingTop: 'var(--space-4)',
        }}
      >
        Debug view — no auth user or company row created yet.
      </p>
    </Shell>
  );
}

function Shell({
  title,
  isError = false,
  children,
}: {
  title: string;
  isError?: boolean;
  children: ReactNode;
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
        style={{ width: '100%', maxWidth: '600px', padding: 'var(--space-8)' }}
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
  );
}
