"use client";

import { useState, useEffect, useRef } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import VehicleComplianceSection from "@/components/vehicles/VehicleComplianceSection";

// ─── Shared types (exported for use in page) ─────────────────────────────────

export interface VehicleFormData {
  name: string;
  registration_plate: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  length_m: string;
  width_m: string;
  height_m: string;
  notes: string;
  photo_url: string;
  operational_hold: boolean;
  hold_reason: string;
  youtube_url: string;
}

export interface ComplianceTypeShape {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
  warning_km_before: number | null;
  sort_order: number;
  is_system: boolean;
  company_id: string | null;
  blocks_readiness: boolean;
  allow_multiple: boolean;
}

export interface ComplianceRow {
  id: string;
  vehicle_id: string;
  compliance_type_id: string;
  expiry_date: string | null;
  last_completed_at: string | null;
  notes: string | null;
  service_due_odometer_km: number | null;
  warning_days_before_override: number | null;
  warning_km_before_override: number | null;
  compliance_types: ComplianceTypeShape;
}

export interface ComplianceRowRaw {
  id: string;
  vehicle_id: string;
  compliance_type_id: string;
  expiry_date: string | null;
  last_completed_at: string | null;
  notes: string | null;
  service_due_odometer_km: number | null;
  warning_days_before_override: number | null;
  warning_km_before_override: number | null;
  compliance_types: ComplianceTypeShape | ComplianceTypeShape[] | null;
}

