'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import PageContainer from '@/components/PageContainer'
import BackLink from '@/components/staff/BackLink'
import { createClient } from '@/lib/supabase/client'

interface BillingInfo {
  subscription_status: string
  subscription_plan: string | null
  included_vehicles: number
  included_staff: number
  max_extra_vehicles: number
  max_extra_staff: number
  purchased_extra_vehicles: number
  purchased_extra_staff: number
  vehicle_count: number
  staff_count: number
  over_limit: boolean
  current_period_end: number | null
  amount: number | null
  currency: string | null
  interval: string | null
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const overLimit = limit > 0 && used > limit
  return (
    <div
      style={{
        height: '6px',
        borderRadius: '3px',
        background: 'rgb(var(--border))',
        overflow: 'hidden',
        marginTop: 'var(--space-2)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: '3px',
          background: overLimit ? 'rgb(var(--error))' : 'rgb(var(--brand))',
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

export default function BillingPage() {
  const { locale } = useParams<{ locale: string }>()
  const router = useRouter()
  const t = useTranslations('staffBilling')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState<BillingInfo | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        router.replace(`/${locale}/staff/login`)
        return
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('role, can_manage')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (!profile || (profile.role !== 'admin' && !profile.can_manage)) {
        router.replace(`/${locale}/staff/operations`)
        return
      }

      const res = await fetch('/api/billing/info')
      if (!res.ok) {
        setError(t('errors.loadFailed'))
        setLoading(false)
        return
      }
      const data: BillingInfo = await res.json()
      setInfo(data)
      setLoading(false)
    }
    init().catch(() => {
      setError(t('errors.loadFailed'))
      setLoading(false)
    })
  }, [locale, router, t])

  const formatDate = (ts: number | null) => {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatPrice = (amount: number | null, currency: string | null) => {
    if (amount === null || !currency) return '—'
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100)
  }

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      active: 'rgb(var(--success))',
      trialing: 'rgb(var(--brand))',
      past_due: 'rgb(var(--warning))',
      cancelled: 'rgb(var(--error))',
    }
    return map[status] ?? 'rgb(var(--muted))'
  }

  const openPortal = () => {
    setPortalLoading(true)
    window.location.href = `/api/billing/portal?returnPath=/${locale}/staff/settings/billing`
  }

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <p style={{ color: 'rgb(var(--muted))', padding: 'var(--space-6) 0' }}>{t('loading')}</p>
      </PageContainer>
    )
  }

  if (error || !info) {
    return (
      <PageContainer maxWidth="1400px">
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgb(var(--error) / 0.1)',
            border: '1px solid rgb(var(--error) / 0.3)',
            borderRadius: 'var(--radius)',
            color: 'rgb(var(--error))',
            fontSize: '14px',
          }}
        >
          {error || t('errors.loadFailed')}
        </div>
      </PageContainer>
    )
  }

  const vehicleLimit = info.included_vehicles + info.purchased_extra_vehicles
  const staffLimit = info.included_staff + info.purchased_extra_staff

  const planName = info.subscription_plan
    ? info.subscription_plan.charAt(0).toUpperCase() + info.subscription_plan.slice(1)
    : null

  const renewalKey = info.subscription_status === 'cancelled' ? 'plan.expiry' : 'plan.renewal'

  return (
    <PageContainer maxWidth="1400px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <BackLink href={`/${locale}/staff/company`}>{t('backToCompany')}</BackLink>
        </div>

        <div className="surface page-surface">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

            {/* Page header */}
            <div>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))', margin: 0 }}>{t('title')}</h1>
            </div>

            {/* ── Over-limit warning ───────────────────────────────────── */}
            {info.over_limit && (
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: 'rgb(var(--error) / 0.08)',
                  border: '1px solid rgb(var(--error) / 0.4)',
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--error))', margin: 0 }}>
                  ⚠ {t('overLimit.title')}
                </p>
                <p style={{ fontSize: '13px', color: 'rgb(var(--text))', margin: 0 }}>
                  {t('overLimit.message')}
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
                  {info.vehicle_count > info.included_vehicles && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--error))' }}>
                      {t('usage.vehicles')}: {t('usage.used', { used: info.vehicle_count, limit: info.included_vehicles })}
                    </span>
                  )}
                  {info.staff_count > info.included_staff && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--error))' }}>
                      {t('usage.staff')}: {t('usage.used', { used: info.staff_count, limit: info.included_staff })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Current Plan ─────────────────────────────────────────── */}
            <section>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-4)' }}>
                {t('sections.currentPlan')}
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 'var(--space-3)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('plan.name')}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: planName ? 'rgb(var(--text))' : 'rgb(var(--muted))' }}>
                    {planName ?? t('plan.unknown')}
                  </span>
                  {!planName && (
                    <span style={{ fontSize: '12px', color: 'rgb(var(--warning))', marginTop: 'var(--space-1)' }}>
                      ⚠ {t('plan.notSyncedWarning')}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('plan.status')}
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: statusColor(info.subscription_status),
                    }}
                  >
                    {t(`status.${info.subscription_status}` as Parameters<typeof t>[0])}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('plan.price')}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                    {formatPrice(info.amount, info.currency)}
                    {info.interval && (
                      <span style={{ fontSize: '13px', fontWeight: 400, color: 'rgb(var(--muted))' }}>
                        {' '}/{' '}{t(`plan.per_${info.interval}` as Parameters<typeof t>[0])}
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t(renewalKey as Parameters<typeof t>[0])}
                  </span>
                  <span style={{ fontSize: '14px', color: 'rgb(var(--text))' }}>
                    {formatDate(info.current_period_end)}
                  </span>
                </div>
              </div>
            </section>

            {/* ── Usage ────────────────────────────────────────────────── */}
            <section>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-4)' }}>
                {t('sections.usageLimits')}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

                {/* Vehicles */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                      {t('usage.vehicles')}
                    </span>
                    <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                      {vehicleLimit > 0
                        ? t('usage.used', { used: info.vehicle_count, limit: vehicleLimit })
                        : `${info.vehicle_count}`}
                    </span>
                  </div>
                  {vehicleLimit > 0 && (
                    <UsageBar used={info.vehicle_count} limit={vehicleLimit} />
                  )}
                  {info.max_extra_vehicles > 0 && (
                    <p style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: 'var(--space-1)' }}>
                      {t('usage.extraPurchased', { purchased: info.purchased_extra_vehicles, max: info.max_extra_vehicles })}
                    </p>
                  )}
                </div>

                {/* Staff */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                      {t('usage.staff')}
                    </span>
                    <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                      {staffLimit > 0
                        ? t('usage.used', { used: info.staff_count, limit: staffLimit })
                        : `${info.staff_count}`}
                    </span>
                  </div>
                  {staffLimit > 0 && (
                    <UsageBar used={info.staff_count} limit={staffLimit} />
                  )}
                  {info.max_extra_staff > 0 && (
                    <p style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: 'var(--space-1)' }}>
                      {t('usage.extraPurchased', { purchased: info.purchased_extra_staff, max: info.max_extra_staff })}
                    </p>
                  )}
                </div>

              </div>
            </section>

            {/* ── Billing Actions ──────────────────────────────────────── */}
            <section>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-4)' }}>
                {t('sections.billingActions')}
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={portalLoading}
                  onClick={openPortal}
                  style={{ opacity: portalLoading ? 0.6 : 1, cursor: portalLoading ? 'not-allowed' : 'pointer' }}
                >
                  {portalLoading ? t('actions.opening') : t('actions.manageBilling')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={portalLoading}
                  onClick={openPortal}
                  style={{ opacity: portalLoading ? 0.6 : 1, cursor: portalLoading ? 'not-allowed' : 'pointer' }}
                >
                  {t('actions.upgradePlan')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                >
                  {t('actions.addVehicleSlot')} — {t('actions.comingSoon')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                >
                  {t('actions.addStaffSlot')} — {t('actions.comingSoon')}
                </button>
              </div>
            </section>

            {/* ── Billing History ──────────────────────────────────────── */}
            <section>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-4)' }}>
                {t('sections.billingHistory')}
              </h2>
              <div
                style={{
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  padding: 'var(--space-8)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                }}
              >
                <p style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))', margin: 0 }}>
                  {t('history.emptyTitle')}
                </p>
                <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0 }}>
                  {t('history.emptyDescription')}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={portalLoading}
                  onClick={openPortal}
                  style={{ fontSize: '14px' }}
                >
                  {t('history.openPortal')}
                </button>
              </div>
            </section>

          </div>
        </div>
      </div>
    </PageContainer>
  )
}
