"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComplianceTypeShape {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
  sort_order: number;
  is_system: boolean;
  company_id: string | null;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_SLUG_KEYS: Record<string, string> = {
  "technical-inspection": "technicalInspection",
  "insurance":            "insurance",
  "gas-inspection":       "gasInspection",
  "habitation-service":   "habitationService",
  "general-service":      "generalService",
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
  onSave: (id: string, expiryDate: string, notes: string) => Promise<void>;
}) {
  const t = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");

  const [expiryDate, setExpiryDate] = useState(row.expiry_date);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const typeName =
    row.compliance_types.is_system && SYSTEM_SLUG_KEYS[row.compliance_types.slug]
      ? tSlug(SYSTEM_SLUG_KEYS[row.compliance_types.slug])
      : row.compliance_types.name;

  const handleSave = async () => {
    if (!expiryDate) {
      setError(t("compliance.editModal.errorExpiryRequired"));
      return;
    }
    try {
      setSaving(true);
      setError("");
      await onSave(row.id, expiryDate, notes);
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
            {t("compliance.editModal.expiryDateLabel")}
          </label>
          <input
            type="date"
            className="input"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

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