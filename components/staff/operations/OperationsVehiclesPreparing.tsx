'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpsVehiclePreparing } from '@/lib/staff/operations/getOpsVehiclesPreparing'

interface Props {
  vehicles: OpsVehiclePreparing[]
}

function formatDateTime(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusChip({ label, severity }: { label: string; severity: 'critical' | 'warning' }) {
  const style: React.CSSProperties =
    severity === 'critical'
      ? {
          color: 'rgb(var(--danger))',
          background: 'rgb(var(--danger) / 0.14)',
          border: '1px solid rgb(var(--danger) / 0.28)',
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

export default function OperationsVehiclesPreparing({ vehicles }: Props) {
  const { locale } = useParams<{ locale: string }>()
  const t = useTranslations('staff.operations')

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        {t('vehiclesPreparing.title')}
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
          {vehicles.length}
        </span>
      </h2>

      {vehicles.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{t('vehiclesPreparing.none')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {vehicles.map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3)',
                border: '1px solid rgb(var(--border))',
                borderRadius: 'var(--radius)',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {v.name}
                </span>
                <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                  {v.plate} · {v.bookingNumber}
                </span>
                {(v.vehicleBlocked || v.hasOpenVehicleIssue || v.hasExpiredCompliance) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                    {v.hasExpiredCompliance && <StatusChip label={t('status.expiredCompliance')} severity="critical" />}
                    {v.vehicleBlocked && <StatusChip label={t('status.blockedVehicle')} severity="warning" />}
                    {v.hasOpenVehicleIssue && <StatusChip label={t('status.openVehicleIssue')} severity="warning" />}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                  {t('vehiclesPreparing.pickup')} {formatDateTime(v.pickupAt, locale)}
                </span>
                <Link
                  href={`/${locale}/staff/vehicles/${v.id}`}
                  style={{ fontSize: '13px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                >
                  {t('vehiclesPreparing.view')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
