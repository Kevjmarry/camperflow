import PageContainer from '@/components/PageContainer'
import OperationsSummary from '@/components/staff/operations/OperationsSummary'
import OperationsPickups from '@/components/staff/operations/OperationsPickups'
import OperationsReturns from '@/components/staff/operations/OperationsReturns'
import OperationsInvoiceReminders from '@/components/staff/operations/OperationsInvoiceReminders'
import OperationsVehiclesPreparing from '@/components/staff/operations/OperationsVehiclesPreparing'
import OperationsUpcomingPickups from '@/components/staff/operations/OperationsUpcomingPickups'
import { getOpsSummary } from '@/lib/staff/operations/getOpsSummary'
import { getOpsPickupsToday } from '@/lib/staff/operations/getOpsPickupsToday'
import { getOpsReturnsToday } from '@/lib/staff/operations/getOpsReturnsToday'
import { getOpsVehiclesPreparing } from '@/lib/staff/operations/getOpsVehiclesPreparing'
import { getOpsUpcomingPickups } from '@/lib/staff/operations/getOpsUpcomingPickups'
import { getOpsInvoiceReminders } from '@/lib/staff/operations/getOpsInvoiceReminders'

export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  const [summary, pickups, returns, vehicles, upcoming, invoiceReminders] = await Promise.all([
    getOpsSummary(),
    getOpsPickupsToday(),
    getOpsReturnsToday(),
    getOpsVehiclesPreparing(),
    getOpsUpcomingPickups(),
    getOpsInvoiceReminders(),
  ])

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
            <OperationsPickups pickups={pickups} />
            <OperationsReturns returns={returns} />
            <OperationsInvoiceReminders reminders={invoiceReminders} />
            <OperationsVehiclesPreparing vehicles={vehicles} />
            <OperationsUpcomingPickups pickups={upcoming} />
          </div>

        </div>
      </div>
    </PageContainer>
  )
}
