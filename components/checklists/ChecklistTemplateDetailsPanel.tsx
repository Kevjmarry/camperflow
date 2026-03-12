'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateScope = 'booking' | 'vehicle';

interface ChecklistTemplate {
  id: string;
  name: string;
  scope: TemplateScope;
  type: string;
  active: boolean;
  created_at: string;
  is_system?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIFECYCLE_STAGE_KEYS = [
  'bookingCreated',
  'confirmed',
  'pickup',
  'return',
  'cleaning',
  'ready',
] as const;

const TYPE_LIFECYCLE_STAGE_KEY: Record<string, string | null> = {
  pickup: 'pickup',
  return: 'return',
  cleaning: 'cleaning',
  mechanical: 'cleaning',
  guest_prereturn: 'return',
  vehicle_readiness: 'ready',
  pre_season: null,
  post_season: null,
};

// ─── TypeExplanationPanel ─────────────────────────────────────────────────────

function TypeExplanationPanel({ selectedType }: { selectedType: string }) {
  const expT = useTranslations('checklistTypeExplanations');

  const expKey = selectedType === 'mechanical' ? 'cleaning' : selectedType;

  const knownTypes = Object.keys(TYPE_LIFECYCLE_STAGE_KEY);
  if (!knownTypes.includes(selectedType)) return null;

  function safeGet(key: string): string {
    try {
      return expT(key as Parameters<typeof expT>[0]);
    } catch {
      return '';
    }
  }

  const createdWhen = [
    safeGet(`${expKey}.createdWhen.0`),
    safeGet(`${expKey}.createdWhen.1`),
  ].filter(Boolean);

  const visibleTo = [
    safeGet(`${expKey}.visibleTo.0`),
    safeGet(`${expKey}.visibleTo.1`),
  ].filter(Boolean);

  const usedFor = safeGet(`${expKey}.usedFor`);

  const lifecycleStageKey = TYPE_LIFECYCLE_STAGE_KEY[selectedType];
  const isVehicleOnly = lifecycleStageKey === null;

  const sectionCreatedWhen = safeGet('sectionCreatedWhen');
  const sectionVisibleTo = safeGet('sectionVisibleTo');
  const sectionUsedFor = safeGet('sectionUsedFor');
  const vehicleMaintenanceBadge = safeGet('vehicleMaintenanceBadge');
  const vehicleMaintenanceNote = safeGet('vehicleMaintenanceNote');

  return (
    <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgb(var(--brand) / 0.04)',
          border: '1px solid rgb(var(--brand) / 0.15)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          fontSize: '13px',
          lineHeight: '1.5',
        }}
      >
        {createdWhen.length > 0 && (
          <div>
            {sectionCreatedWhen && (
              <p style={{ margin: '0 0 var(--space-1) 0', fontWeight: 600, color: 'rgb(var(--text))', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {sectionCreatedWhen}
              </p>
            )}
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'rgb(var(--text))', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {createdWhen.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}
        {visibleTo.length > 0 && (
          <div>
            {sectionVisibleTo && (
              <p style={{ margin: '0 0 var(--space-1) 0', fontWeight: 600, color: 'rgb(var(--text))', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {sectionVisibleTo}
              </p>
            )}
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'rgb(var(--text))', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {visibleTo.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}
        {usedFor && (
          <div>
            {sectionUsedFor && (
              <p style={{ margin: '0 0 2px 0', fontWeight: 600, color: 'rgb(var(--text))', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {sectionUsedFor}
              </p>
            )}
            <p style={{ margin: 0, color: 'rgb(var(--text))' }}>{usedFor}</p>
          </div>
        )}
      </div>

      {isVehicleOnly ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 'var(--radius)',
            fontSize: '12px',
            color: 'rgb(var(--muted))',
          }}
        >
          {vehicleMaintenanceBadge && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'rgb(var(--brand) / 0.12)',
              border: '1px solid rgb(var(--brand) / 0.35)',
              color: 'rgb(var(--brand))',
              fontWeight: 600,
              fontSize: '12px',
            }}>
              {vehicleMaintenanceBadge}
            </span>
          )}
          {vehicleMaintenanceNote && <span>- {vehicleMaintenanceNote}</span>}
        </div>
      ) : (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 'var(--radius)',
          }}
        >
          {LIFECYCLE_STAGE_KEYS.map((key, idx) => {
            const isActive = key === lifecycleStageKey;
            const isLast = idx === LIFECYCLE_STAGE_KEYS.length - 1;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '16px' }}>
                  <div
                    style={{
                      width: isActive ? '10px' : '8px',
                      height: isActive ? '10px' : '8px',
                      borderRadius: '50%',
                      marginTop: '3px',
                      background: isActive ? 'rgb(var(--brand))' : 'rgb(var(--muted) / 0.35)',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                  />
                  {!isLast && (
                    <div style={{ width: '1px', flex: 1, minHeight: '10px', background: 'rgb(var(--muted) / 0.2)', margin: '2px 0' }} />
                  )}
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
                    paddingBottom: isLast ? 0 : 'var(--space-2)',
                    transition: 'all 0.15s',
                  }}
                >
                  {safeGet(`lifecycleStages.${key}`)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const SECTION_HEADING: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'rgb(var(--text))',
  margin: '0 0 var(--space-3) 0',
};

const FIELD_LABEL: CSSProperties = {
  display: 'block',
  marginBottom: 'var(--space-1)',
  fontSize: '13px',
};

const FIELD_WRAPPER: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const ERROR_BOX: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgb(var(--error) / 0.08)',
  border: '1px solid rgb(var(--error) / 0.3)',
  borderRadius: 'var(--radius)',
  color: 'rgb(var(--error))',
  fontSize: '14px',
};

const SUCCESS_BOX: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgb(var(--success) / 0.08)',
  border: '1px solid rgb(var(--success) / 0.3)',
  borderRadius: 'var(--radius)',
  color: 'rgb(var(--success))',
  fontSize: '14px',
};

const READ_ONLY_INPUT: CSSProperties = {
  background: 'rgb(var(--background))',
  opacity: 0.7,
  cursor: 'not-allowed',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface TypeOption {
  value: string;
  label: string;
}

interface ChecklistTemplateDetailsPanelProps {
  template: ChecklistTemplate;
  isSystem: boolean;
  name: string;
  setName: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  type: string;
  setType: (v: string) => void;
  typeOptions: TypeOption[];
  saving: boolean;
  deleting: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  setSaveSuccess: (v: boolean) => void;
  deleteError: string | null;
  handleSave: () => void;
  handleDelete: () => void;
  isDesktop: boolean;
  // Use the return type of the hook directly — avoids the invalid generic-in-typeof pattern.
  t: ReturnType<typeof useTranslations>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChecklistTemplateDetailsPanel({
  template,
  isSystem,
  name,
  setName,
  active,
  setActive,
  type,
  setType,
  typeOptions,
  saving,
  deleting,
  saveError,
  saveSuccess,
  setSaveSuccess,
  deleteError,
  handleSave,
  handleDelete,
  isDesktop,
  t,
}: ChecklistTemplateDetailsPanelProps) {
  return (
    <div style={{ padding: 'var(--space-5)', border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', background: 'rgb(var(--background))' }}>
      <h2 style={SECTION_HEADING}>{t('sectionTemplateDetails')}</h2>

      {saveSuccess && <div style={{ ...SUCCESS_BOX, marginBottom: 'var(--space-4)' }}>{t('saveSuccess')}</div>}
      {saveError && <div style={{ ...ERROR_BOX, marginBottom: 'var(--space-4)' }}>{saveError}</div>}
      {deleteError && <div style={{ ...ERROR_BOX, marginBottom: 'var(--space-4)' }}>{deleteError}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

        {/* Name */}
        <div style={FIELD_WRAPPER}>
          <label htmlFor="tmpl-name" className="label" style={FIELD_LABEL}>
            {t('fieldName')} <span style={{ color: 'rgb(var(--error))' }}>*</span>
          </label>
          <input
            id="tmpl-name"
            className="input"
            type="text"
            value={name}
            readOnly={isSystem}
            tabIndex={isSystem ? -1 : undefined}
            style={isSystem ? READ_ONLY_INPUT : undefined}
            onChange={isSystem ? undefined : (e) => { setName(e.target.value); setSaveSuccess(false); }}
          />
          {isSystem && (
            <span style={{ marginTop: 'var(--space-1)', fontSize: '12px', color: 'rgb(var(--muted))' }}>
              {t('systemNameHint')}
            </span>
          )}
        </div>

        {/* Applies to (Scope — always read-only) */}
        <div style={FIELD_WRAPPER}>
          <label htmlFor="tmpl-scope" className="label" style={FIELD_LABEL}>{t('fieldAppliesTo')}</label>
          <input
            id="tmpl-scope"
            className="input"
            type="text"
            value={template.scope === 'booking' ? t('scopeBookingValue') : t('scopeVehicleValue')}
            readOnly
            style={READ_ONLY_INPUT}
            tabIndex={-1}
          />
          <span style={{ marginTop: 'var(--space-1)', fontSize: '12px', color: 'rgb(var(--muted))' }}>
            {t('scopeReadOnlyHint')}
          </span>
        </div>

        {/* When should this checklist be created? (Type) */}
        <div style={FIELD_WRAPPER}>
          <label htmlFor="tmpl-type" className="label" style={FIELD_LABEL}>
            {t('fieldWhenCreated')}
          </label>
          {isSystem ? (
            <input
              id="tmpl-type"
              className="input"
              type="text"
              value={typeOptions.find((o) => o.value === type)?.label ?? type}
              readOnly
              tabIndex={-1}
              style={READ_ONLY_INPUT}
            />
          ) : (
            <select
              id="tmpl-type"
              className="input"
              value={type}
              onChange={(e) => { setType(e.target.value); setSaveSuccess(false); }}
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {isSystem && (
            <span style={{ marginTop: 'var(--space-1)', fontSize: '12px', color: 'rgb(var(--muted))' }}>
              {t('systemTypeHint')}
            </span>
          )}
          <TypeExplanationPanel selectedType={type} />
        </div>

        {/* Active */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', paddingTop: 'var(--space-1)' }}>
          <input
            id="tmpl-active"
            type="checkbox"
            checked={active}
            onChange={(e) => { setActive(e.target.checked); setSaveSuccess(false); }}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="tmpl-active" className="label" style={{ fontSize: '13px', cursor: 'pointer', margin: 0 }}>{t('fieldActive')}</label>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid rgb(var(--border))',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || deleting}>
            {saving ? t('btnSaving') : t('btnSaveChanges')}
          </button>
          {isSystem ? (
            <span style={{ fontSize: '13px', color: 'rgb(var(--muted))', fontStyle: 'italic' }}>
              {t('systemCannotDelete')}
            </span>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={handleDelete}
              disabled={saving || deleting}
              style={{ color: 'rgb(var(--error))', borderColor: 'rgb(var(--error) / 0.4)' }}
            >
              {deleting ? t('btnDeleting') : t('btnDeleteTemplate')}
            </button>
          )}
        </div>

        {!isDesktop && (
          <p style={{ margin: 0, fontSize: '12px', color: 'rgb(var(--muted))', fontStyle: 'italic' }}>
            {t('desktopTip')}
          </p>
        )}
      </div>
    </div>
  );
}