'use client';

import { useTranslations } from 'next-intl';

type HandoverFooterProps = {
  completing: boolean;
  blockedError: string | null;
  onComplete: () => void;
};

export default function HandoverFooter({ completing, blockedError, onComplete }: HandoverFooterProps) {
  const t = useTranslations('checklistDetail');

  return (
    <div style={{ marginTop: '8px' }}>
      {blockedError && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid #f87171',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          ⚠️ {blockedError}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onComplete}
          disabled={completing}
          style={{
            padding: '12px 28px',
            fontSize: '15px',
            fontWeight: 700,
            opacity: completing ? 0.6 : 1,
            cursor: completing ? 'not-allowed' : 'pointer',
          }}
        >
          {completing ? t('completing') : t('handoverCompleteButton')}
        </button>
      </div>
    </div>
  );
}
