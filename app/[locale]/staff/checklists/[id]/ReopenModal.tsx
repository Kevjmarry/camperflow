'use client';

import { useTranslations } from 'next-intl';

type ReopenModalProps = {
  isOpen: boolean;
  reopenReason: string;
  setReopenReason: (val: string) => void;
  reopening: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ReopenModal({
  isOpen,
  reopenReason,
  setReopenReason,
  reopening,
  onConfirm,
  onCancel,
}: ReopenModalProps) {
  const t = useTranslations('checklistDetail');

  if (!isOpen) return null;

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
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'rgb(var(--text))', margin: '0 0 6px' }}>
            {t('reopenModalTitle')}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
            {t('reopenModalBody')}
          </p>
        </div>

        <textarea
          placeholder={t('reopenReasonPlaceholder')}
          value={reopenReason}
          onChange={(e) => setReopenReason(e.target.value)}
          rows={3}
          className="input"
          style={{
            width: '100%',
            resize: 'vertical',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { console.log('CONFIRM CLICKED'); onConfirm(); }}
            disabled={reopening}
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600, opacity: reopening ? 0.6 : 1 }}
          >
            {reopening ? t('reopening') : t('reopenConfirm')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={reopening}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '14px',
              fontWeight: 500,
              borderRadius: '6px',
              border: '1px solid rgb(var(--border))',
              backgroundColor: 'rgb(var(--surface))',
              color: 'rgb(var(--text))',
              cursor: reopening ? 'not-allowed' : 'pointer',
            }}
          >
            {t('reopenCancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
