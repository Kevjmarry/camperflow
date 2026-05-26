'use client';

import { useTranslations } from 'next-intl';

type PickupDataWarningModalProps = {
  isOpen: boolean;
  missing: string[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

export default function PickupDataWarningModal({
  isOpen,
  missing,
  onConfirm,
  onCancel,
}: PickupDataWarningModalProps) {
  const t = useTranslations('checklistDetail');

  if (!isOpen) return null;

  const fieldLabel = (key: string): string => {
    switch (key) {
      case 'km': return t('pickupWarningFieldKm');
      case 'fuel': return t('pickupWarningFieldFuel');
      case 'adblue': return t('pickupWarningFieldAdblue');
      case 'photos': return t('pickupWarningFieldPhotos');
      default: return key;
    }
  };

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
          maxWidth: '400px',
          padding: '24px',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'rgb(var(--text))', margin: '0 0 6px' }}>
            {t('pickupWarningTitle')}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
            {t('pickupWarningBody')}
          </p>
        </div>
        <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {missing.map((key) => (
            <li key={key} style={{ fontSize: '14px', color: 'rgb(var(--text))', fontWeight: 500 }}>
              {fieldLabel(key)}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={onConfirm}
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600 }}
          >
            {t('pickupWarningContinue')}
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
            {t('pickupWarningGoBack')}
          </button>
        </div>
      </div>
    </div>
  );
}
