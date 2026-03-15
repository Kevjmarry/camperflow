import PageContainer from '@/components/PageContainer'
import OperationsSummary from '@/components/staff/operations/OperationsSummary'
import OperationsPickups from '@/components/staff/operations/OperationsPickups'
import OperationsReturns from '@/components/staff/operations/OperationsReturns'
import OperationsInvoiceReminders from '@/components/staff/operations/OperationsInvoiceReminders'
import OperationsVehiclesPreparing from '@/components/staff/operations/OperationsVehiclesPreparing'
import OperationsVehicleBlocks from '@/components/staff/operations/OperationsVehicleBlocks'
import OperationsUpcomingPickups from '@/components/staff/operations/OperationsUpcomingPickups'
import OperationsUpcomingReturns from '@/components/staff/operations/OperationsUpcomingReturns'
import OperationsNextUp from '@/components/staff/operations/OperationsNextUp'
import OperationsCompletedBookings from '@/components/staff/operations/OperationsCompletedBookings'
import { getOpsSummary } from '@/lib/staff/operations/getOpsSummary'
import { getOpsPickupsToday } from '@/lib/staff/operations/getOpsPickupsToday'
import { getOpsReturnsToday } from '@/lib/staff/operations/getOpsReturnsToday'
import { getOpsVehiclesPreparing } from '@/lib/staff/operations/getOpsVehiclesPreparing'
import { getOpsVehicleBlocks } from '@/lib/staff/operations/getOpsVehicleBlocks'
import { getOpsUpcomingPickups } from '@/lib/staff/operations/getOpsUpcomingPickups'
import { getOpsUpcomingReturns } from '@/lib/staff/operations/getOpsUpcomingReturns'
import { getOpsInvoiceReminders } from '@/lib/staff/operations/getOpsInvoiceReminders'
import { getOpsCompletedBookings } from '@/lib/staff/operations/getOpsCompletedBookings'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  const [
    summary, pickups, returns, vehicles, vehicleBlocks,
    upcoming, upcomingReturns, invoiceReminders, completed, t,
  ] = await Promise.all([
    getOpsSummary(),
    getOpsPickupsToday(),
    getOpsReturnsToday(),
    getOpsVehiclesPreparing(),
    getOpsVehicleBlocks(),
    getOpsUpcomingPickups(),
    getOpsUpcomingReturns(),
    getOpsInvoiceReminders(),
    getOpsCompletedBookings(),
    getTranslations('staff.operations'),
  ])

  const quietToday =
    pickups.length === 0 && returns.length === 0 && invoiceReminders.length === 0

  const hasUpcoming = upcoming.length > 0 || upcomingReturns.length > 0

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
            {summary && <OperationsSummary data={summary} />}

            {/* Quiet-day: banner + next-up highlight cards, above today sections */}
            {quietToday && hasUpcoming && (
              <>
                <div
                  style={{
                    padding: 'var(--space-4) var(--space-5)',
                    background: 'rgb(var(--brand-light))',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 'var(--radius)',
                    fontSize: '14px',
                    color: 'rgb(var(--text))',
                  }}
                >
                  <strong>{t('quietDay.title')}</strong>
                  <span style={{ color: 'rgb(var(--muted))', marginLeft: 'var(--space-2)' }}>
                    {t('quietDay.subtitle')}
                  </span>
                </div>

                <OperationsNextUp
                  nextPickup={upcoming[0] ?? null}
                  nextReturn={upcomingReturns[0] ?? null}
                />
              </>
            )}

            {/* Today sections — dimmed to status lines when quiet and empty */}
            <OperationsPickups pickups={pickups} quiet={quietToday} />
            <OperationsReturns returns={returns} quiet={quietToday} />
            <OperationsInvoiceReminders reminders={invoiceReminders} />
            <OperationsVehiclesPreparing vehicles={vehicles} />

            {/* Upcoming vehicle blocks (from external platform imports) */}
            <OperationsVehicleBlocks blocks={vehicleBlocks} />

            {/* Upcoming lists — capped at 5 with expand/collapse */}
            <OperationsUpcomingPickups pickups={upcoming} />
            <OperationsUpcomingReturns returns={upcomingReturns} />

            {/* Recently completed */}
            <OperationsCompletedBookings bookings={completed} />
          </div>

        </div>
      </div>
    </PageContainer>
  )
}
