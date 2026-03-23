'use client';

import { useTranslations } from 'next-intl';

interface PhaseSummaryStripProps {
  introText?: string;
  phaseLabels?: [string, string, string];
}

export default function PhaseSummaryStrip({ introText, phaseLabels }: PhaseSummaryStripProps = {}) {
  const t = useTranslations('checklistDetail');

  const phases = [
    { n: '1', label: phaseLabels?.[0] ?? t('phase1Label') },
    { n: '2', label: phaseLabels?.[1] ?? t('phase2Label') },
    { n: '3', label: phaseLabels?.[2] ?? t('phase3Label') },
  ];

  const intro = introText ?? t('pickupModeIntro');

  return (
    <div
      className="surface"
      style={{
        borderRadius: '8px',
        padding: '14px 16px',
        borderLeft: '3px solid rgb(var(--brand))',
      }}
    >
      <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: '0 0 10px' }}>
        {intro}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {phases.map(({ n, label }, idx) => (
          <span key={n} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: 'rgb(var(--brand))',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {n}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                {label}
              </span>
            </span>
            {idx < phases.length - 1 && (
              <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>→</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
