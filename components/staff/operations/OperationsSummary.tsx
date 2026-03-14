'use client'

import type { OpsSummary } from '@/lib/staff/operations/getOpsSummary'

interface Props {
  data: OpsSummary
}

export default function OperationsSummary({ data }: Props) {
  const tiles = [
    { label: 'Pickups today', value: data.pickupsToday, color: 'var(--brand)' },
    { label: 'Returns today', value: data.returnsToday, color: 'var(--brand)' },
    { label: 'Vehicles preparing', value: data.vehiclesPreparing, color: 'var(--warning)' },
    { label: 'Overdue returns', value: data.overdueReturns, color: 'var(--error)' },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="surface"
          style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <span
            style={{
              fontSize: '32px',
              fontWeight: 700,
              color: `rgb(var(${tile.color}))`,
              lineHeight: 1,
            }}
          >
            {tile.value}
          </span>
          <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{tile.label}</span>
        </div>
      ))}
    </div>
  )
}
