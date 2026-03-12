"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComplianceType {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
  sort_order: number;
  is_system: boolean;
  company_id: string | null;
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

export default function AddComplianceModal({
  vehicleId,
  availableTypes,
  locale,
  onClose,
  onSave,
}: {
  vehicleId: string;
  availableTypes: ComplianceType[];
  locale: string;
  onClose: () => void;
  onSave: (vehicleId: string, complianceTypeId: string, expiryDate: string, notes: string) => Promise<void>;
}) {
  const t = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");

  const resolveTypeName = (ct: ComplianceType) =>
    ct.is_system && SYSTEM_SLUG_KEYS[ct.slug]
      ? tSlug(SYSTEM_SLUG_KEYS[ct.slug])
      : ct.name;

  const [typeId, setTypeId] = useState(availableTypes[0]?.id ?? "");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!typeId) {
      setError(t("compliance.addModal.errorTypeRequired"));
      return;
    }
    if (!expiryDate) {
      setError(t("compliance.addModal.errorExpiryRequired"));
      return;
    }
    try {
      setSaving(true);
      setError("");
      await onSave(vehicleId, typeId, expiryDate, notes);
      onClose();
    } catch (err: any) {
      setError(err?.message || t("compliance.addModal.errorSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (availableTypes.length === 0) {
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
            {t("compliance.addModal.title")}
          </h2>
          <p style={{ color: "rgb(var(--muted))", fontSize: "14px" }}>
            {t("compliance.addModal.allTracked")}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={onClose}>
              {t("compliance.addModal.close")}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          {t("compliance.addModal.title")}
        </h2>

        <div>
          <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
            {t("compliance.addModal.typeLabel")}
          </label>
          <select
            className="input"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            style={{ width: "100%" }}
          >
            {availableTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {resolveTypeName(ct)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
            {t("compliance.addModal.expiryDateLabel")}
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
            {t("compliance.addModal.notesLabel")}
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
            {t("compliance.addModal.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t("compliance.addModal.saving") : t("compliance.addModal.add")}
          </button>
        </div>
      </div>
    </div>
  );
}