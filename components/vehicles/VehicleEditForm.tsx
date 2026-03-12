"use client";

import type { CSSProperties, ChangeEvent, FormEvent, Dispatch, SetStateAction } from "react";
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
  notes: string;
  photo_url: string;
  operational_hold: boolean;
  hold_reason: string;
}

export interface ComplianceTypeShape {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
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
  expiry_date: string;
  last_completed_at: string | null;
  notes: string | null;
  compliance_types: ComplianceTypeShape;
}

export interface ComplianceRowRaw {
  id: string;
  vehicle_id: string;
  compliance_type_id: string;
  expiry_date: string;
  last_completed_at: string | null;
  notes: string | null;
  compliance_types: ComplianceTypeShape | ComplianceTypeShape[] | null;
}

export interface ComplianceType {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
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
    customBlocksReadiness?: boolean
  ) => Promise<void>;
  onAddSave: (
    vId: string,
    complianceTypeId: string | null,
    expiryDate: string,
    notes: string,
    customTypeName?: string,
    customBlocksReadiness?: boolean
  ) => Promise<void>;
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
}: Props) {
  const t = useTranslations("staffVehicleEdit");

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
          id="photo" type="file" accept="image/*"
          onChange={onFileChange} disabled={uploading}
          style={{ ...inputStyle, cursor: uploading ? "not-allowed" : "pointer" }}
        />
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