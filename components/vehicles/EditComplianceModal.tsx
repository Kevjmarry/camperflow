"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import LocalizedDateInput from "@/components/LocalizedDateInput";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComplianceTypeShape {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
  warning_km_before: number | null;
  sort_order: number;
  is_system: boolean;
  company_id: string | null;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_SLUG_KEYS: Record<string, string> = {
  "technical-inspection": "technicalInspection",
  "insurance":            "insurance",
  "gas-inspection":       "gasInspection",
  "habitation-service":   "habitationService",
  "general-service":      "generalService",
  "engine-service":       "engineService",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditComplianceModal({
  row,
  locale,
  onClose,
  onSave,
}: {
  row: ComplianceRow;
  locale: string;
  onClose: () => void;
  onSave: (id: string, expiryDate: string, notes: string, serviceDueOdometerKm?: number | null, warningDaysOverride?: number | null, warningKmOverride?: number | null) => Promise<void>;
}) {
  const t = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");

  const [expiryDate, setExpiryDate] = useState(row.expiry_date ?? "");
  const [serviceDueKm, setServiceDueKm] = useState(
    row.service_due_odometer_km?.toString() ?? ""
  );
  const [notes, setNotes] = useState(row.notes ?? "");
  const [warnDaysOverride, setWarnDaysOverride] = useState(
    row.warning_days_before_override?.toString() ?? ""
  );
  const [warnKmOverride, setWarnKmOverride] = useState(
    row.warning_km_before_override?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isKmType = row.compliance_types.warning_km_before != null;

  const typeName =
    row.compliance_types.is_system && SYSTEM_SLUG_KEYS[row.compliance_types.slug]
      ? tSlug(SYSTEM_SLUG_KEYS[row.compliance_types.slug])
      : row.compliance_types.name;

  const handleSave = async () => {
    if (isKmType) {
      if (!expiryDate && !serviceDueKm) {
        setError(t("compliance.editModal.errorDateOrKmRequired"));
        return;
      }
    } else if (!expiryDate) {
      setError(t("compliance.editModal.errorExpiryRequired"));
      return;
    }
    const kmValue = serviceDueKm.trim() ? parseInt(serviceDueKm, 10) : null;
    const warnDays = warnDaysOverride.trim() ? parseInt(warnDaysOverride, 10) : null;
    const warnKm = warnKmOverride.trim() ? parseInt(warnKmOverride, 10) : null;
    try {
      setSaving(true);
      setError("");
      await onSave(row.id, expiryDate, notes, kmValue, warnDays, warnKm);
      onClose();
    } catch (err: any) {
      setError(err?.message || t("compliance.editModal.errorSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="surface"
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <h2 style={{ fontSize: "18px", color: "rgb(var(--text))", margin: 0 }}>
          {t("compliance.editModal.title", { name: typeName })}
        </h2>

        <div>
          <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
            {t("compliance.editModal.expiryDateLabel")}{isKmType ? "" : " *"}
          </label>
          <LocalizedDateInput
            className="input"
            value={expiryDate}
            onChange={setExpiryDate}
            style={{ width: "100%" }}
          />
        </div>

        {isKmType && (
          <div>
            <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
              {t("compliance.editModal.serviceDueKmLabel")}
            </label>
            <input
              className="input"
              type="number"
              min="0"
              value={serviceDueKm}
              onChange={(e) => setServiceDueKm(e.target.value)}
              placeholder="e.g. 45000"
              style={{ width: "100%" }}
            />
          </div>
        )}

        <div>
          <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
            {t("compliance.editModal.notesLabel")}
          </label>
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
            {t("compliance.editModal.warningDaysOverrideLabel")}
          </label>
          <input
            className="input"
            type="number"
            min="0"
            value={warnDaysOverride}
            onChange={(e) => setWarnDaysOverride(e.target.value)}
            placeholder={String(row.compliance_types.warning_days_before)}
            style={{ width: "100%" }}
          />
        </div>

        {isKmType && (
          <div>
            <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
              {t("compliance.editModal.warningKmOverrideLabel")}
            </label>
            <input
              className="input"
              type="number"
              min="0"
              value={warnKmOverride}
              onChange={(e) => setWarnKmOverride(e.target.value)}
              placeholder={row.compliance_types.warning_km_before != null ? String(row.compliance_types.warning_km_before) : ""}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "var(--space-3)",
              background: "rgb(var(--error) / 0.1)",
              border: "1px solid rgb(var(--error) / 0.3)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--error))",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t("compliance.editModal.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t("compliance.editModal.saving") : t("compliance.editModal.save")}
          </button>
        </div>
      </div>
    </div>
  );
}