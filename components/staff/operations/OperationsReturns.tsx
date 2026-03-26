'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { OpsReturn } from '@/lib/staff/operations/getOpsReturnsToday'

interface Props {
  returns: OpsReturn[]
  quiet?: boolean
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatHoursToPickup(hours: number | null | undefined): string {
  if (hours == null) return ''
  if (hours <= 24) return 'Today'
  if (hours <= 48) return 'Tomorrow'
  return `${Math.round(hours / 24)} days`
}

const nextActionLabels: Record<string, string> = {
  prepare_for_pickup: 'Preparing',
  start_handover: 'Start handover',
  await_return: 'Await return',
  start_return: 'Start return',
}

function formatNextAction(action: string | null | undefined): string {
  if (!action) return ''
  return nextActionLabels[action] ?? action
}

function getUrgencyStyle(returnAt: string): React.CSSProperties {
  const minutesUntilReturn = (new Date(returnAt).getTime() - Date.now()) / 60000
  if (minutesUntilReturn <= 0) {
    return {
      border: '1px solid rgb(var(--danger))',
      background: 'rgb(var(--danger-light))',
    }
  }
  if (minutesUntilReturn <= 60) {
    return {
      border: '1px solid rgb(var(--warning))',
      background: 'rgb(var(--warning-light))',
    }
  }
  return {
    border: '1px solid rgb(var(--border))',
  }
}

export default function OperationsReturns({ returns, quiet }: Props) {
  const { locale } = useParams<{ locale: string }>()

  // On quiet days with nothing scheduled, render a lightweight status line
  if (quiet && returns.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          border: '1px dashed rgb(var(--border))',
          borderRadius: 'var(--radius)',
          opacity: 0.55,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))' }}>
          Returns today
        </span>
        <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>—</span>
        <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>None scheduled</span>
      </div>
    )
  }

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        Returns today
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
          {returns.length}
        </span>
      </h2>

      {returns.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>No returns scheduled for today.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {returns.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius)',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
                ...getUrgencyStyle(r.returnAt),
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {r.vehicleName}
                </span>
                <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                  {r.customerName} · {r.bookingNumber}
                </span>
                {r.nextAction && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{formatNextAction(r.nextAction)}</span>
                )}
                {r.vehicleBlocked && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocked vehicle</span>
                )}
                {r.hasBlockingIssue && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Blocking checklist issue</span>
                )}
                {r.hasExpiredCompliance && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Expired compliance</span>
                )}
                {r.hasOpenVehicleIssue && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--danger))', fontWeight: 500 }}>Open vehicle issue</span>
                )}
                {r.returnItemsTotal != null && r.returnItemsTotal > 0 && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    Return: {r.returnItemsDone ?? 0} / {r.returnItemsTotal}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                {r.hoursToPickup != null && (
                  <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {formatHoursToPickup(r.hoursToPickup)}
                  </span>
                )}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--brand))' }}>
                  {formatTime(r.returnAt)}
                </span>
                <Link
                  href={`/${locale}/staff/bookings/${r.id}`}
                  style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
