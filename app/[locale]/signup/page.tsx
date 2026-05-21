import { redirect } from 'next/navigation'
import SignupClient from './SignupClient'

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { locale } = await params
  const { session_id } = await searchParams

  // Stripe checkout success URLs sometimes land here instead of /{locale}/staff/signup.
  // Redirect transparently so the paid signup flow runs correctly.
  if (session_id) {
    redirect(`/${locale}/staff/signup?session_id=${encodeURIComponent(session_id)}`)
  }

  return <SignupClient />
}
