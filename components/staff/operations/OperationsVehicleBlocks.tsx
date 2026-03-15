'use client'

import { useTranslations } from 'next-intl'
import type { OpsVehicleBlock } from '@/lib/staff/operations/getOpsVehicleBlocks'

interface Props {
  blocks: OpsVehicleBlock[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function OperationsVehicleBlocks({ blocks }: Props) {
  const t = useTranslations('staff.operations.vehicleBlocks')

  if (blocks.length === 0) return null

  return (
    <div className="surface" style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: '18px', margin: '0 0 var(--space-4) 0', color: 'rgb(var(--text))' }}>
        {t('title')}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {blocks.map((block) => (
          <div
            key={block.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--space-3)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: 'var(--radius)',
              background: 'rgba(234, 179, 8, 0.04)',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            {/* Left: vehicle + label */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                {block.vehicleName}
              </span>
              <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                {block.label ?? t('defaultLabel')}
              </span>
              {block.isActive && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'rgb(161, 120, 0)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {t('activeNow')}
                </span>
              )}
            </div>

            {/* Right: date range */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                {formatDate(block.startAt)}
              </div>
              <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                {t('until', { date: formatDate(block.endAt) })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
