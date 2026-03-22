'use client';

import { useTranslations } from 'next-intl';
import type { ChecklistInstanceType, HandoverField } from './types';

type OfficeSectionCardProps = {
  localInstance: ChecklistInstanceType;
  isChecklistLocked: boolean;
  onToggleField: (field: HandoverField) => void;
  highlight?: boolean;
};

const OFFICE_FIELDS: { dbField: HandoverField; labelKey: string }[] = [
  { dbField: 'office_contract_signed', labelKey: 'officeContractSigned' },
  { dbField: 'office_id_verified', labelKey: 'officeIdVerified' },
  { dbField: 'office_deposit_collected', labelKey: 'officeDepositCollected' },
  { dbField: 'handover_documents_given', labelKey: 'officeVehicleDocsHandedOver' },
  { dbField: 'handover_keys_given', labelKey: 'officeKeysHandedOver' },
];

export default function OfficeSectionCard({
  localInstance,
  isChecklistLocked,
  onToggleField,
  highlight,
}: OfficeSectionCardProps) {
  const t = useTranslations('checklistDetail');

  return (
    <div style={{
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      border: highlight ? '1px solid #fca5a5' : undefined,
      borderRadius: highlight ? '8px' : undefined,
      backgroundColor: highlight ? 'rgba(239,68,68,0.03)' : undefined,
      transition: 'border-color 0.2s, background-color 0.2s',
    }}>
      <div>
        <p
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'rgb(var(--muted))',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 10px 0',
          }}
        >
          {t('officeConfirmationsTitle')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {OFFICE_FIELDS.map(({ dbField, labelKey }) => {
            const checked = !!(localInstance as Record<string, unknown>)[dbField];
            return (
              <label
                key={dbField}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: isChecklistLocked ? 'default' : 'pointer',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: '6px',
                  padding: '12px',
                  opacity: isChecklistLocked ? 0.75 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isChecklistLocked}
                  onChange={() => onToggleField(dbField)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    border: checked
                      ? '2px solid rgb(var(--brand))'
                      : '2px solid rgb(var(--border))',
                    borderRadius: '4px',
                    backgroundColor: 'rgb(var(--surface))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {checked && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                <span className="label" style={{ fontWeight: 500, margin: 0 }}>
                  {t(labelKey as Parameters<typeof t>[0])}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
