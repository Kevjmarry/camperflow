import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PageContainer from '@/components/PageContainer'
import OperationsInvoiceReminders from '@/components/staff/operations/OperationsInvoiceReminders'
import OperationsNextUp from '@/components/staff/operations/OperationsNextUp'
import OperationsOnRentNow from '@/components/staff/operations/OperationsOnRentNow'
import { getOpsPickupsToday } from '@/lib/staff/operations/getOpsPickupsToday'
import { getOpsUpcomingPickups } from '@/lib/staff/operations/getOpsUpcomingPickups'
import type { OpsUpcomingPickup } from '@/lib/staff/operations/getOpsUpcomingPickups'
import { getOpsUpcomingReturns, type OpsUpcomingReturn } from '@/lib/staff/operations/getOpsUpcomingReturns'
import { getOpsInvoiceReminders } from '@/lib/staff/operations/getOpsInvoiceReminders'
import { getOpsBlockedVehicles } from '@/lib/staff/operations/getOpsBlockedVehicles'
import { getOpsOnRentNow } from '@/lib/staff/operations/getOpsOnRentNow'
import { getOpsBookingTimeline } from '@/lib/staff/operations/getOpsBookingTimeline'
import OperationsBookingTimeline from '@/components/staff/operations/OperationsBookingTimeline'
import { getOpsWhatsAppTemplates } from '@/lib/staff/operations/getOpsWhatsAppTemplates'
import type { OpsWhatsAppTemplates } from '@/lib/staff/operations/getOpsWhatsAppTemplates'
import OperationsDemoControls from '@/components/staff/operations/OperationsDemoControls'
import { getDemoToday } from '@/lib/helpers/demoDate'

export const dynamic = 'force-dynamic'

const ALPINE_DEMO_COMPANY_ID = 'aa8c5a35-8c06-4dee-8c13-7b3523f549d2'


// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ label, severity, href }: { label: string; severity: 'critical' | 'warning'; href?: string }) {
  const style: React.CSSProperties =
    severity === 'critical'
      ? {
          color: 'rgb(var(--danger))',
          background: 'rgb(var(--danger) / 0.15)',
          border: '1.5px solid rgb(var(--danger))',
        }
      : {
          color: 'rgb(var(--warning))',
          background: 'rgb(var(--warning) / 0.14)',
          border: '1px solid rgb(var(--warning) / 0.28)',
        }
  const inner = (
    <span
      style={{
        display: 'inline-flex',
        fontSize: '11px',
        fontWeight: 500,
        borderRadius: '4px',
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...style,
      }}
    >
      {label}
    </span>
  )
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    )
  }
  return inner
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function OperationsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'staff.operations' })
  const loaders = [
    { name: 'getOpsPickupsToday',      fn: getOpsPickupsToday },
    { name: 'getOpsUpcomingPickups',   fn: getOpsUpcomingPickups },
    { name: 'getOpsUpcomingReturns',   fn: getOpsUpcomingReturns },
    { name: 'getOpsInvoiceReminders',  fn: getOpsInvoiceReminders },
    { name: 'getOpsBlockedVehicles',   fn: getOpsBlockedVehicles },
    { name: 'getOpsOnRentNow',         fn: getOpsOnRentNow },
    { name: 'getOpsBookingTimeline',   fn: getOpsBookingTimeline },
  ] as const
  const [settled, whatsappTemplates] = await Promise.all([
    Promise.allSettled(loaders.map((l) => l.fn())),
    getOpsWhatsAppTemplates().catch((): OpsWhatsAppTemplates => ({ pre_arrival: null, return_prep: null, review_request: null, company_phone: '', map_link: '', google_review_url: null })),
  ])
  // Re-throw if any loader failed so the page still errors visibly
  const firstFailure = settled.find((r) => r.status === 'rejected')
  if (firstFailure) throw (firstFailure as PromiseRejectedResult).reason

  const [
    pickups,
    upcomingPickups,
    upcomingReturnsResult,
    invoiceReminders,
    blockedVehicles,
    onRentNow,
    timelineData,
  ] = settled.map((r) => (r as PromiseFulfilledResult<unknown>).value) as [
    Awaited<ReturnType<typeof getOpsPickupsToday>>,
    Awaited<ReturnType<typeof getOpsUpcomingPickups>>,
    Awaited<ReturnType<typeof getOpsUpcomingReturns>>,
    Awaited<ReturnType<typeof getOpsInvoiceReminders>>,
    Awaited<ReturnType<typeof getOpsBlockedVehicles>>,
    Awaited<ReturnType<typeof getOpsOnRentNow>>,
    Awaited<ReturnType<typeof getOpsBookingTimeline>>,
  ]
  const upcomingReturns: OpsUpcomingReturn[] = upcomingReturnsResult.rows
  const returnsTimezone: string = upcomingReturnsResult.companyTimezone
  const isAlpineDemo = timelineData.companyId === ALPINE_DEMO_COMPANY_ID

  const truncate = (s: string, n = 22) => s.length > n ? s.slice(0, n - 1) + '…' : s

  // Build compact attention strip — deduped by vehicleId+bookingId, capped at 5
  type Chip = { label: string; severity: 'critical' | 'warning'; href?: string }
  type AttentionItem = { key: string; line1: string; vehicleId?: string; chips: Chip[]; severity: 'block' | 'warn' }
  const attentionItems: AttentionItem[] = []
  const seenKeys = new Set<string>()
  // Track vehicle names already covered by a booking-based attention item so
  // the vehicle-based source below doesn't produce duplicates.
  const seenVehicleNames = new Set<string>()
  // blockedVehicles provides the full expanded compliance/issue chip sets;
  // booking loops must defer those chips to avoid single-name collapse.
  const blockedVehicleByName = new Map(blockedVehicles.map(v => [v.name, v]))

  const addItem = (dedupeKey: string, item: Omit<AttentionItem, 'key'>, prefixKey: string) => {
    if (seenKeys.has(dedupeKey)) return
    seenKeys.add(dedupeKey)
    attentionItems.push({ key: prefixKey, ...item })
  }

  // Today's pickups with a blocking risk signal
  for (const p of pickups) {
    if (!p.vehicleBlocked && !p.hasBlockingIssue && !p.hasExpiredCompliance && !p.hasOpenVehicleIssue) continue
    const chips: Chip[] = []
    if (p.vehicleBlocked) chips.push({ label: t('attentionChip.blocked'), severity: 'warning' })
    if (p.hasBlockingIssue) chips.push({
      label: t('attentionChip.checklistIssue'),
      severity: 'critical',
      href: p.checklistInstanceId ? `/${locale}/staff/checklists/${p.checklistInstanceId}?from=booking` : undefined,
    })
    if (p.hasExpiredCompliance && !blockedVehicleByName.has(p.vehicleName)) chips.push({
      label: p.expiredComplianceName ? `${t('attentionChip.expiredPrefix')} ${p.expiredComplianceName}` : t('attentionChip.expiredCompliance'),
      severity: 'critical',
      href: p.vehicleId ? `/${locale}/staff/vehicles/${p.vehicleId}#compliance` : undefined,
    })
    if (p.hasOpenVehicleIssue && !blockedVehicleByName.has(p.vehicleName)) chips.push({
      label: p.openVehicleIssueIsChecklistFlag
        ? (p.openVehicleIssueTitle ? `${t('attentionChip.checklistFlag')} · ${truncate(p.openVehicleIssueTitle, 18)}` : t('attentionChip.checklistFlag'))
        : t('attentionChip.vehicleIssue'),
      severity: 'warning',
      href: p.openVehicleIssueChecklistInstanceId
        ? `/${locale}/staff/checklists/${p.openVehicleIssueChecklistInstanceId}`
        : p.vehicleId ? `/${locale}/staff/vehicles/${p.vehicleId}#issues` : undefined,
    })
    seenVehicleNames.add(p.vehicleName)
    addItem(`booking-${p.id}`, {
      line1: p.vehicleName,
      vehicleId: p.vehicleId ?? undefined,
      chips,
      severity: (p.vehicleBlocked || p.hasBlockingIssue) ? 'block' : 'warn',
    }, `pickup-${p.id}`)
  }

  // Upcoming pickups within 5 calendar days with a blocking risk signal
  const fiveDaysCutoff = getDemoToday(timelineData.companyId)
  fiveDaysCutoff.setDate(fiveDaysCutoff.getDate() + 5)
  fiveDaysCutoff.setHours(23, 59, 59, 999)
  for (const p of upcomingPickups) {
    if (!p.vehicleBlocked && !p.hasUrgentIssue && !p.hasAttentionIssue && !p.hasBlockingIssue && !p.hasExpiredCompliance && !p.hasOpenVehicleIssue) continue
    if (new Date(p.pickupAt) > fiveDaysCutoff) continue
    const chips: Chip[] = []
    if (p.vehicleBlocked) chips.push({ label: t('attentionChip.blocked'), severity: 'warning' })
    if (p.hasUrgentIssue) chips.push({ label: t('attentionChip.urgentIssue'), severity: 'critical' })
    if (p.hasAttentionIssue) chips.push({ label: t('attentionChip.attentionIssue'), severity: 'warning' })
    if (!p.hasUrgentIssue && !p.hasAttentionIssue && p.hasBlockingIssue) chips.push({ label: t('attentionChip.checklistIssue'), severity: 'critical' })
    if (p.hasExpiredCompliance && !blockedVehicleByName.has(p.vehicleName)) chips.push({
      label: p.expiredComplianceName ? `${t('attentionChip.expiredPrefix')} ${p.expiredComplianceName}` : t('attentionChip.expiredCompliance'),
      severity: 'critical',
      href: p.vehicleId ? `/${locale}/staff/vehicles/${p.vehicleId}#compliance` : undefined,
    })
    if (p.hasOpenVehicleIssue && !blockedVehicleByName.has(p.vehicleName)) chips.push({
      label: p.openVehicleIssueIsChecklistFlag
        ? (p.openVehicleIssueTitle ? `${t('attentionChip.checklistFlag')} · ${truncate(p.openVehicleIssueTitle, 18)}` : t('attentionChip.checklistFlag'))
        : t('attentionChip.vehicleIssue'),
      severity: 'warning',
      href: p.openVehicleIssueChecklistInstanceId
        ? `/${locale}/staff/checklists/${p.openVehicleIssueChecklistInstanceId}`
        : p.vehicleId ? `/${locale}/staff/vehicles/${p.vehicleId}#issues` : undefined,
    })
    seenVehicleNames.add(p.vehicleName)
    addItem(`booking-${p.id}`, {
      line1: p.vehicleName,
      vehicleId: p.vehicleId ?? undefined,
      chips,
      severity: (p.vehicleBlocked || p.hasUrgentIssue || p.hasBlockingIssue) ? 'block' : 'warn',
    }, `upcoming-${p.id}`)
  }

  // Vehicle-based attention items: vehicles with blocking signals but no
  // current booking-based entry (e.g. out-of-season fleet with expired compliance).
  for (const v of blockedVehicles) {
    if (!v.hasOperationalHold && !v.hasExpiredCompliance && !v.hasWarningCompliance && !v.hasOpenVehicleIssue) continue
    const complianceHref = `/${locale}/staff/vehicles/${v.id}#compliance`
    const issueHref = v.openVehicleIssueChecklistInstanceId
      ? `/${locale}/staff/checklists/${v.openVehicleIssueChecklistInstanceId}`
      : `/${locale}/staff/vehicles/${v.id}#issues`
    const signalChips: Chip[] = []
    for (const name of v.expiredComplianceNames) {
      signalChips.push({ label: `${t('attentionChip.expiredPrefix')} ${name}`, severity: 'critical', href: complianceHref })
    }
    for (const name of v.warningComplianceNames) {
      signalChips.push({ label: `${t('attentionChip.expiringPrefix')} ${name}`, severity: 'warning', href: complianceHref })
    }
    for (const issue of v.openVehicleIssues) {
      signalChips.push({
        label: issue.isChecklistFlag
          ? (issue.title ? `${t('attentionChip.checklistFlag')} · ${truncate(issue.title, 18)}` : t('attentionChip.checklistFlag'))
          : t('attentionChip.vehicleIssue'),
        severity: issue.blocking ? 'critical' : 'warning',
        href: issueHref,
      })
    }
    if (seenVehicleNames.has(v.name)) {
      // Vehicle already has a booking item — augment it with the full signal chips
      const existing = attentionItems.find(item => item.line1 === v.name)
      if (existing) {
        existing.vehicleId = existing.vehicleId ?? v.id
        if (v.hasOperationalHold) existing.chips.unshift({ label: t('attentionChip.operationalHold'), severity: 'critical', href: `/${locale}/staff/vehicles/${v.id}` })
        existing.chips.push(...signalChips)
        if (v.hasOperationalHold || v.hasExpiredCompliance) existing.severity = 'block'
      }
      continue
    }
    const chips: Chip[] = []
    if (v.hasOperationalHold) chips.push({ label: t('attentionChip.operationalHold'), severity: 'critical', href: `/${locale}/staff/vehicles/${v.id}` })
    chips.push(...signalChips)
    addItem(`vehicle-${v.id}`, {
      line1: v.name,
      vehicleId: v.id,
      chips,
      severity: v.hasOperationalHold || v.hasExpiredCompliance ? 'block' : 'warn',
    }, `vehicle-${v.id}`)
  }

  const urgentItems = attentionItems.slice(0, 5)

  // Build the Next pickup tile feed: today's active pickups first, then upcoming.
  // This ensures pickups that are happening now or are overdue stay visible.
  const todayPickupsAsUpcoming: OpsUpcomingPickup[] = pickups.map((p) => ({
    id: p.id,
    bookingNumber: p.bookingNumber,
    customerName: p.customerName,
    vehicleName: p.vehicleName,
    pickupAt: p.pickupAt,
    returnAt: null,
    nights: null,
    opsFlag: p.opsFlag,
    opsPriority: p.opsPriority,
    daysUntil: 0,
    nextAction: p.nextAction ?? null,
    hoursToPickup: p.hoursToPickup ?? null,
    vehicleBlocked: p.vehicleBlocked ?? false,
    hasBlockingIssue: p.hasBlockingIssue,
    hasAttentionIssue: false,
    hasUrgentIssue: p.hasBlockingIssue,
    hasExpiredCompliance: p.hasExpiredCompliance,
    hasOpenVehicleIssue: p.hasOpenVehicleIssue,
    vehicleStatus: p.vehicleStatus,
    vehicleId: p.vehicleId,
    openVehicleIssueChecklistInstanceId: p.openVehicleIssueChecklistInstanceId,
    guestCount: null,
    hasPets: false,
    hasAirportPickup: false,
    hasExtraDriver: false,
    handoverDone: p.handoverStatus === 'completed',
    prepDone: false,
    expiredComplianceName: p.expiredComplianceName,
    openVehicleIssueTitle: p.openVehicleIssueTitle,
    openVehicleIssueIsChecklistFlag: p.openVehicleIssueIsChecklistFlag,
  }))
  const todayPickupIds = new Set(pickups.map((p) => p.id))
  const overdueUpcoming = upcomingPickups.filter((p) => !todayPickupIds.has(p.id) && p.daysUntil < 0)
  const futureUpcoming = upcomingPickups.filter((p) => !todayPickupIds.has(p.id) && p.daysUntil >= 0)
  const nextPickups = [
    ...overdueUpcoming,
    ...todayPickupsAsUpcoming,
    ...futureUpcoming,
  ].slice(0, 3)

  const demoBanner = isAlpineDemo ? (
    <div
      className="ops-demo-banner"
      style={{
        fontSize: '12px',
        fontWeight: 600,
        color: '#92400e',
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: 'var(--radius)',
        padding: '8px 14px',
        textAlign: 'center',
        letterSpacing: '0.01em',
        marginBottom: 'var(--space-3)',
      }}
    >
      Demo mode · Sample data only — not a real account
    </div>
  ) : undefined

  return (
    <PageContainer
      maxWidth="1400px"
      topBanner={demoBanner}
      rightActions={isAlpineDemo ? <OperationsDemoControls /> : undefined}
    >
      {/*
        On mobile: ops-outer-card is a plain wrapper; ops-inner-card (surface page-surface)
        is the visible card starting at OperationsOnRentNow.
        On desktop (≥768px): ops-outer-card becomes the full card (matching surface + page-surface);
        ops-inner-card resets to transparent/no-border so all sections sit inside one unified card.
      */}
      <style>{`
        @media (min-width: 768px) {
          .ops-outer-card {
            background: rgb(var(--surface));
            border: 1px solid rgb(var(--border));
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow);
            padding: var(--space-8);
          }
          .ops-inner-card {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
        }
        @media (max-width: 767px) {
          .ops-inner-card > div > .surface {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .ops-attention-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .ops-attention-chips {
            justify-content: flex-start !important;
            flex-shrink: 1;
            width: 100%;
          }
        }
      `}</style>
      <div className="ops-outer-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* Header */}
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>{t('pageTitle')}</h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))', margin: '8px 0 0' }}>
              {t('pageSubtitle')}
            </p>
          </div>

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <OperationsBookingTimeline
              vehicles={timelineData.vehicles}
              bookings={timelineData.bookings}
              vehicleBlocks={timelineData.vehicleBlocks}
              companyTimezone={timelineData.companyTimezone}
              today={timelineData.today}
            />

            {/* Mobile: this div IS the card. Desktop: transparent passthrough. */}
            <div className="surface page-surface ops-inner-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <OperationsOnRentNow rows={onRentNow} companyTimezone={timelineData.companyTimezone} />
                <OperationsNextUp
                  pickups={nextPickups}
                  returns={upcomingReturns.slice(0, 3)}
                  companyTimezone={timelineData.companyTimezone}
                  preArrivalReminders={invoiceReminders.filter(r => r.type === 'pre_arrival')}
                  returnPrepReminders={invoiceReminders.filter(r => r.type === 'return_prep')}
                  whatsappTemplates={whatsappTemplates}
                />

                {/* Attention needed strip */}
                {urgentItems.length > 0 && (
                  <div className="ops-section-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgb(var(--danger))' }}>
                        {t('attentionNeeded')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {urgentItems.map((item) => (
                        <div
                          key={item.key}
                          className="ops-attention-row"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px var(--space-3)',
                            background: 'rgb(var(--surface))',
                            border: '1px solid rgb(var(--border))',
                            borderRadius: 'var(--radius)',
                            gap: 'var(--space-4)',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            {item.vehicleId ? (
                              <Link href={`/${locale}/staff/vehicles/${item.vehicleId}`} style={{ fontSize: '13px', fontWeight: 500, color: 'rgb(var(--text))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}>
                                {item.line1}
                              </Link>
                            ) : (
                              <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgb(var(--text))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.line1}
                              </span>
                            )}
                          </div>
                          <div className="ops-attention-chips" style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {item.chips.map((chip, i) => (
                              <StatusChip key={`${chip.label}-${i}`} label={chip.label} severity={chip.severity} href={chip.href} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <OperationsInvoiceReminders reminders={invoiceReminders.filter(r => r.type !== 'pre_arrival' && r.type !== 'return_prep')} whatsappTemplates={whatsappTemplates} />
              </div>
            </div>

          </div>

        </div>
      </div>
    </PageContainer>
  )
}
