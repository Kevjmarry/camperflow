"use client";

import { FormEvent, ChangeEvent } from "react";

type VehicleStatus = 'ready' | 'preparing' | 'on_rent';

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  status: VehicleStatus | null;
}

export interface BookingFormData {
  status: string;
  pickup_at: string;
  return_at: string;
  vehicle_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  notes: string;
}

export interface ExtrasData {
  coffee_machine: boolean;
  paddleboard: boolean;
  electric_grill: boolean;
  electric_paddle_board_pump: boolean;
}

export const EMPTY_EXTRAS: ExtrasData = {
  coffee_machine: false,
  paddleboard: false,
  electric_grill: false,
  electric_paddle_board_pump: false,
};

const EXTRAS_KEYS: { key: keyof ExtrasData; labelKey: string }[] = [
  { key: 'coffee_machine',            labelKey: 'extras.coffeeMachine' },
  { key: 'paddleboard',               labelKey: 'extras.paddleboard' },
  { key: 'electric_grill',            labelKey: 'extras.electricGrill' },
  { key: 'electric_paddle_board_pump', labelKey: 'extras.electricPaddleBoardPump' },
];

interface Props {
  formData: BookingFormData;
  extras: ExtrasData;
  vehicles: Vehicle[];
  saving: boolean;
  error: string;
  conflictWarning: string;
  isNoCustomerRequired: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onExtrasChange: (key: keyof ExtrasData, value: boolean) => void;
  onSubmit: (e: FormEvent) => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function BookingEditForm({
  formData,
  extras,
  vehicles,
  saving,
  error,
  conflictWarning,
  isNoCustomerRequired,
  onChange,
  onExtrasChange,
  onSubmit,
  onDelete,
  t,
}: Props) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
          {t("section.bookingDetails")}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
          <div>
            <label htmlFor="status" className="label">
              {t("field.status")}
            </label>
            <select
              id="status"
              name="status"
              className="input"
              value={formData.status}
              onChange={onChange}
              style={{ width: '100%' }}
            >
              <option value="draft">{t("status.pending")}</option>
              <option value="confirmed">{t("status.confirmed")}</option>
              <option value="blocked">{t("status.blocked")}</option>
              <option value="on_rent">{t("status.onRent")}</option>
              <option value="completed">{t("status.completed")}</option>
              <option value="cancelled">{t("status.cancelled")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="pickup_at" className="label">
              {t("field.pickupDateTime")}
            </label>
            <input
              id="pickup_at"
              name="pickup_at"
              type="datetime-local"
              className="input"
              value={formData.pickup_at}
              onChange={onChange}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label htmlFor="return_at" className="label">
              {t("field.returnDateTime")}
            </label>
            <input
              id="return_at"
              name="return_at"
              type="datetime-local"
              className="input"
              value={formData.return_at}
              onChange={onChange}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label htmlFor="vehicle_id" className="label">
              {t("field.vehicle")}
            </label>
            <select
              id="vehicle_id"
              name="vehicle_id"
              className="input"
              value={formData.vehicle_id}
              onChange={onChange}
              style={{ width: '100%' }}
            >
              <option value="">{t("vehicle.unassigned")}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} ({vehicle.registration_plate})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
          {t("section.customerDetails")}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
          <div>
            <label htmlFor="customer_name" className="label">
              {t("field.customerName")}
              {!isNoCustomerRequired && <span style={{ color: 'rgb(var(--error))' }}> *</span>}
            </label>
            <input
              id="customer_name"
              name="customer_name"
              type="text"
              className="input"
              value={formData.customer_name}
              onChange={onChange}
              required={!isNoCustomerRequired}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label htmlFor="customer_phone" className="label">
              {t("field.phoneNumber")}
              {!isNoCustomerRequired && <span style={{ color: 'rgb(var(--error))' }}> *</span>}
            </label>
            <input
              id="customer_phone"
              name="customer_phone"
              type="tel"
              className="input"
              value={formData.customer_phone}
              onChange={onChange}
              required={!isNoCustomerRequired}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label htmlFor="customer_email" className="label">
              {t("field.emailOptional")}
            </label>
            <input
              id="customer_email"
              name="customer_email"
              type="email"
              className="input"
              value={formData.customer_email}
              onChange={onChange}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="label">
          {t("field.notes")}
        </label>
        <textarea
          id="notes"
          name="notes"
          className="input"
          value={formData.notes}
          onChange={onChange}
          rows={4}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {/* ── Extras ────────────────────────────────────────────────────────── */}
      <div style={{
        paddingTop: 'var(--space-2)',
        borderTop: '1px solid rgb(var(--border) / 0.4)',
      }}>
        <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
          {t("section.extras")}
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-3)',
        }}>
          {EXTRAS_KEYS.map(({ key, labelKey }) => (
            <label
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={extras[key]}
                onChange={(e) => onExtrasChange(key, e.target.checked)}
              />
              <span style={{ fontSize: '14px', color: 'rgb(var(--text))' }}>{t(labelKey)}</span>
            </label>
          ))}
        </div>
      </div>

      {conflictWarning && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgb(var(--warning) / 0.1)',
          border: '1px solid rgb(var(--warning) / 0.3)',
          borderRadius: 'var(--radius)',
          color: 'rgb(var(--warning))',
          fontSize: '14px'
        }}>
          {conflictWarning}
        </div>
      )}

      {error && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgb(var(--error) / 0.1)',
          border: '1px solid rgb(var(--error) / 0.3)',
          borderRadius: 'var(--radius)',
          color: 'rgb(var(--error))',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: 'var(--space-3)',
        paddingTop: 'var(--space-2)',
        flexWrap: 'wrap'
      }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !!conflictWarning}
          style={{
            flex: 1,
            minWidth: '120px',
            opacity: (saving || conflictWarning) ? 0.6 : 1,
            cursor: (saving || conflictWarning) ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? t("action.saving") : t("action.saveChanges")}
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="btn btn-secondary"
          disabled={saving}
          style={{
            minWidth: '120px',
            color: 'rgb(var(--error))',
            borderColor: 'rgb(var(--error))'
          }}
        >
          {t("action.delete")}
        </button>
      </div>
    </form>
  );
}
