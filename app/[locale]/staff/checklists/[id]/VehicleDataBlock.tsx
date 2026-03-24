'use client';

import { useTranslations } from 'next-intl';

type VehicleData = { km: string; fuel: string; adblue: string };

type VehicleDataBlockProps = {
  vehicleData: VehicleData;
  onChange: (field: keyof VehicleData, value: string) => void;
  isLocked: boolean;
  highlight?: boolean;
  fuelOptions?: string[];
  adblueOptions?: string[];
  /** Handover km — when provided, a read-only "Distance driven" row is shown on return checklists. */
  handoverKm?: string;
  /** Inline validation error for the km field (return checklist only). */
  kmError?: string;
  /** Called on blur of the km input (return checklist validation). */
  onKmBlur?: () => void;
};

const LEVEL_OPTIONS = [
  { value: 'full', label: 'Full' },
  { value: '3/4', label: '3/4' },
  { value: '1/2', label: '1/2' },
  { value: '1/4', label: '1/4' },
  { value: 'empty', label: 'Empty' },
];

// Shared style applied to all three editable controls (input + both selects) so
// they render at the same height as the read-only Distance driven div.
// The div renders at ≈ 30px (fontSize 13px × lineHeight 1.4 + 6px×2 padding).
// Native input/select ignore padding-based sizing due to UA min-height and
// internal chrome, so we override with an explicit height + boxSizing.
const CONTROL_STYLE: React.CSSProperties = {
  fontSize: '13px',
  height: '30px',
  minHeight: '30px',
  padding: '0 8px',
  lineHeight: '30px',
  boxSizing: 'border-box',
};

export default function VehicleDataBlock({ vehicleData, onChange, isLocked, highlight, fuelOptions, adblueOptions, handoverKm, kmError, onKmBlur }: VehicleDataBlockProps) {
  // When template options are provided, value === label (plain strings).
  // When falling back to defaults, preserve the original { value, label } pairs.
  const resolvedFuelOpts = fuelOptions
    ? fuelOptions.map((o) => ({ value: o, label: o }))
    : LEVEL_OPTIONS;
  const resolvedAdblueOpts = adblueOptions
    ? adblueOptions.map((o) => ({ value: o, label: o }))
    : LEVEL_OPTIONS;
  const t = useTranslations('checklistDetail');

  // Derived "Distance driven" — read-only, shown only on return when both km values are valid and result is >= 0.
  const returnKmNum = vehicleData.km !== '' ? parseFloat(vehicleData.km) : NaN;
  const handoverKmNum = handoverKm !== undefined && handoverKm !== '' ? parseFloat(handoverKm) : NaN;
  const distanceDriven =
    handoverKm !== undefined &&
    !isNaN(returnKmNum) &&
    !isNaN(handoverKmNum) &&
    returnKmNum - handoverKmNum >= 0
      ? returnKmNum - handoverKmNum
      : null;

  return (
    <div style={{
      border: highlight ? '1px solid #fca5a5' : '1px solid rgb(var(--border))',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: highlight ? 'rgba(239,68,68,0.03)' : undefined,
      transition: 'border-color 0.2s, background-color 0.2s',
    }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgb(var(--border))',
          backgroundColor: 'rgba(var(--brand), 0.02)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'rgb(var(--text))' }}>
          {t('auditVehicleDataTitle')}
        </span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {/* KM */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flex: '1 1 120px',
              minWidth: '100px',
            }}
          >
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
              KM
            </label>
            <input
              type="number"
              min="0"
              value={vehicleData.km}
              onChange={(e) => onChange('km', e.target.value)}
              onBlur={onKmBlur}
              disabled={isLocked}
              placeholder="e.g. 45200"
              className="input"
              style={CONTROL_STYLE}
            />
            {kmError && (
              <span style={{ fontSize: '11px', color: 'rgb(239,68,68)', marginTop: '2px' }}>
                {kmError}
              </span>
            )}
          </div>

          {/* Fuel */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flex: '1 1 120px',
              minWidth: '100px',
            }}
          >
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
              Fuel
            </label>
            <select
              value={vehicleData.fuel}
              onChange={(e) => onChange('fuel', e.target.value)}
              disabled={isLocked}
              className="input"
              style={CONTROL_STYLE}
            >
              <option value="">— Select —</option>
              {resolvedFuelOpts.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* AdBlue */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flex: '1 1 120px',
              minWidth: '100px',
            }}
          >
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
              AdBlue
            </label>
            <select
              value={vehicleData.adblue}
              onChange={(e) => onChange('adblue', e.target.value)}
              disabled={isLocked}
              className="input"
              style={CONTROL_STYLE}
            >
              <option value="">— Select —</option>
              {resolvedAdblueOpts.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Distance driven — read-only derived field, return only */}
          {distanceDriven !== null && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                flex: '1 1 120px',
                minWidth: '100px',
              }}
            >
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
                {t('distanceDriven')}
              </label>
              <div
                style={{
                  fontSize: '13px',
                  padding: '6px 8px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(var(--muted), 0.06)',
                  color: 'rgb(var(--text))',
                  fontWeight: 500,
                }}
              >
                {distanceDriven.toLocaleString()} km
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
