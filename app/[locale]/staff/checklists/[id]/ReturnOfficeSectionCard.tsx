'use client';

import { useTranslations } from 'next-intl';
import type { ChecklistInstanceType } from './types';

type ReturnBooleanField = 'return_keys_received' | 'return_documents_received' | 'return_contract_closed';

const RETURN_FIELDS: { dbField: ReturnBooleanField; labelKey: string }[] = [
  { dbField: 'return_keys_received', labelKey: 'returnKeysReceived' },
  { dbField: 'return_documents_received', labelKey: 'returnDocumentsReceived' },
  { dbField: 'return_contract_closed', labelKey: 'returnContractClosed' },
];

const DEPOSIT_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'returned', labelKey: 'returnDepositReturned' },
  { value: 'pending_admin_return', labelKey: 'returnDepositPendingAdmin' },
  { value: 'held_damage', labelKey: 'returnDepositHeldDamage' },
];

type ReturnOfficeSectionCardProps = {
  localInstance: ChecklistInstanceType;
  isChecklistLocked: boolean;
  onToggleField: (field: ReturnBooleanField) => void;
  onSetDepositStatus: (value: string) => void;
  highlight?: boolean;
};

export default function ReturnOfficeSectionCard({
  localInstance,
  isChecklistLocked,
  onToggleField,
  onSetDepositStatus,
  highlight,
}: ReturnOfficeSectionCardProps) {
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
      {/* Checkbox confirmations */}
      <div>
        <p style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'rgb(var(--muted))',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: '0 0 10px 0',
        }}>
          {t('returnCloseConfirmationsTitle')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {RETURN_FIELDS.map(({ dbField, labelKey }) => {
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
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: checked ? '2px solid rgb(var(--brand))' : '2px solid rgb(var(--border))',
                  borderRadius: '4px',
                  backgroundColor: 'rgb(var(--surface))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
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

      {/* Deposit status */}
      <div>
        <p style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'rgb(var(--muted))',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: '0 0 10px 0',
        }}>
          {t('returnDepositStatusTitle')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {DEPOSIT_OPTIONS.map(({ value, labelKey }) => {
            const selected = localInstance.return_deposit_status === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => { if (!isChecklistLocked) onSetDepositStatus(value); }}
                disabled={isChecklistLocked}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: isChecklistLocked ? 'default' : 'pointer',
                  border: selected ? '1px solid rgb(var(--brand))' : '1px solid rgb(var(--border))',
                  borderRadius: '6px',
                  padding: '12px',
                  opacity: isChecklistLocked ? 0.75 : 1,
                  background: 'none',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: selected ? '2px solid rgb(var(--brand))' : '2px solid rgb(var(--border))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {selected && (
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'rgb(var(--brand))',
                    }} />
                  )}
                </div>
                <span className="label" style={{ fontWeight: 500, margin: 0 }}>
                  {t(labelKey as Parameters<typeof t>[0])}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