export interface ComplianceType {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
  warning_km_before: number | null;
  sort_order: number;
  is_system: boolean;
  company_id: string | null;
  blocks_readiness: boolean;
  allow_multiple: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  // Form data
  formData: VehicleFormData;
  setFormData: Dispatch<SetStateAction<VehicleFormData>>;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
  uploading: boolean;
  selectedFileName: string | null;
  // Compliance
  compliance: ComplianceRow[];
  complianceLoading: boolean;
  availableToAdd: ComplianceType[];
  vehicleId: string;
  locale: string;
  editingRow: ComplianceRow | null;
  onEditRow: (row: ComplianceRow | null) => void;
  showAddModal: boolean;
  onShowAddModal: (show: boolean) => void;
  deletingRowId: string | null;
  confirmDeleteRowId: string | null;
  onConfirmDeleteRow: (id: string | null) => void;
  onDeleteRow: (rowId: string) => Promise<void>;
  onEditSave: (
    rowId: string,
    expiryDate: string,
    notes: string,
    customTypeName?: string,
    customBlocksReadiness?: boolean,
    serviceDueOdometerKm?: number | null,
    warningDaysOverride?: number | null,
    warningKmOverride?: number | null
  ) => Promise<void>;
  onAddSave: (
    vId: string,
    complianceTypeId: string | null,
    expiryDate: string,
    notes: string,
    customTypeName?: string,
    customBlocksReadiness?: boolean,
    serviceDueOdometerKm?: number | null,
    warningDaysOverride?: number | null,
    warningKmOverride?: number | null
  ) => Promise<void>;
  latestOdometer?: number | null;
  // Calendar sync
  initialCalendarSyncUrl?: string;
  syncInterval?: string;
  onSyncIntervalChange?: (interval: string) => void;
  onSyncNow?: () => Promise<void>;
  syncing?: boolean;
  lastSyncedAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  syncResult?: { created: number; updated: number; blocked: number } | null;
  syncResultError?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VehicleEditForm({
  formData,
  setFormData,
  onChange,
  onFileChange,
  onSubmit,
  onDelete,
  saving,
  deleting,
  uploading,
  selectedFileName,
  compliance,
  complianceLoading,
  availableToAdd,
  vehicleId,
  locale,
  editingRow,
  onEditRow,
  showAddModal,
  onShowAddModal,
  deletingRowId,
  confirmDeleteRowId,
  onConfirmDeleteRow,
  onDeleteRow,
  onEditSave,
  onAddSave,
  latestOdometer,
  initialCalendarSyncUrl = "",
  syncInterval = "none",
  onSyncIntervalChange,
  onSyncNow,
  syncing = false,
  lastSyncedAt = null,
  lastSyncStatus = null,
  lastSyncError = null,
  syncResult = null,
  syncResultError = null,
}: Props) {
  const t = useTranslations("staffVehicleEdit");
  const tCal = useTranslations("vehicleDetail.vehicleCalendar");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [calendarSyncUrl, setCalendarSyncUrl] = useState(initialCalendarSyncUrl);

  // Sync when the page finishes loading the saved URL asynchronously
  useEffect(() => {
    if (initialCalendarSyncUrl) setCalendarSyncUrl(initialCalendarSyncUrl);
  }, [initialCalendarSyncUrl]);

  // ── Style objects ────────────────────────────────────────────────────────

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "var(--space-3)",
    fontSize: "14px",
    border: "1px solid rgb(var(--border))",
    borderRadius: "var(--radius)",
    background: "rgb(var(--background))",
    color: "rgb(var(--text))",
  };

  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: "14px",
    fontWeight: 500,
    color: "rgb(var(--text))",
    marginBottom: "var(--space-2)",
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  function formatSyncTime(iso: string): string {
    try {
      return new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  const intervalOptions = [
    { value: "none",  label: tCal("intervalNone") },
    { value: "1h",   label: tCal("interval1h") },
    { value: "6h",   label: tCal("interval6h") },
    { value: "12h",  label: tCal("interval12h") },
    { value: "24h",  label: tCal("interval24h") },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
    >
      {/* Name */}
      <div>
        <label htmlFor="name" style={labelStyle}>{t("nameLabel")}</label>
        <input
          id="name" name="name" type="text"
          value={formData.name} onChange={onChange}
          placeholder={t("namePlaceholder")} required style={inputStyle}
        />
      </div>

      {/* Registration plate */}
      <div>
        <label htmlFor="registration_plate" style={labelStyle}>
          {t("registrationPlateLabel")}
        </label>
        <input
          id="registration_plate" name="registration_plate" type="text"
          value={formData.registration_plate} onChange={onChange}
          placeholder={t("registrationPlatePlaceholder")} required style={inputStyle}
        />
      </div>

      {/* Make / Model */}
      <div
        className="grid-two-col"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}
      >
        <div>
          <label htmlFor="make" style={labelStyle}>{t("makeLabel")}</label>
          <input
            id="make" name="make" type="text"
            value={formData.make} onChange={onChange}
            placeholder={t("makePlaceholder")} style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="model" style={labelStyle}>{t("modelLabel")}</label>
          <input
            id="model" name="model" type="text"
            value={formData.model} onChange={onChange}
            placeholder={t("modelPlaceholder")} style={inputStyle}
          />
        </div>
      </div>

      {/* Year */}
      <div>
        <label htmlFor="year" style={labelStyle}>{t("yearLabel")}</label>
        <input
          id="year" name="year" type="number"
          value={formData.year} onChange={onChange}
          placeholder={t("yearPlaceholder")} style={inputStyle}
        />
      </div>

      {/* VIN */}
      <div>
        <label htmlFor="vin" style={labelStyle}>{t("vinLabel")}</label>
        <input
          id="vin" name="vin" type="text"
          value={formData.vin} onChange={onChange}
          placeholder={t("vinPlaceholder")} style={inputStyle}
        />
      </div>

      {/* Dimensions */}
      <div
        className="grid-two-col"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)" }}
      >
        <div>
          <label htmlFor="length_m" style={labelStyle}>{t("lengthLabel")}</label>
          <input
            id="length_m" name="length_m" type="number" step="0.01" min="0"
            value={formData.length_m} onChange={onChange}
            placeholder={t("lengthPlaceholder")} style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="width_m" style={labelStyle}>{t("widthLabel")}</label>
          <input
            id="width_m" name="width_m" type="number" step="0.01" min="0"
            value={formData.width_m} onChange={onChange}
            placeholder={t("widthPlaceholder")} style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="height_m" style={labelStyle}>{t("heightLabel")}</label>
          <input
            id="height_m" name="height_m" type="number" step="0.01" min="0"
            value={formData.height_m} onChange={onChange}
            placeholder={t("heightPlaceholder")} style={inputStyle}
          />
        </div>
      </div>

      {/* Photo upload */}
      <div>
        <label htmlFor="photo" style={labelStyle}>{t("photoLabel")}</label>
        {formData.photo_url && (
          <div style={{ marginBottom: "var(--space-3)" }}>
            <img
              src={formData.photo_url}
              alt={formData.name || t("photoPreviewAlt")}
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "auto",
                borderRadius: "var(--radius)",
                border: "1px solid rgb(var(--border))",
              }}
            />
          </div>
        )}
        <input
          ref={fileInputRef}
          id="photo" type="file" accept="image/*"
          onChange={onFileChange} disabled={uploading}
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn btn-secondary"
          style={{ fontSize: "14px", cursor: uploading ? "not-allowed" : "pointer" }}
        >
          {t("chooseFile")}
        </button>
        <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginTop: "var(--space-2)" }}>
          {uploading ? (
            <span>{t("uploading")}…</span>
          ) : selectedFileName ? (
            <span>{t("photoSelectedPrefix")}: {selectedFileName}</span>
          ) : (
            <span>{t("photoHint")}</span>
          )}
        </div>
      </div>

      {/* Photo URL */}
      <div>
        <label htmlFor="photo_url" style={labelStyle}>{t("photoUrlLabel")}</label>
        <input
          id="photo_url" name="photo_url" type="text"
          value={formData.photo_url} onChange={onChange}
          placeholder={t("photoUrlPlaceholder")} style={inputStyle}
        />
      </div>

      {/* YouTube URL */}
      <div>
        <label htmlFor="youtube_url" style={labelStyle}>YouTube URL (optional)</label>
        <input
          id="youtube_url" name="youtube_url" type="url"
          value={formData.youtube_url} onChange={onChange}
          placeholder="https://www.youtube.com/watch?v=..." style={inputStyle}
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" style={labelStyle}>{t("notesLabel")}</label>
        <textarea
          id="notes" name="notes"
          value={formData.notes} onChange={onChange}
          placeholder={t("notesPlaceholder")} rows={4}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {/* ── Operational hold ──────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid rgb(var(--border))",
          paddingTop: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            id="operational_hold"
            checked={formData.operational_hold}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, operational_hold: e.target.checked }))
            }
            style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
          />
          <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
            {t("operationalHoldLabel")}
          </span>
        </label>

        {formData.operational_hold && (
          <div>
            <label htmlFor="hold_reason" style={{ ...labelStyle, marginBottom: "var(--space-1)" }}>
              {t("holdReasonLabel")}
            </label>
            <input
              type="text"
              id="hold_reason"
              name="hold_reason"
              value={formData.hold_reason}
              onChange={onChange}
              placeholder={t("holdReasonPlaceholder")}
              style={inputStyle}
            />
          </div>
        )}
      </div>
      {/* ── End operational hold ─────────────────────────────────────────── */}

      {/* ── Compliance section ────────────────────────────────────────────── */}
      <VehicleComplianceSection
        compliance={compliance}
        complianceLoading={complianceLoading}
        availableToAdd={availableToAdd}
        vehicleId={vehicleId}
        locale={locale}
        latestOdometer={latestOdometer}
        editingRow={editingRow}
        onEditRow={onEditRow}
        showAddModal={showAddModal}
        onShowAddModal={onShowAddModal}
        deletingRowId={deletingRowId}
        confirmDeleteRowId={confirmDeleteRowId}
        onConfirmDeleteRow={onConfirmDeleteRow}
        onDeleteRow={onDeleteRow}
        onEditSave={onEditSave}
        onAddSave={onAddSave}
      />
      {/* ── End compliance section ────────────────────────────────────────── */}

      {/* ── Calendar Sync ─────────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid rgb(var(--border))",
          paddingTop: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 600, color: "rgb(var(--text))" }}>
          {tCal("title")}
        </div>

        {/* URL input + manual import button */}
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="url"
            value={calendarSyncUrl}
            onChange={(e) => setCalendarSyncUrl(e.target.value)}
            placeholder={tCal("urlPlaceholder")}
            style={{ ...inputStyle, flex: "1 1 280px" }}
          />
          <Link
            href={
              calendarSyncUrl.trim()
                ? `/${locale}/staff/bookings/import?vehicleId=${vehicleId}&iCalUrl=${encodeURIComponent(calendarSyncUrl.trim())}`
                : `/${locale}/staff/bookings/import?vehicleId=${vehicleId}`
            }
            className="btn btn-secondary"
            style={{ fontSize: "14px", whiteSpace: "nowrap", textDecoration: "none" }}
          >
            {tCal("importButton")}
          </Link>
        </div>

        {/* Auto-sync interval + Sync now */}
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: "1 1 200px" }}>
            <label style={{ fontSize: "13px", color: "rgb(var(--muted))", fontWeight: 500 }}>
              {tCal("autoSyncInterval")}
            </label>
            <select
              value={syncInterval}
              onChange={(e) => onSyncIntervalChange?.(e.target.value)}
              style={{ ...inputStyle, width: "auto" }}
            >
              {intervalOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onSyncNow}
            disabled={syncing || !calendarSyncUrl.trim()}
            className="btn btn-secondary"
            style={{
              fontSize: "14px",
              whiteSpace: "nowrap",
              opacity: syncing || !calendarSyncUrl.trim() ? 0.5 : 1,
              cursor: syncing || !calendarSyncUrl.trim() ? "not-allowed" : "pointer",
              alignSelf: "flex-end",
            }}
          >
            {syncing ? tCal("syncing") : tCal("syncNow")}
          </button>
        </div>

        {/* Last sync status */}
        {lastSyncedAt && (
          <div style={{ fontSize: "13px", color: "rgb(var(--muted))", display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
            <span>{tCal("lastSynced")}: {formatSyncTime(lastSyncedAt)}</span>
            {lastSyncStatus === "success" && (
              <span style={{ color: "rgb(var(--success))", fontWeight: 500 }}>
                {tCal("syncSuccess")}
              </span>
            )}
            {lastSyncStatus === "error" && (
              <span style={{ color: "rgb(var(--error))", fontWeight: 500 }}>
                {tCal("syncError")}
              </span>
            )}
          </div>
        )}

        {/* In-session sync result (after Sync now) */}
        {syncResult && (
          <div
            style={{
              fontSize: "13px",
              padding: "var(--space-2) var(--space-3)",
              background: "rgb(var(--success) / 0.08)",
              border: "1px solid rgb(var(--success) / 0.25)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--success))",
            }}
          >
            {tCal("syncResultDetail", {
              created: syncResult.created,
              updated: syncResult.updated,
              blocked: syncResult.blocked,
            })}
          </div>
        )}

        {/* In-session sync error */}
        {syncResultError && (
          <div
            style={{
              fontSize: "13px",
              padding: "var(--space-2) var(--space-3)",
              background: "rgb(var(--error) / 0.08)",
              border: "1px solid rgb(var(--error) / 0.25)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--error))",
            }}
          >
            {syncResultError}
          </div>
        )}

        {/* Hint when no URL yet */}
        {!calendarSyncUrl.trim() && (
          <div style={{ fontSize: "12px", color: "rgb(var(--muted))" }}>
            {tCal("noUrlToSync")}
          </div>
        )}
      </div>
      {/* ── End Calendar Sync ─────────────────────────────────────────────── */}

      {/* Save / Delete */}
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
        <button
          type="submit"
          disabled={saving || deleting}
          className="btn btn-primary"
          style={{
            flex: 1,
            opacity: saving || deleting ? 0.6 : 1,
            cursor: saving || deleting ? "not-allowed" : "pointer",
          }}
        >
          {saving ? t("saving") : t("saveButton")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={saving || deleting}
          style={{
            padding: "var(--space-3) var(--space-4)",
            fontSize: "14px",
            fontWeight: 500,
            border: "1px solid rgb(var(--error))",
            borderRadius: "var(--radius)",
            background: "transparent",
            color: "rgb(var(--error))",
            cursor: saving || deleting ? "not-allowed" : "pointer",
            opacity: saving || deleting ? 0.6 : 1,
          }}
        >
          {deleting ? t("deleting") : t("deleteButton")}
        </button>
      </div>
    </form>
  );
}
