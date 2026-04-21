'use client'

import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LocaleSwitcher from '@/components/LocaleSwitcher'

// Paths that are "owned" by the More sheet
const MORE_SECTION_PREFIXES = ['/staff/team', '/staff/customers', '/staff/company']

// Auth/unauthenticated pages where the nav should not appear
const AUTH_PATH_FRAGMENTS = ['/staff/login', '/staff/reset', '/staff/invite']

function OperationsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="2" fill={active ? 'rgb(var(--brand))' : 'none'} stroke="currentColor" strokeWidth="1.6"/>
      <rect x="12" y="2" width="8" height="8" rx="2" fill={active ? 'rgb(var(--brand))' : 'none'} stroke="currentColor" strokeWidth="1.6"/>
      <rect x="2" y="12" width="8" height="8" rx="2" fill={active ? 'rgb(var(--brand))' : 'none'} stroke="currentColor" strokeWidth="1.6"/>
      <rect x="12" y="12" width="8" height="8" rx="2" fill={active ? 'rgb(var(--brand))' : 'none'} stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  )
}

function BookingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M7 2v4M15 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M2 9h18" stroke="currentColor" strokeWidth="1.6"/>
      {active && <rect x="6" y="12" width="4" height="4" rx="1" fill="rgb(var(--brand))"/>}
      {!active && <rect x="6" y="12" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>}
    </svg>
  )
}

function VehiclesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M2 13l2.5-5.5A2 2 0 016.3 6.5h9.4a2 2 0 011.8 1l2.5 5.5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        fill={active ? 'rgb(var(--brand) / 0.15)' : 'none'}
      />
      <rect x="1" y="13" width="20" height="5" rx="2" stroke="currentColor" strokeWidth="1.6"
        fill={active ? 'rgb(var(--brand) / 0.15)' : 'none'}
      />
      <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="1.6" fill={active ? 'rgb(var(--brand))' : 'rgb(var(--surface))'}/>
      <circle cx="16" cy="18" r="2" stroke="currentColor" strokeWidth="1.6" fill={active ? 'rgb(var(--brand))' : 'rgb(var(--surface))'}/>
    </svg>
  )
}

function ChecklistsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.6"
        fill={active ? 'rgb(var(--brand) / 0.1)' : 'none'}
      />
      <path d="M7 8l2 2 4-4" stroke={active ? 'rgb(var(--brand))' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 14h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function MoreIcon({ active }: { active: boolean }) {
  const color = active ? 'rgb(var(--brand))' : 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="5" cy="11" r="1.8" fill={color}/>
      <circle cx="11" cy="11" r="1.8" fill={color}/>
      <circle cx="17" cy="11" r="1.8" fill={color}/>
    </svg>
  )
}

export default function MobileBottomNav() {
  const { locale } = useParams<{ locale: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('staff.nav')
  const tPC = useTranslations('pageContainer')
  const [moreOpen, setMoreOpen] = useState(false)

  // Hide on auth/non-authenticated pages
  if (AUTH_PATH_FRAGMENTS.some(f => pathname.includes(f))) return null

  const isMoreActive = MORE_SECTION_PREFIXES.some(p => pathname.includes(p))

  const tabs = [
    { key: 'operations', href: `/${locale}/staff/operations`, Icon: OperationsIcon },
    { key: 'bookings',   href: `/${locale}/staff/bookings`,   Icon: BookingsIcon   },
    { key: 'vehicles',   href: `/${locale}/staff/vehicles`,   Icon: VehiclesIcon   },
    { key: 'checklists', href: `/${locale}/staff/checklists`, Icon: ChecklistsIcon },
  ]

  const moreLinks = [
    { key: 'team',      href: `/${locale}/staff/team`      },
    { key: 'customers', href: `/${locale}/staff/customers`  },
    { key: 'company',   href: `/${locale}/staff/company`    },
  ]

  const handleSignOut = async () => {
    setMoreOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(`/${locale}`)
  }

  return (
    <>
      <style>{`
        .mobile-bottom-nav {
          display: flex;
        }
        .mobile-bottom-nav-sheet {
          display: block;
        }
        .mobile-bottom-nav-backdrop {
          display: block;
        }
        @media (min-width: 768px) {
          .mobile-bottom-nav,
          .mobile-bottom-nav-sheet,
          .mobile-bottom-nav-backdrop {
            display: none !important;
          }
        }
        @keyframes mobileSheetSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .mobile-sheet-animate {
          animation: mobileSheetSlideUp 0.22s cubic-bezier(0.32, 0.72, 0, 1) both;
        }
      `}</style>

      {/* Backdrop */}
      {moreOpen && (
        <div
          className="mobile-bottom-nav-backdrop"
          onClick={() => setMoreOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            zIndex: 49,
          }}
        />
      )}

      {/* More sheet */}
      {moreOpen && (
        <div
          className="mobile-bottom-nav-sheet mobile-sheet-animate"
          style={{
            position: 'fixed',
            bottom: 'calc(60px + env(safe-area-inset-bottom))',
            left: 0,
            right: 0,
            background: 'rgb(var(--surface))',
            borderTop: '1px solid rgb(var(--border))',
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
            zIndex: 50,
            padding: 'var(--space-3) var(--space-3) var(--space-2)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          }}
        >
          {moreLinks.map(({ key, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={key}
                href={href}
                onClick={() => setMoreOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius)',
                  fontSize: '15px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'rgb(var(--brand))' : 'rgb(var(--text))',
                  background: isActive ? 'rgb(var(--brand-light))' : 'transparent',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-1)',
                }}
              >
                {t(key)}
              </Link>
            )
          })}
          {/* Locale switcher */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-2) var(--space-4)',
              marginBottom: 'var(--space-1)',
            }}
          >
            <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>Language</span>
            <LocaleSwitcher />
          </div>

          <div style={{ height: '1px', background: 'rgb(var(--border))', margin: 'var(--space-2) var(--space-4)' }} />
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius)',
              fontSize: '15px',
              fontWeight: 500,
              color: 'rgb(var(--error))',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {tPC('signOut')}
          </button>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav
        className="mobile-bottom-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(60px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'rgb(var(--surface))',
          borderTop: '1px solid rgb(var(--border))',
          alignItems: 'stretch',
          zIndex: 50,
          boxShadow: '0 -1px 0 rgb(var(--border))',
        }}
        aria-label="Main navigation"
      >
        {tabs.map(({ key, href, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={key}
              href={href}
              onClick={() => setMoreOpen(false)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                fontSize: '10px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
                textDecoration: 'none',
                letterSpacing: '0.01em',
              }}
            >
              <Icon active={isActive} />
              {t(key)}
            </Link>
          )
        })}

        {/* More button */}
        <button
          type="button"
          onClick={() => setMoreOpen(v => !v)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            fontSize: '10px',
            fontWeight: isMoreActive || moreOpen ? 600 : 400,
            color: isMoreActive || moreOpen ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.01em',
          }}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          <MoreIcon active={isMoreActive || moreOpen} />
          {/* More — no translation key exists; hardcoded as a UI widget label */}
          More
        </button>
      </nav>
    </>
  )
}
