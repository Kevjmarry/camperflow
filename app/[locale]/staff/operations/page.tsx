import PageContainer from '@/components/PageContainer'
import OperationsInvoiceReminders from '@/components/staff/operations/OperationsInvoiceReminders'
import OperationsUpcomingPickups from '@/components/staff/operations/OperationsUpcomingPickups'
import OperationsUpcomingReturns from '@/components/staff/operations/OperationsUpcomingReturns'
import OperationsNextUp from '@/components/staff/operations/OperationsNextUp'
import OperationsCompletedBookings from '@/components/staff/operations/OperationsCompletedBookings'
import { getOpsPickupsToday } from '@/lib/staff/operations/getOpsPickupsToday'
import { getOpsUpcomingPickups } from '@/lib/staff/operations/getOpsUpcomingPickups'
import { getOpsUpcomingReturns } from '@/lib/staff/operations/getOpsUpcomingReturns'
import { getOpsInvoiceReminders } from '@/lib/staff/operations/getOpsInvoiceReminders'
import { getOpsCompletedBookings } from '@/lib/staff/operations/getOpsCompletedBookings'

export const dynamic = 'force-dynamic'

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ label, severity }: { label: string; severity: 'critical' | 'warning' }) {
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
  return (
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
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function OperationsPage() {
  const [
    pickups,
    upcomingPickups,
    upcomingReturns,
    invoiceReminders,
    completed,
  ] = await Promise.all([
    getOpsPickupsToday(),
    getOpsUpcomingPickups(),
    getOpsUpcomingReturns(),
    getOpsInvoiceReminders(),
    getOpsCompletedBookings(),
  ])

  // Build compact attention strip — deduped by vehicleId+bookingId, capped at 5
  type Chip = { label: string; severity: 'critical' | 'warning' }
  type AttentionItem = { key: string; line1: string; subtext?: string; chips: Chip[]; severity: 'block' | 'warn' }
  const attentionItems: AttentionItem[] = []
  const seenKeys = new Set<string>()

  const addItem = (dedupeKey: string, item: Omit<AttentionItem, 'key'>, prefixKey: string) => {
    if (seenKeys.has(dedupeKey)) return
    seenKeys.add(dedupeKey)
    attentionItems.push({ key: prefixKey, ...item })
  }

  // Today's pickups with a blocking risk signal
  for (const p of pickups) {
    if (!p.vehicleBlocked && !p.hasBlockingIssue && !p.hasExpiredCompliance && !p.hasOpenVehicleIssue) continue
    const chips: Chip[] = []
    if (p.vehicleBlocked) chips.push({ label: 'Blocked', severity: 'warning' })
    if (p.hasBlockingIssue) chips.push({ label: 'Checklist issue', severity: 'critical' })
    if (p.hasExpiredCompliance) chips.push({ label: 'Expired compliance', severity: 'critical' })
    if (p.hasOpenVehicleIssue) chips.push({ label: 'Vehicle issue', severity: 'warning' })
    const ctx = [p.bookingNumber, p.customerName].filter(Boolean).join(' · ')
    addItem(`booking-${p.id}`, {
      line1: p.vehicleName,
      subtext: ctx || undefined,
      chips,
      severity: (p.vehicleBlocked || p.hasBlockingIssue) ? 'block' : 'warn',
    }, `pickup-${p.id}`)
  }

  // Upcoming pickups within 5 calendar days with a blocking risk signal
  const fiveDaysCutoff = new Date()
  fiveDaysCutoff.setDate(fiveDaysCutoff.getDate() + 5)
  fiveDaysCutoff.setHours(23, 59, 59, 999)
  for (const p of upcomingPickups) {
    const passesGuard = !!(p.vehicleBlocked || p.hasUrgentIssue || p.hasAttentionIssue || p.hasBlockingIssue || p.hasExpiredCompliance || p.hasOpenVehicleIssue)
    console.log('[attention-debug] upcoming pickup', { id: p.id, vehicle: p.vehicleName, hasUrgentIssue: p.hasUrgentIssue, hasAttentionIssue: p.hasAttentionIssue, hasBlockingIssue: p.hasBlockingIssue, passesGuard })
    if (!p.vehicleBlocked && !p.hasUrgentIssue && !p.hasAttentionIssue && !p.hasBlockingIssue && !p.hasExpiredCompliance && !p.hasOpenVehicleIssue) continue
    if (new Date(p.pickupAt) > fiveDaysCutoff) continue
    const chips: Chip[] = []
    if (p.vehicleBlocked) chips.push({ label: 'Blocked', severity: 'warning' })
    if (p.hasUrgentIssue) chips.push({ label: 'Urgent issue', severity: 'critical' })
    if (p.hasAttentionIssue) chips.push({ label: 'Attention issue', severity: 'warning' })
    if (!p.hasUrgentIssue && !p.hasAttentionIssue && p.hasBlockingIssue) chips.push({ label: 'Checklist issue', severity: 'critical' })
    if (p.hasExpiredCompliance) chips.push({ label: 'Expired compliance', severity: 'critical' })
    if (p.hasOpenVehicleIssue) chips.push({ label: 'Vehicle issue', severity: 'warning' })
    const ctx = [p.bookingNumber, p.customerName].filter(Boolean).join(' · ')
    addItem(`booking-${p.id}`, {
      line1: p.vehicleName,
      subtext: ctx || undefined,
      chips,
      severity: (p.vehicleBlocked || p.hasUrgentIssue || p.hasBlockingIssue) ? 'block' : 'warn',
    }, `upcoming-${p.id}`)
  }

  console.log('[attention-debug] attentionItems count', attentionItems.length)
  console.log('[attention-debug] attentionItems', attentionItems.map((i) => ({ line1: i.line1, chips: i.chips.map((c) => c.label) })))
  const urgentItems = attentionItems.slice(0, 5)

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

          {/* Header */}
          <div>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>Operations</h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              Today's pickups, returns, and vehicle readiness at a glance.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <OperationsNextUp
              nextPickup={upcomingPickups[0] ?? null}
              nextReturn={upcomingReturns[0] ?? null}
            />

            {/* Attention needed strip */}
            {urgentItems.length > 0 && (
              <div
                style={{
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  padding: 'var(--space-4) var(--space-5)',
                  background: 'rgb(var(--surface))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgb(var(--danger))' }}>
                    Attention needed
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {urgentItems.map((item) => (
                    <div
                      key={item.key}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgb(var(--text))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.line1}
                          </span>
                          {item.subtext && (
                            <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>
                              {item.subtext}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {item.chips.map((chip) => (
                          <StatusChip key={chip.label} label={chip.label} severity={chip.severity} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <OperationsInvoiceReminders reminders={invoiceReminders} />
            <OperationsUpcomingPickups pickups={upcomingPickups} />
            <OperationsUpcomingReturns returns={upcomingReturns} />
            <OperationsCompletedBookings bookings={completed} />
          </div>

        </div>
      </div>
    </PageContainer>
  )
}
