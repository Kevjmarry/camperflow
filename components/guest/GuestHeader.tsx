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
        justifyContent: 'flex-end',
        minHeight: '44px',
      }}
    >
      {/* Company identity */}
      {company && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0 var(--space-3)',
            borderLeft: '1px solid rgb(var(--border))',
            gap: '1px',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--foreground))', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            {company.name}
          </span>
          <span style={{ fontSize: '10px', color: 'rgb(var(--muted))', lineHeight: 1.2, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
            {company.id.slice(0, 6)}
          </span>
        </div>
      )}

      {/* Locale switcher */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--space-3)',
          borderLeft: '1px solid rgb(var(--border))',
        }}
      >
        <LocaleSwitcher />
      </div>
    </nav>
  )
}
