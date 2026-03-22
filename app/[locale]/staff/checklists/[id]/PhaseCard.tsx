'use client';

import type { ReactNode } from 'react';

type PhaseCardProps = {
  phase: number;
  label: string;
  children: ReactNode;
};

export default function PhaseCard({ phase, label, children }: PhaseCardProps) {
  return (
    <div className="surface" style={{ borderRadius: '8px', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          backgroundColor: 'rgba(var(--brand), 0.04)',
          borderBottom: '1px solid rgb(var(--border))',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            backgroundColor: 'rgb(var(--brand))',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {phase}
        </span>
        <span style={{ fontWeight: 700, fontSize: '14px', color: 'rgb(var(--text))' }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
