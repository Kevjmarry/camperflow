'use client';

import { useTranslations } from 'next-intl';

type DbIssueSeverity = 'low' | 'medium' | 'high' | 'critical';
type IssueSeverity = 'attention' | 'urgent';

export type ChecklistItemType = {
  id: string;
  template_item_id: string;
  checked: boolean;
  notes: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  issue_flag: boolean | null;
  issue_title: string | null;
  issue_description: string | null;
  issue_severity: DbIssueSeverity | null;
  issue_blocking: boolean | null;
  linked_vehicle_issue_id: string | null;
  template: {
    label: string;
    sort_order: number;
    section: string | null;
  };
};

export type FlagDraft = {
  severity: IssueSeverity;
  note: string;
  saving: boolean;
  error: string | null;
  photos: File[];
};

function dbToUiSeverity(db: DbIssueSeverity | null | undefined): IssueSeverity {
  switch (db) {
    case 'high':
    case 'critical':
      return 'urgent';
    default:
      return 'attention';
  }
}

const severityBadgeStyles: Record<IssueSeverity, { bg: string; color: string; border: string }> = {
  attention: { bg: '#fefce8', color: '#a16207', border: '#fbbf24' },
  urgent: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
};

type ChecklistItemProps = {
  item: ChecklistItemType;
  displayLabel?: string;
  isChecklistLocked: boolean;
  isNotesOpen: boolean;
  isFlagPanelOpen: boolean;
  flagDraft: FlagDraft | null;
  isResolvingFlag: boolean;
  initialsByUserId: Record<string, string>;
  userId: string | null;
  onToggle: () => void;
  onToggleNotes: () => void;
  onOpenFlagPanel: () => void;
  onCloseFlagPanel: () => void;
  onResolveFlag: () => void;
  onFlagDraftChange: (field: 'severity' | 'note', value: string) => void;
  onFlagAddPhotos: (files: FileList | null) => void;
  onFlagRemovePhoto: (index: number) => void;
  onSaveFlag: () => void;
  onNotesChange: (value: string) => void;
  onNotesBlur: (value: string) => void;
};

