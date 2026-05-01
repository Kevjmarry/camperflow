'use client'

import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export default function GuestSignOutButton() {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations('pageContainer')

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(`/${params.locale}`)
  }

  return (
    <button onClick={handleSignOut} className="btn btn-secondary">
      {t('signOut')}
    </button>
  )
}
