'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { createClient } from '@/lib/supabase/client'
import { activeLocales, type Locale } from '@/i18n'

export default function GuestHeader() {
  const { company } = useTheme()
  const [guestLocales, setGuestLocales] = useState<readonly Locale[]>(activeLocales)

  useEffect(() => {
    if (!company?.id) return
    const supabase = createClient()
    supabase
      .from('company_settings')
      .select('guest_languages_order')
      .eq('id', company.id)
      .maybeSingle()
      .then(({ data }) => {
        const order = (data as any)?.guest_languages_order as string[] | null
        if (order && order.length > 0) {
          const valid = order.filter((l): l is Locale =>
            (activeLocales as readonly string[]).includes(l)
          )
          if (valid.length > 0) setGuestLocales(valid)
        }
      })
  }, [company?.id])

  return (
    <nav
      style={{
        width: '100%',
        background: 'rgb(var(--surface))',
        borderBottom: '1px solid rgb(var(--border))',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        minHeight: '44px',
      }}
    >
      <style>{`
        .gh-powered { display: flex; }
        @media (max-width: 479px) { .gh-powered { display: none; } }
      `}</style>

      {/* Company identity (left) — shrinks and truncates on narrow screens */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '0 var(--space-4)',
          minWidth: 0,
          flexShrink: 1,
          overflow: 'hidden',
        }}
      >
        {company?.logo_url && (
          <img
            src={company.logo_url}
            alt={company.name}
            style={{ height: '28px', width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
          />
        )}
        {company && (
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--foreground))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {company.name}
          </span>
        )}
      </div>

      {/* Right side — never shrinks */}
      <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
        {/* Powered by CamperFlow — hidden below 480px */}
        <div
          className="gh-powered"
          style={{
            alignItems: 'center',
            padding: '0 var(--space-3)',
            borderLeft: '1px solid rgb(var(--border))',
          }}
        >
          <span style={{ fontSize: '10px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
            Powered by CamperFlow
          </span>
        </div>

        {/* Locale switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 var(--space-3)',
            borderLeft: '1px solid rgb(var(--border))',
          }}
        >
          <LocaleSwitcher availableLocales={guestLocales} />
        </div>
      </div>
    </nav>
  )
}
