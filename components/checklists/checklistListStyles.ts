import type { CSSProperties } from 'react';

// ─── Chip style helpers ───────────────────────────────────────────────────────

type ChipColors = { color: string; background: string; border: string };

const chipTokens: Record<string, ChipColors> = {
  success: {
    color: 'rgb(var(--success))',
    background: 'rgb(var(--success) / 0.12)',
    border: '1px solid rgb(var(--success) / 0.3)',
  },
  warning: {
    color: 'rgb(var(--warning))',
    background: 'rgb(var(--warning) / 0.12)',
    border: '1px solid rgb(var(--warning) / 0.3)',
  },
  error: {
    color: 'rgb(var(--error))',
    background: 'rgb(var(--error) / 0.12)',
    border: '1px solid rgb(var(--error) / 0.3)',
  },
  muted: {
    color: 'rgb(var(--muted))',
    background: 'rgb(var(--muted) / 0.12)',
    border: '1px solid rgb(var(--muted) / 0.3)',
  },
};

const baseChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: '9999px',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '1.5',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export const getStatusChipStyle = (status: string): CSSProperties => {
  const map: Record<string, ChipColors> = {
    not_started: chipTokens.muted,
    pending:     chipTokens.muted,
    in_progress: chipTokens.warning,
    completed:   chipTokens.success,
  };
  return { ...baseChip, ...(map[status] ?? chipTokens.muted) };
};

export const getSeverityChipStyle = (severity: string): CSSProperties => {
  const map: Record<string, ChipColors> = {
    low:    chipTokens.muted,
    medium: chipTokens.warning,
    high:   chipTokens.error,
  };
  return { ...baseChip, ...(map[severity] ?? chipTokens.muted) };
};

// ─── Table / layout tokens ────────────────────────────────────────────────────

export const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  border: '1px solid rgb(var(--border))',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

export const TH: CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  color: 'rgb(var(--muted))',
  padding: 'var(--space-2) var(--space-3)',
  borderBottom: '1px solid rgb(var(--border))',
  whiteSpace: 'nowrap' as const,
  background: 'rgb(var(--background))',
};

export const TD: CSSProperties = {
  padding: 'var(--space-3)',
  fontSize: '14px',
  color: 'rgb(var(--text))',
  verticalAlign: 'middle' as const,
  borderBottom: '1px solid rgb(var(--border))',
};

export const TD_MUTED: CSSProperties = {
  ...TD,
  color: 'rgb(var(--muted))',
  fontSize: '13px',
};

export const SECTION_HEADING: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'rgb(var(--text))',
  margin: '0 0 var(--space-3) 0',
};

export const CARD_CONTAINER: CSSProperties = {
  border: '1px solid rgb(var(--border))',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};