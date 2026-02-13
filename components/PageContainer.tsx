'use client'

import React from "react";
import { useRouter } from 'next/navigation'
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
  maxWidth = '1200px',
  showSignOut = true,
}: PageContainerProps) {
  const router = useRouter()
  const t = useTranslations('pageContainer')

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'rgb(var(--app-bg))',
        color: 'rgb(var(--text))',
      }}
    >
      <div
        style={{
          maxWidth,
          margin: '0 auto',
          padding: 'var(--space-4)',
        }}
      >
        {(title || showSignOut) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-6)',
            }}
          >
            {title && (
              <h1
                style={{
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: 'rgb(var(--text))',
                }}
              >
                {title}
              </h1>
            )}
            {showSignOut && (
              <button
                onClick={handleSignOut}
                className="btn btn-secondary"
                style={{
                  marginLeft: 'auto',
                }}
              >
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