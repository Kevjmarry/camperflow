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
  isOffline?: boolean;
  isReturn?: boolean;
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
  isOffline,
  isReturn,
}: ChecklistBannersProps) {
  const t = useTranslations('checklistDetail');

  return (
    <>
      {/* Offline read-only banner */}
      {isOffline && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid rgb(var(--warning) / 0.4)',
            backgroundColor: 'rgb(var(--warning) / 0.08)',
            color: 'rgb(var(--warning))',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>{t('offlineBanner')}</span>
        </div>
      )}

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
            <div><strong>{t('errorDetailMessage')}</strong> {syncError.message}</div>
            {syncError.code && <div><strong>{t('errorDetailCode')}</strong> {syncError.code}</div>}
            {syncError.details && <div><strong>{t('errorDetailDetails')}</strong> {syncError.details}</div>}
            {syncError.hint && <div><strong>{t('errorDetailHint')}</strong> {syncError.hint}</div>}
            <details style={{ marginTop: '6px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '11px' }}>{t('rawErrorJson')}</summary>
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

      {/* Completed-and-locked banner — checklist done, booking still active */}
      {!isChecklistLocked && isCompleted && (
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
            flexWrap: 'wrap',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flexShrink: 0 }}>🔒</span>
            <span>{t('completedAndLocked')}</span>
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
                {t(isReturn ? 'reopenButtonReturn' : 'reopenButton')}
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
      )}
    </>
  );
}
