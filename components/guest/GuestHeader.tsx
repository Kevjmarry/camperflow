'use client'

import { useTheme } from '@/contexts/ThemeContext'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export default function GuestHeader() {
  const { company } = useTheme()

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
          <LocaleSwitcher />
        </div>
      </div>
    </nav>
  )
}
