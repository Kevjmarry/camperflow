'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRef, useEffect, useState } from 'react'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { useTheme } from '@/contexts/ThemeContext'

export default function StaffNav() {
  const { locale } = useParams<{ locale: string }>()
  const pathname = usePathname()
  const t = useTranslations('staff.nav')
  const { company } = useTheme()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  const coreAccess = company?.core_operations_access ?? true
  const reviewFunnelAccess = company?.review_funnel_access ?? true

  const links = [
    ...(coreAccess ? [
      { key: 'operations',  href: `/${locale}/staff/operations` },
      { key: 'bookings',    href: `/${locale}/staff/bookings` },
      { key: 'vehicles',    href: `/${locale}/staff/vehicles` },
      { key: 'checklists',  href: `/${locale}/staff/checklists` },
      { key: 'guestContent', href: `/${locale}/staff/guest-content` },
      { key: 'team',        href: `/${locale}/staff/team` },
      { key: 'customers',   href: `/${locale}/staff/customers` },
      { key: 'billing',     href: `/${locale}/staff/settings/billing` },
    ] : []),
    ...(reviewFunnelAccess ? [
      { key: 'addons', href: `/${locale}/staff/addons` },
    ] : []),
    ...(coreAccess ? [
      { key: 'company',     href: `/${locale}/staff/company` },
    ] : []),
  ]

  function updateFades() {
    const el = scrollRef.current
    if (!el) return
    setShowLeft(el.scrollLeft > 4)
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateFades()
    el.addEventListener('scroll', updateFades, { passive: true })
    const ro = new ResizeObserver(updateFades)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateFades)
      ro.disconnect()
    }
  }, [])

  // Scroll active tab into view on mount / route change
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('[data-active="true"]')
    if (active) {
      active.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    }
    updateFades()
  }, [pathname])

  if (pathname.endsWith('/staff/login')) return null

  return (
    <nav
      className="staff-top-nav"
      style={{
        width: '100%',
        background: 'rgb(var(--surface))',
        borderBottom: '1px solid rgb(var(--border))',
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      <style>{`
        .staff-nav-inner::-webkit-scrollbar { display: none; }
        .staff-nav-inner { -ms-overflow-style: none; scrollbar-width: none; }
        .staff-nav-fade {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 40px;
          pointer-events: none;
          z-index: 1;
          transition: opacity 0.15s;
        }
        .staff-nav-fade-left {
          left: 0;
          background: linear-gradient(to right, rgb(var(--surface)), transparent);
        }
        .staff-nav-fade-right {
          right: 0;
          background: linear-gradient(to left, rgb(var(--surface)), transparent);
        }
        .staff-nav-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          color: rgb(var(--muted));
          pointer-events: none;
          transition: opacity 0.15s;
        }
        .staff-nav-arrow-left { left: 2px; }
        .staff-nav-arrow-right { right: 2px; }
        @media (max-width: 767px) {
          .staff-top-nav { display: none !important; }
        }
        @media (min-width: 768px) {
          .staff-nav-fade, .staff-nav-arrow { display: none !important; }
        }
        .staff-nav-link {
          transition: color 0.15s, background 0.15s;
          border-radius: var(--radius-sm) var(--radius-sm) 0 0;
        }
        .staff-nav-link:not([data-active="true"]):hover {
          color: rgb(var(--text-secondary)) !important;
          background: rgb(var(--brand) / 0.06);
        }
        .staff-nav-link[data-active="true"]:hover {
          background: rgb(var(--brand) / 0.07);
        }
      `}</style>

      {/* Scrollable links + fade indicators */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        {/* Left fade + chevron */}
        <div
          className="staff-nav-fade staff-nav-fade-left"
          style={{ opacity: showLeft ? 1 : 0 }}
        />
        <div
          className="staff-nav-arrow staff-nav-arrow-left"
          style={{ opacity: showLeft ? 1 : 0 }}
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Right fade + chevron */}
        <div
          className="staff-nav-fade staff-nav-fade-right"
          style={{ opacity: showRight ? 1 : 0 }}
        />
        <div
          className="staff-nav-arrow staff-nav-arrow-right"
          style={{ opacity: showRight ? 1 : 0 }}
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div
          ref={scrollRef}
          className="staff-nav-inner"
          style={{
            height: '100%',
            padding: '0 var(--space-4)',
            display: 'flex',
            alignItems: 'stretch',
            overflowX: 'auto',
          }}
        >
          {links.map(({ key, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={key}
                href={href}
                data-active={isActive ? 'true' : undefined}
                className="staff-nav-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-4)',
                  minHeight: '44px',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
                  textDecoration: 'none',
                  borderBottom: isActive
                    ? '2px solid rgb(var(--brand))'
                    : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {t(key)}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Company identity — pinned right, desktop only */}
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

      {/* Locale switcher — pinned right, desktop only */}
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
