'use client';

import { useTranslations } from 'next-intl';
import type { SyncError } from './types';

type ChecklistBannersProps = {
  isChecklistLocked: boolean;
  lockNotice: string | null;
  onDismissLockNotice: () => void;
  syncError: SyncError | null;
  onDismissSyncError: () => void;
  isCompleted: boolean;
  canReopen: boolean;
  hasBooking: boolean;
  onReopen: () => void;
  onGoToBooking: () => void;
};

export default function ChecklistBanners({
  isChecklistLocked,
  lockNotice,
  onDismissLockNotice,
  syncError,
  onDismissSyncError,
  isCompleted,
  canReopen,
  hasBooking,
  onReopen,
  onGoToBooking,
}: ChecklistBannersProps) {
  const t = useTranslations('checklistDetail');

  return (
    <>
      {/* Booking-completed lock banner */}
      {isChecklistLocked && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid rgb(var(--border))',
            backgroundColor: 'rgb(var(--surface))',
            color: 'rgb(var(--muted))',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <span style={{ flexShrink: 0 }}>🔒</span>
          <span>{t('lockedBookingCompleted')}</span>
        </div>
      )}

      {/* DB-triggered lock notice */}
      {lockNotice && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid rgb(var(--border))',
            backgroundColor: 'rgb(var(--surface))',
            color: 'rgb(var(--muted))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          <span>🔒 {lockNotice}</span>
          <button
            type="button"
            onClick={onDismissLockNotice}
            style={{
              fontSize: '11px',
              color: 'rgb(var(--muted))',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Sync error banner */}
      {syncError && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '6px',
            border: '1px solid #f87171',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
            {syncError.kind === 'item_update_failed'
              ? `⚠️ ${t('errorItemUpdateFailed')}`
              : `⚠️ ${t('errorStatusSyncFailed')}`}
          </div>
          <div style={{ fontSize: '12px', lineHeight: '1.6', fontFamily: 'monospace' }}>
            <div><strong>message:</strong> {syncError.message}</div>
            {syncError.code && <div><strong>code:</strong> {syncError.code}</div>}
            {syncError.details && <div><strong>details:</strong> {syncError.details}</div>}
            {syncError.hint && <div><strong>hint:</strong> {syncError.hint}</div>}
            <details style={{ marginTop: '6px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '11px' }}>Raw error JSON</summary>
              <pre
                style={{
                  marginTop: '4px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontSize: '11px',
                }}
              >
                {syncError.raw}
              </pre>
            </details>
          </div>
          <button
            type="button"
            onClick={onDismissSyncError}
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: '#991b1b',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Success notice — unlocked only */}
      {!isChecklistLocked && isCompleted && (
        <div style={{ marginBottom: '16px' }}>
          <div
            className="surface"
            style={{
              padding: '10px 14px',
              border: '1px solid rgb(var(--border))',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z"
                  fill="rgb(var(--brand))"
                />
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                {t('checklistCompleted')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {canReopen && (
                <button
                  type="button"
                  onClick={onReopen}
                  style={{
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    border: '1px solid rgb(var(--border))',
                    backgroundColor: 'rgb(var(--surface))',
                    color: 'rgb(var(--text))',
                    cursor: 'pointer',
                  }}
                >
                  {t('reopenButton')}
                </button>
              )}
              {hasBooking && (
                <button
                  onClick={onGoToBooking}
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', fontSize: '14px', fontWeight: 500 }}
                >
                  {t('goToBooking')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
