'use client'

import LocaleSwitcher from '@/components/LocaleSwitcher'
import { useTheme } from '@/contexts/ThemeContext'

export default function StaffMobileHeader() {
  const { company } = useTheme()

  return (
    <nav
      className="staff-mobile-header"
      style={{
        width: '100%',
        background: 'rgb(var(--surface))',
        borderBottom: '1px solid rgb(var(--border))',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        minHeight: '44px',
      }}
    >
      <style>{`
        .staff-mobile-header { display: flex; }
        @media (min-width: 768px) {
          .staff-mobile-header { display: none !important; }
        }
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
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'rgb(var(--foreground))',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {company.name}
          </span>
        )}
      </div>

      {/* Locale switcher (right) — never shrinks */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--space-3)',
          borderLeft: '1px solid rgb(var(--border))',
          flexShrink: 0,
        }}
      >
        <LocaleSwitcher />
      </div>
    </nav>
  )
}
