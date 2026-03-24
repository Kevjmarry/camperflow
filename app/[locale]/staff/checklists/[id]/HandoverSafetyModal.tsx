'use client';

import { useTranslations } from 'next-intl';

type FlaggedItem = {
  id: string;
  issue_blocking: boolean | null;
  issue_title: string | null;
  template: { label: string };
};

type HandoverSafetyModalProps = {
  isOpen: boolean;
  flaggedItems: FlaggedItem[];
  onConfirm: () => void;
  onMarkUrgent: () => void;
  onCancel: () => void;
  isReturn?: boolean;
};

export default function HandoverSafetyModal({
  isOpen,
  flaggedItems,
  onConfirm,
  onMarkUrgent,
  onCancel,
  isReturn = false,
}: HandoverSafetyModalProps) {
  const t = useTranslations('checklistDetail');

  if (!isOpen) return null;

  const hasUrgent = flaggedItems.some((it) => it.issue_blocking === true);

  // Return checklist + urgent items → notification choice modal (both complete)
  if (isReturn && hasUrgent) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <div
          className="surface"
          style={{
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: '#991b1b',
                margin: '0 0 6px',
              }}
            >
              {t('returnNotifyModalTitle')}
            </h2>
            <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
              {t('returnNotifyModalBody')}
            </p>
          </div>

          <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {flaggedItems.slice(0, 3).map((it) => (
              <li key={it.id} style={{ fontSize: '14px', color: 'rgb(var(--text))', fontWeight: 500 }}>
                {it.issue_title ?? it.template.label}
              </li>
            ))}
            {flaggedItems.length > 3 && (
              <li style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                {t('safetyModalMoreIssues', { count: flaggedItems.length - 3 })}
              </li>
            )}
          </ul>

          <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
            {t('returnNotifyModalQuestion')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={onConfirm}
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600 }}
            >
              {t('returnNotifyNow')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--surface))',
                color: 'rgb(var(--text))',
                cursor: 'pointer',
              }}
            >
              {t('returnNotifyLogOnly')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="surface"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '24px',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: hasUrgent ? '#991b1b' : 'rgb(var(--text))',
              margin: '0 0 6px',
            }}
          >
            {hasUrgent ? t('urgentModalTitle') : t('safetyModalTitle')}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
            {hasUrgent ? t('urgentModalBody') : t('safetyModalBody')}
          </p>
        </div>

        {/* Flagged item list */}
        <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {flaggedItems.slice(0, 3).map((it) => (
            <li key={it.id} style={{ fontSize: '14px', color: 'rgb(var(--text))', fontWeight: 500 }}>
              {it.issue_title ?? it.template.label}
            </li>
          ))}
          {flaggedItems.length > 3 && (
            <li style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
              {t('safetyModalMoreIssues', { count: flaggedItems.length - 3 })}
            </li>
          )}
        </ul>

        {!hasUrgent && (
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
            {t('safetyModalQuestion')}
          </p>
        )}

        {hasUrgent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--surface))',
                color: 'rgb(var(--text))',
                cursor: 'pointer',
              }}
            >
              {t('urgentModalDismiss')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={onConfirm}
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600 }}
            >
              {t('safetyModalConfirm')}
            </button>
            <button
              type="button"
              onClick={onMarkUrgent}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid #f59e0b',
                backgroundColor: '#fef3c7',
                color: '#92400e',
                cursor: 'pointer',
              }}
            >
              {t('safetyModalMarkUrgent')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--surface))',
                color: 'rgb(var(--text))',
                cursor: 'pointer',
              }}
            >
              {t('safetyModalCancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
