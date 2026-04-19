'use client';

import { useTranslations, useLocale } from 'next-intl';
import type { ReopenHistoryEntry, DbIssueSeverity, IssueSeverity } from './types';
import { dbToUiSeverity } from './types';

const severityBadgeStyles: Record<IssueSeverity, { bg: string; color: string; border: string }> = {
  attention: { bg: '#fefce8', color: '#a16207', border: '#fbbf24' },
  urgent: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
};

type ReopenHistorySectionProps = {
  reopenHistory: ReopenHistoryEntry[];
  expandedHistoryIds: Record<string, boolean>;
  onToggleEntry: (id: string) => void;
  templateItemIdToLabel: Map<string, string>;
  templateItemIdToSortOrder: Map<string, number>;
  initialsByUserId: Record<string, string>;
};

export default function ReopenHistorySection({
  reopenHistory,
  expandedHistoryIds,
  onToggleEntry,
  templateItemIdToLabel,
  templateItemIdToSortOrder,
  initialsByUserId,
}: ReopenHistorySectionProps) {
  const t = useTranslations('checklistDetail');
  const locale = useLocale();

  const severityLabel = (severity: IssueSeverity): string => {
    switch (severity) {
      case 'attention': return t('severityAttention');
      case 'urgent': return t('severityUrgent');
    }
  };

  return (
    <div style={{ marginTop: '32px' }}>
      <div style={{ borderTop: '1px solid rgb(var(--border))', paddingTop: '20px', marginBottom: '14px' }}>
        <h2
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'rgb(var(--muted))',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {t('historyTitle')}
        </h2>
      </div>

      {reopenHistory.length === 0 && (
        <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0 }}>
          {t('historyEmpty')}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {reopenHistory.map((entry) => {
          const isExpanded = !!expandedHistoryIds[entry.id];
          const sortedSnapshotItems = [...entry.snapshot.items].sort((a, b) => {
            const aOrder = templateItemIdToSortOrder.get(a.template_item_id) ?? 0;
            const bOrder = templateItemIdToSortOrder.get(b.template_item_id) ?? 0;
            return aOrder - bOrder;
          });
          const snapshotStatusLabel = (() => {
            switch (entry.snapshot.instance.status) {
              case 'pending':
              case 'not_started':
                return t('statusNotStarted');
              case 'in_progress':
                return t('statusInProgress');
              case 'completed':
                return t('statusCompleted');
              default:
                return entry.snapshot.instance.status;
            }
          })();

          return (
            <div
              key={entry.id}
              className="surface"
              style={{
                borderRadius: '8px',
                border: '1px solid rgb(var(--border))',
                padding: '12px 14px',
              }}
            >
              {/* Entry header row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                    {new Date(entry.reopened_at).toLocaleString(locale)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: '2px' }}>
                    {t('historyReopenedAt')}
                  </div>
                  {entry.reason && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'rgb(var(--muted))',
                        marginTop: '6px',
                        fontStyle: 'italic',
                      }}
                    >
                      "{entry.reason}"
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onToggleEntry(entry.id)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'rgb(var(--text))',
                    background: 'rgb(var(--surface))',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isExpanded ? t('historyCollapse') : t('historyExpand')}
                </button>
              </div>

              {/* Expanded snapshot */}
              {isExpanded && (
                <div
                  style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgb(var(--border))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '16px',
                      flexWrap: 'wrap',
                      fontSize: '13px',
                      color: 'rgb(var(--muted))',
                    }}
                  >
                    <span>
                      {t('historySnapshotStatus')}:{' '}
                      <strong style={{ color: 'rgb(var(--text))' }}>{snapshotStatusLabel}</strong>
                    </span>
                    {entry.snapshot.instance.completed_at && (
                      <span>
                        {t('historySnapshotCompletedAt')}:{' '}
                        <strong style={{ color: 'rgb(var(--text))' }}>
                          {new Date(entry.snapshot.instance.completed_at).toLocaleString(locale)}
                        </strong>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {sortedSnapshotItems.map((snapItem) => {
                      const label =
                        templateItemIdToLabel.get(snapItem.template_item_id) ??
                        snapItem.template_item_id;
                      const isFlagged = !!snapItem.issue_flag;
                      const uiSev = isFlagged
                        ? dbToUiSeverity(snapItem.issue_severity)
                        : null;
                      const badgeStyle = uiSev ? severityBadgeStyles[uiSev] : null;

                      return (
                        <div
                          key={snapItem.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '5px 8px',
                            borderRadius: '4px',
                            border: isFlagged
                              ? '1px solid #f59e0b'
                              : '1px solid rgb(var(--border))',
                            backgroundColor: snapItem.checked
                              ? 'rgba(var(--brand), 0.04)'
                              : 'transparent',
                          }}
                        >
                          {/* Read-only checkbox */}
                          <div
                            style={{
                              width: '16px',
                              height: '16px',
                              border: snapItem.checked
                                ? '2px solid rgb(var(--brand))'
                                : '2px solid rgb(var(--border))',
                              borderRadius: '3px',
                              backgroundColor: 'rgb(var(--surface))',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {snapItem.checked && (
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                                <path
                                  d="M13.3332 4L5.99984 11.3333L2.6665 8"
                                  stroke="rgb(var(--brand))"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: '13px',
                                color: snapItem.checked
                                  ? 'rgb(var(--text))'
                                  : 'rgb(var(--muted))',
                                fontWeight: snapItem.checked ? 500 : 400,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {label}
                            </span>
                            {snapItem.checked &&
                              snapItem.checked_by &&
                              initialsByUserId[snapItem.checked_by] && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    border: '1px solid rgb(var(--border))',
                                    backgroundColor: 'rgb(var(--surface))',
                                    color: 'rgb(var(--muted))',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    flexShrink: 0,
                                  }}
                                >
                                  {initialsByUserId[snapItem.checked_by]}
                                </span>
                              )}
                          </div>

                          {isFlagged && badgeStyle && uiSev && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: badgeStyle.bg,
                                color: badgeStyle.color,
                                border: `1px solid ${badgeStyle.border}`,
                                flexShrink: 0,
                              }}
                            >
                              ⚑ {severityLabel(uiSev)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
