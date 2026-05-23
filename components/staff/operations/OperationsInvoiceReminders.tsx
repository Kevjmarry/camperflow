'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsInvoiceReminder } from '@/lib/staff/operations/getOpsInvoiceReminders'
import type { OpsWhatsAppTemplates } from '@/lib/staff/operations/getOpsWhatsAppTemplates'
import { replaceTemplatePlaceholders } from '@/lib/whatsapp/replaceTemplatePlaceholders'

interface Props {
  reminders: OpsInvoiceReminder[]
  whatsappTemplates: OpsWhatsAppTemplates
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function OperationsInvoiceReminders({ reminders, whatsappTemplates }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations.reminders')
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState<OpsInvoiceReminder[]>(reminders)
  const [handling, setHandling] = useState<Set<string>>(new Set())
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set())

  useEffect(() => { setMounted(true) }, [])

  const markHandled = async (r: OpsInvoiceReminder) => {
    setHandling((prev) => new Set(prev).add(r.id))
    try {
      const res = await fetch(`/api/staff/bookings/${r.bookingId}/mark-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: r.type }),
      })
      if (res.ok) {
        setVisible((prev) => prev.filter((x) => x.id !== r.id))
      }
    } finally {
      setHandling((prev) => {
        const next = new Set(prev)
        next.delete(r.id)
        return next
      })
    }
  }

  const copyMessage = async (id: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedIds((prev) => new Set(prev).add(id))
      setTimeout(() => {
        setCopiedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 2000)
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  const FALLBACK_TEMPLATES = {
    pre_arrival:    'Hello again, just a reminder that your {vehicle_name} pickup is tomorrow. We look forward to seeing you!',
    return_prep:    'Hello again, just a reminder that your {vehicle_name} return is due tomorrow. Safe travels!',
    review_request: 'Hello again, thank you for renting the {vehicle_name}! We hope you enjoyed your trip. We\'d love if you could share your experience with a quick review.',
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.camperflow.io'

  const buildMessage = (r: OpsInvoiceReminder): string | null => {
    if (r.type !== 'pre_arrival' && r.type !== 'return_prep' && r.type !== 'review_request') return null
    const template =
      r.type === 'pre_arrival'
        ? (whatsappTemplates.pre_arrival ?? FALLBACK_TEMPLATES.pre_arrival)
        : r.type === 'review_request'
          ? (whatsappTemplates.review_request ?? FALLBACK_TEMPLATES.review_request)
          : (whatsappTemplates.return_prep ?? FALLBACK_TEMPLATES.return_prep)
    return replaceTemplatePlaceholders(template, {
      customer_name: r.customerName,
      vehicle_name: r.vehicleName,
      pickup_date: r.pickupAt ? formatDate(r.pickupAt, locale) : '',
      return_date: r.returnAt ? formatDate(r.returnAt, locale) : '',
      guest_link: r.type === 'review_request'
        ? `${appUrl}/${locale}/guest/feedback?code=${r.bookingNumber}&token=${r.guestAccessToken}`
        : `${appUrl}/${locale}/guest?code=${r.bookingNumber}&token=${r.guestAccessToken}`,
      booking_code: r.bookingNumber,
      company_phone: whatsappTemplates.company_phone,
      map_link: whatsappTemplates.map_link,
    })
  }

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <style>{`
        /* ── Mobile card layout (<768px) ── */
        @media (max-width: 767px) {
          .ops-reminder-row {
            align-items: flex-start !important;
          }
          .ops-reminder-mid {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 3px !important;
          }
          /* Hide the standalone end-of-row timing on mobile */
          .ops-reminder-timing-desktop {
            display: none !important;
          }
          /* Show timing inlined inside the stacked middle block on mobile */
          .ops-reminder-timing-mobile {
            display: inline !important;
          }
          .ops-reminder-view {
            align-self: flex-start;
            margin-top: 1px;
          }
        }
        @media (min-width: 768px) {
          .ops-reminder-timing-mobile {
            display: none;
          }
        }
        .ops-reminder-row-link {
          display: flex;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
        }
        .ops-reminder-row-link:hover {
          background: rgb(var(--brand) / 0.04);
        }
      `}</style>

      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        {t('title')}
        <span
          style={{
            marginLeft: 'var(--space-3)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'rgb(var(--muted))',
            background: 'rgb(var(--brand-light))',
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          {visible.length}
        </span>
      </h2>

      {visible.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('empty')}</p>
      ) : (
        <div style={{ border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {visible.map((r, idx) => {
            const isLoading = handling.has(r.id)
            const isCheckable = r.type !== 'review_imported'
            const bookingHref = `/${locale}/staff/bookings/${r.bookingId}${mounted ? '#reminders' : ''}`
            const generatedMessage = buildMessage(r)
            const isCopied = copiedIds.has(r.id)

            const timingLabel =
              r.type === 'return_prep'
                ? (r.daysUntilReturn! <= 0 ? t('timing.returnToday')
                  : r.daysUntilReturn === 1 ? t('timing.returnTomorrow')
                  : t('timing.returnInDays', { count: r.daysUntilReturn }))
              : r.type === 'pre_arrival'
                ? (r.daysUntilPickup <= 0 ? t('timing.pickupToday')
                  : r.daysUntilPickup === 1 ? t('timing.pickupTomorrow')
                  : t('timing.pickupInDays', { count: r.daysUntilPickup }))
              : r.type === 'review_request'
                ? (r.returnIsToday ? t('timing.returnToday')
                  : r.daysUntilReturn === -1 ? t('timing.returnYesterday')
                  : t('timing.returnDaysAgo', { count: Math.abs(r.daysUntilReturn ?? 1) }))
              : r.daysUntilPickup <= 0 ? t('timing.pickupToday')
              : r.daysUntilPickup === 1 ? t('timing.pickupTomorrow')
              : t('timing.pickupInDays', { count: r.daysUntilPickup })

            const mainRowContent = (
              <>
                <input
                  type="checkbox"
                  disabled={!isCheckable || isLoading}
                  onChange={isCheckable ? () => markHandled(r) : undefined}
                  style={{
                    cursor: isCheckable && !isLoading ? 'pointer' : 'default',
                    flexShrink: 0,
                    visibility: isCheckable ? 'visible' : 'hidden',
                    pointerEvents: isCheckable ? 'auto' : 'none',
                  }}
                  aria-hidden={!isCheckable}
                  aria-label={
                    r.type === 'balance_invoice'
                      ? 'Final payment received'
                      : `Mark ${r.bookingNumber} handled`
                  }
                />
                <div
                  className="ops-reminder-mid"
                  style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgb(var(--brand))', flexShrink: 0 }}>
                    {t(`type.${r.type}`)}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {r.vehicleName}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {r.customerName} · {r.bookingNumber}
                  </span>
                  {generatedMessage && (
                    <button
                      type="button"
                      onClick={() => copyMessage(r.id, generatedMessage)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 500,
                        borderRadius: 'var(--radius)',
                        border: '1px solid rgb(var(--border))',
                        background: isCopied ? 'rgb(var(--success) / 0.12)' : 'none',
                        color: isCopied ? 'rgb(var(--success))' : 'rgb(var(--muted))',
                        cursor: 'pointer',
                        transition: 'color 0.15s, background 0.15s',
                        flexShrink: 0,
                        lineHeight: '1.4',
                      }}
                    >
                      {isCopied ? t('copied') : t('copyWhatsApp')}
                    </button>
                  )}
                  {r.type === 'review_request' && !whatsappTemplates.google_review_url && (
                    <span style={{ fontSize: '11px', color: 'rgb(var(--warning, 161 98 7))', flexShrink: 0 }}>
                      {t('noReviewLink')}
                    </span>
                  )}
                  {/* Timing shown here only on mobile */}
                  <span className="ops-reminder-timing-mobile" style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {timingLabel}
                  </span>
                </div>
                {/* Timing shown here only on desktop */}
                <span className="ops-reminder-timing-desktop" style={{ fontSize: '12px', color: 'rgb(var(--muted))', flexShrink: 0 }}>
                  {timingLabel}
                </span>
                {isCheckable && (
                  <Link
                    href={bookingHref}
                    className="ops-reminder-view"
                    style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none', flexShrink: 0 }}
                  >
                    {t('view')}
                  </Link>
                )}
              </>
            )

            const rowStyle: React.CSSProperties = {
              padding: 'var(--space-3) var(--space-4)',
              borderTop: idx > 0 ? '1px solid rgb(var(--border))' : undefined,
              opacity: isLoading ? 0.5 : 1,
              transition: 'opacity 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }

            return isCheckable ? (
              <div key={r.id} className="ops-reminder-row" style={rowStyle}>
                {mainRowContent}
              </div>
            ) : (
              <Link
                key={r.id}
                href={bookingHref}
                className="ops-reminder-row ops-reminder-row-link"
                style={rowStyle}
              >
                {mainRowContent}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