export default function ChecklistItem({
  item,
  displayLabel,
  isChecklistLocked,
  isNotesOpen,
  isFlagPanelOpen,
  flagDraft,
  isResolvingFlag,
  initialsByUserId,
  userId,
  onToggle,
  onToggleNotes,
  onOpenFlagPanel,
  onCloseFlagPanel,
  onResolveFlag,
  onFlagDraftChange,
  onFlagAddPhotos,
  onFlagRemovePhoto,
  onSaveFlag,
  onNotesChange,
  onNotesBlur,
}: ChecklistItemProps) {
  const t = useTranslations('checklistDetail');

  const checkerInitials =
    item.checked && item.checked_by
      ? initialsByUserId[item.checked_by] ?? null
      : null;

  const isFlagged = !!item.issue_flag;
  const itemUiSeverity = isFlagged ? dbToUiSeverity(item.issue_severity) : null;
  const badgeStyle = isFlagged && itemUiSeverity ? severityBadgeStyles[itemUiSeverity] : null;

  const severityLabel = (severity: IssueSeverity): string => {
    switch (severity) {
      case 'attention': return t('severityAttention');
      case 'urgent': return t('severityUrgent');
    }
  };

  const photoInputId = `flag-photos-${item.id}`;

  return (
    <div
      style={{
        border: isFlagged
          ? '1px solid #f59e0b'
          : '1px solid rgb(var(--border))',
        borderRadius: '6px',
        padding: '12px',
        opacity: isChecklistLocked ? 0.75 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <label
          htmlFor={isChecklistLocked ? undefined : `check-${item.id}`}
          style={{
            marginTop: '2px',
            cursor: isChecklistLocked ? 'default' : 'pointer',
            flexShrink: 0,
            position: 'relative',
            display: 'block',
          }}
        >
          {!isChecklistLocked && (
            <input
              type="checkbox"
              id={`check-${item.id}`}
              checked={item.checked}
              onChange={onToggle}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
          )}
          <div
            style={{
              width: '20px',
              height: '20px',
              border: item.checked
                ? '2px solid rgb(var(--brand))'
                : '2px solid rgb(var(--border))',
              borderRadius: '4px',
              backgroundColor: 'rgb(var(--surface))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.checked && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M13.3332 4L5.99984 11.3333L2.6665 8"
                  stroke="rgb(var(--brand))"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </label>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '4px',
            }}
          >
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
                className="label"
                style={{ fontWeight: 500, margin: 0 }}
              >
                {displayLabel ?? item.template.label}
              </span>
              {checkerInitials && (
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
                  {checkerInitials}
                </span>
              )}
              {/* Flagged badge */}
              {isFlagged && badgeStyle && itemUiSeverity && (
                <span
                  title={t('flagAlreadyOpen')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: badgeStyle.bg,
                    color: badgeStyle.color,
                    border: `1px solid ${badgeStyle.border}`,
                    flexShrink: 0,
                    cursor: 'default',
                  }}
                >
                  ⚑ {severityLabel(itemUiSeverity)}
                </span>
              )}
            </div>

            {/* Action buttons: notes + flag (unlocked only) */}
            {!isChecklistLocked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={onToggleNotes}
                  style={{
                    fontSize: '12px',
                    color: 'rgb(var(--brand))',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    textDecoration: 'underline',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.notes ? t('editNote') : t('addNote')}
                </button>

                {/* Flag button — hidden if already flagged */}
                {!isFlagged && (
                  <button
                    type="button"
                    onClick={isFlagPanelOpen ? onCloseFlagPanel : onOpenFlagPanel}
                    style={{
                      fontSize: '12px',
                      color: isFlagPanelOpen ? '#92400e' : 'rgb(var(--muted))',
                      background: isFlagPanelOpen ? '#fef3c7' : 'none',
                      border: isFlagPanelOpen ? '1px solid #fbbf24' : '1px solid rgb(var(--border))',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      padding: '2px 8px',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }}
                  >
                    ⚑ {t('flag')}
                  </button>
                )}

                {/* Resolve button — shown only when item is flagged */}
                {isFlagged && (
                  <button
                    type="button"
                    onClick={onResolveFlag}
                    disabled={isResolvingFlag}
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: isResolvingFlag ? 'rgb(var(--muted))' : '#166534',
                      background: 'none',
                      border: `1px solid ${isResolvingFlag ? 'rgb(var(--border))' : '#86efac'}`,
                      borderRadius: '4px',
                      cursor: isResolvingFlag ? 'not-allowed' : 'pointer',
                      padding: '2px 8px',
                      whiteSpace: 'nowrap',
                      opacity: isResolvingFlag ? 0.6 : 1,
                    }}
                  >
                    {isResolvingFlag ? t('resolving') : t('resolveFlag')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Notes: read-only preview when closed */}
          {!isChecklistLocked && !isNotesOpen && item.notes && (
            <div
              style={{
                fontSize: '13px',
                color: 'rgb(var(--muted))',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: '1.4',
              }}
            >
              {item.notes}
            </div>
          )}

          {!isChecklistLocked && isNotesOpen && (
            <textarea
              placeholder={t('notesPlaceholder')}
              value={item.notes ?? ''}
              onChange={(e) => onNotesChange(e.target.value)}
              onBlur={(e) => onNotesBlur(e.target.value)}
              rows={2}
              className="input"
              style={{
                marginTop: '6px',
                width: '100%',
                resize: 'vertical',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />
          )}

          {/* Locked: show note as read-only text */}
          {isChecklistLocked && item.notes && (
            <div
              style={{
                fontSize: '13px',
                color: 'rgb(var(--muted))',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: '1.4',
              }}
            >
              {item.notes}
            </div>
          )}

          {/* Inline flag panel */}
          {isFlagPanelOpen && flagDraft && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #fbbf24',
                backgroundColor: '#fffbeb',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* Severity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label
                  style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', flexShrink: 0 }}
                >
                  {t('severity')}
                </label>
                <select
                  value={flagDraft.severity}
                  onChange={(e) => onFlagDraftChange('severity', e.target.value)}
                  style={{
                    fontSize: '12px',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    border: '1px solid #fbbf24',
                    backgroundColor: '#fff',
                    color: '#92400e',
                    cursor: 'pointer',
                  }}
                >
                  <option value="attention">{t('severityAttention')}</option>
                  <option value="urgent">{t('severityUrgent')}</option>
                </select>
              </div>

              {/* Note */}
              <textarea
                placeholder={t('issueNotePlaceholder')}
                value={flagDraft.note}
                onChange={(e) => onFlagDraftChange('note', e.target.value)}
                rows={2}
                style={{
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: flagDraft.error ? '1px solid #ef4444' : '1px solid #fbbf24',
                  backgroundColor: '#fff',
                  resize: 'vertical',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />

              {/* Photos */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                  {t('flagPhotosTitle')}
                </div>
                {flagDraft.photos.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    {flagDraft.photos.map((file, idx) => (
                      <div
                        key={idx}
                        style={{ position: 'relative', width: '64px', height: '64px', flexShrink: 0 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={URL.createObjectURL(file)}
                          alt=""
                          style={{
                            width: '64px',
                            height: '64px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #fbbf24',
                            display: 'block',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => onFlagRemovePhoto(idx)}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: '1px solid #fbbf24',
                            backgroundColor: '#fff',
                            color: '#92400e',
                            fontSize: '10px',
                            lineHeight: '14px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 700,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {flagDraft.photos.length < 3 && (
                  <>
                    <input
                      id={photoInputId}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => onFlagAddPhotos(e.target.files)}
                    />
                    <label
                      htmlFor={photoInputId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        padding: '3px 10px',
                        borderRadius: '4px',
                        border: '1px solid #fbbf24',
                        backgroundColor: '#fff',
                        color: '#92400e',
                        cursor: 'pointer',
                      }}
                    >
                      {t('addFlagPhoto')}
                    </label>
                  </>
                )}
              </div>

              {flagDraft.error && (
                <div style={{ fontSize: '12px', color: '#ef4444' }}>{flagDraft.error}</div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onSaveFlag}
                  disabled={flagDraft.saving || !userId}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: '4px',
                    border: '1px solid #f59e0b',
                    backgroundColor: (flagDraft.saving || !userId) ? '#fef3c7' : '#f59e0b',
                    color: (flagDraft.saving || !userId) ? '#92400e' : '#fff',
                    cursor: (flagDraft.saving || !userId) ? 'not-allowed' : 'pointer',
                    opacity: (flagDraft.saving || !userId) ? 0.7 : 1,
                  }}
                >
                  {flagDraft.saving ? t('saving') : t('saveFlag')}
                </button>
                <button
                  type="button"
                  onClick={onCloseFlagPanel}
                  disabled={flagDraft.saving}
                  style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid rgb(var(--border))',
                    backgroundColor: 'rgb(var(--surface))',
                    color: 'rgb(var(--muted))',
                    cursor: flagDraft.saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
