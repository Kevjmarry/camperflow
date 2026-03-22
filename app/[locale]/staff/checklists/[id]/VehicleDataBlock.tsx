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
};

const LEVEL_OPTIONS = [
  { value: 'full', label: 'Full' },
  { value: '3/4', label: '3/4' },
  { value: '1/2', label: '1/2' },
  { value: '1/4', label: '1/4' },
  { value: 'empty', label: 'Empty' },
];

export default function VehicleDataBlock({ vehicleData, onChange, isLocked, highlight, fuelOptions, adblueOptions }: VehicleDataBlockProps) {
  // When template options are provided, value === label (plain strings).
  // When falling back to defaults, preserve the original { value, label } pairs.
  const resolvedFuelOpts = fuelOptions
    ? fuelOptions.map((o) => ({ value: o, label: o }))
    : LEVEL_OPTIONS;
  const resolvedAdblueOpts = adblueOptions
    ? adblueOptions.map((o) => ({ value: o, label: o }))
    : LEVEL_OPTIONS;
  const t = useTranslations('checklistDetail');

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
              disabled={isLocked}
              placeholder="e.g. 45200"
              className="input"
              style={{ fontSize: '13px', padding: '6px 8px' }}
            />
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
              style={{ fontSize: '13px', padding: '6px 8px' }}
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
              style={{ fontSize: '13px', padding: '6px 8px' }}
            >
              <option value="">— Select —</option>
              {resolvedAdblueOpts.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
