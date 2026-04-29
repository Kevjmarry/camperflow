'use client'

import React from "react";
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface PageContainerProps {
  children: React.ReactNode
  title?: string
  maxWidth?: string
  showSignOut?: boolean
}

export default function PageContainer({
  children,
  title,
  maxWidth = '1400px',
  showSignOut = true,
}: PageContainerProps) {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations('pageContainer')

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    const locale = params.locale as string
    router.push(`/${locale}`)
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'rgb(var(--app-bg))',
        color: 'rgb(var(--text))',
      }}
    >
      <div
        className="page-container-inner"
        style={{
          width: '100%',
          maxWidth,
          margin: '0 auto',
          '--page-container-pb': showSignOut
            ? 'calc(96px + env(safe-area-inset-bottom))'
            : 'calc(60px + env(safe-area-inset-bottom))',
        } as React.CSSProperties}
      >
        {(title || showSignOut) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-6)',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
            }}
          >
            {title ? (
              <h1
                style={{
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: 'rgb(var(--text))',
                  margin: 0,
                }}
              >
                {title}
              </h1>
            ) : (
              <div />
            )}

            {showSignOut && (
              <button onClick={handleSignOut} className="btn btn-secondary">
                {t('signOut')}
              </button>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}