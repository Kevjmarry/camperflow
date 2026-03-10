"use client";

import { use, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import PageContainer from "@/components/PageContainer";

// ─── TODO: move these into messages/en.json + messages/de.json once keys are
//     agreed, then replace with tV("compliance.badge.blocksReadiness") etc.
const COMPLIANCE_BADGE_BLOCKS: Record<string, string> = {
  en: "Blocks readiness",
  de: "Blockiert Bereitschaft",
};
const COMPLIANCE_BADGE_OK: Record<string, string> = {
  en: "Operational",
  de: "Betriebsbereit",
};
const COMPLIANCE_MULTIPLE_HINT: Record<string, string> = {
  en: "Multiple records allowed — use the Notes field to distinguish entries (e.g. country name).",
  de: "Mehrere Einträge erlaubt — nutze das Notizfeld zur Unterscheidung (z.B. Ländername).",
};

const VIGNETTE_SLUG = "motorway-vignette";
const CUSTOM_TYPE_SENTINEL = "__custom__";

const VIGNETTE_COUNTRIES = ["SK", "CZ", "AT", "HU", "SI", "CH", "RO", "BG", "Other"] as const;
type VignetteCountry = (typeof VIGNETTE_COUNTRIES)[number];

// ─── Vehicle ────────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  notes: string | null;
  status: "ready" | "preparing" | "on_rent";
  photo_url: string | null;
}

// ─── Compliance ──────────────────────────────────────────────────────────────

interface ComplianceTypeShape {
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

interface ComplianceRow {
  id: string;
  vehicle_id: string;
  compliance_type_id: string;
  expiry_date: string;
  last_completed_at: string | null;
  notes: string | null;
  compliance_types: ComplianceTypeShape;
}

interface ComplianceRowRaw {
  id: string;
  vehicle_id: string;
  compliance_type_id: string;
  expiry_date: string;
  last_completed_at: string | null;
  notes: string | null;
  compliance_types: ComplianceTypeShape | ComplianceTypeShape[] | null;
}

interface ComplianceType {
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

type ComplianceStatus = "expired" | "expiring" | "ok";

const SYSTEM_SLUG_KEYS: Record<string, string> = {
  "technical-inspection": "technicalInspection",
  "insurance":            "insurance",
  "gas-inspection":       "gasInspection",
  "habitation-service":   "habitationService",
  "general-service":      "generalService",
};

function normalizeComplianceType(
  raw: ComplianceTypeShape | ComplianceTypeShape[] | null
): ComplianceTypeShape | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function normalizeRow(raw: ComplianceRowRaw): ComplianceRow | null {
  const ct = normalizeComplianceType(raw.compliance_types);
  if (!ct) return null;
  return { ...raw, compliance_types: ct };
}

function getComplianceStatus(
  expiryDate: string,
  warningDaysBefore: number
): ComplianceStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return "expired";
  if (diffDays <= warningDaysBefore) return "expiring";
  return "ok";
}

function statusColor(s: ComplianceStatus): string {
  if (s === "expired") return "rgb(var(--error))";
  if (s === "expiring") return "rgb(var(--warning))";
  return "rgb(var(--success))";
}

function statusBg(s: ComplianceStatus): string {
  if (s === "expired") return "rgb(var(--error) / 0.1)";
  if (s === "expiring") return "rgb(var(--warning) / 0.1)";
  return "rgb(var(--success) / 0.1)";
}

// ─── Vignette country field ──────────────────────────────────────────────────

function VignetteCountryField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isKnown = (VIGNETTE_COUNTRIES as readonly string[]).includes(value) && value !== "Other";
  const selectValue: VignetteCountry = isKnown
    ? (value as VignetteCountry)
    : value === ""
    ? "SK"
    : "Other";
  const [customValue, setCustomValue] = useState(
    selectValue === "Other" ? value : ""
  );

  const handleSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as VignetteCountry;
    if (v === "Other") {
      onChange(customValue);
    } else {
      onChange(v);
    }
  };

  const handleCustom = (e: ChangeEvent<HTMLInputElement>) => {
    setCustomValue(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <select
        className="input"
        value={selectValue}
        onChange={handleSelect}
        style={{ width: "100%" }}
      >
        {VIGNETTE_COUNTRIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {selectValue === "Other" && (
        <input
          type="text"
          className="input"
          value={customValue}
          onChange={handleCustom}
          placeholder="Country code or name"
          style={{ width: "100%" }}
        />
      )}
    </div>
  );
}

// ─── Edit compliance modal ───────────────────────────────────────────────────

function EditComplianceModal({
  row,
  onClose,
  onSave,
}: {
  row: ComplianceRow;
  onClose: () => void;
  onSave: (id: string, expiryDate: string, notes: string, customTypeName?: string, customBlocksReadiness?: boolean) => Promise<void>;
}) {
  const t = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");

  const isVignette = row.compliance_types.slug === VIGNETTE_SLUG;
  const isCustomType = !row.compliance_types.is_system;

  const [expiryDate, setExpiryDate] = useState(row.expiry_date);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [customTypeName, setCustomTypeName] = useState(row.compliance_types.name);
  const [customBlocksReadiness, setCustomBlocksReadiness] = useState(row.compliance_types.blocks_readiness);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const typeName =
    row.compliance_types.is_system && SYSTEM_SLUG_KEYS[row.compliance_types.slug]
      ? tSlug(SYSTEM_SLUG_KEYS[row.compliance_types.slug])
      : row.compliance_types.name;

  const handleSave = async () => {
    if (isCustomType && !customTypeName.trim()) {
      setError(t("compliance.editModal.errorNameRequired"));
      return;
    }
    if (!expiryDate) {
      setError(t("compliance.editModal.errorExpiryRequired"));
      return;
    }
    try {
      setSaving(true);
      setError("");
      await onSave(
        row.id,
        expiryDate,
        notes,
        isCustomType ? customTypeName.trim() : undefined,
        isCustomType ? customBlocksReadiness : undefined
      );
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

        {/* Editable name — custom (non-system) types only */}
        {isCustomType && (
          <div>
            <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
              {t("compliance.editModal.nameLabel")}
            </label>
            <input
              type="text"
              className="input"
              value={customTypeName}
              onChange={(e) => setCustomTypeName(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {/* Blocks readiness toggle — custom (non-system) types only */}
        {isCustomType && (
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
              checked={customBlocksReadiness}
              onChange={(e) => setCustomBlocksReadiness(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: "13px", color: "rgb(var(--text))" }}>
              {t("compliance.editModal.blocksReadinessLabel")}
            </span>
          </label>
        )}

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
            {isVignette ? "Country" : t("compliance.editModal.notesLabel")}
          </label>
          {isVignette ? (
            <VignetteCountryField value={notes} onChange={setNotes} />
          ) : (
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ width: "100%", resize: "vertical" }}
            />
          )}
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

// ─── Add compliance modal ────────────────────────────────────────────────────

function AddComplianceModal({
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
  onSave: (
    vehicleId: string,
    complianceTypeId: string | null,
    expiryDate: string,
    notes: string,
    customName?: string,
    customBlocksReadiness?: boolean
  ) => Promise<void>;
}) {
  const t = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");

  const resolveTypeName = (ct: ComplianceType) =>
    ct.is_system && SYSTEM_SLUG_KEYS[ct.slug]
      ? tSlug(SYSTEM_SLUG_KEYS[ct.slug])
      : ct.name;

  const firstTypeId = availableTypes[0]?.id ?? CUSTOM_TYPE_SENTINEL;
  const [typeId, setTypeId] = useState(firstTypeId);
  const [customName, setCustomName] = useState("");
  const [customBlocksReadiness, setCustomBlocksReadiness] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCustom = typeId === CUSTOM_TYPE_SENTINEL;
  const selectedType = isCustom ? null : (availableTypes.find((ct) => ct.id === typeId) ?? null);
  const isVignette = selectedType?.slug === VIGNETTE_SLUG;
  const lang = locale === "de" ? "de" : "en";

  // Reset notes when switching to/from vignette type
  useEffect(() => {
    setNotes(isVignette ? "SK" : "");
  }, [isVignette]);

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-4)",
  };
  const panel: React.CSSProperties = {
    width: "100%",
    maxWidth: 400,
    padding: "var(--space-6)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-4)",
  };

  const handleSave = async () => {
    if (isCustom && !customName.trim()) {
      setError(t("compliance.addModal.errorCustomNameRequired"));
      return;
    }
    if (!isCustom && !typeId) {
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
      await onSave(
        vehicleId,
        isCustom ? null : typeId,
        expiryDate,
        notes,
        isCustom ? customName.trim() : undefined,
        isCustom ? customBlocksReadiness : undefined
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || t("compliance.addModal.errorSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // No available types and custom is the only option — still show the modal
  // (custom is always available).

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="surface" style={panel}>
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
            <option value={CUSTOM_TYPE_SENTINEL}>
              {t("compliance.addModal.customOption")}
            </option>
          </select>
        </div>

        {/* Custom compliance name input */}
        {isCustom && (
          <div>
            <label style={{ fontSize: "12px", color: "rgb(var(--muted))", display: "block", marginBottom: 4 }}>
              {t("compliance.addModal.customNameLabel")}
            </label>
            <input
              type="text"
              className="input"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={t("compliance.addModal.customNamePlaceholder")}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {/* Blocks readiness toggle — custom type only */}
        {isCustom && (
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
              checked={customBlocksReadiness}
              onChange={(e) => setCustomBlocksReadiness(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: "13px", color: "rgb(var(--text))" }}>
              {t("compliance.addModal.customBlocksReadinessLabel")}
            </span>
          </label>
        )}

        {/* Hint for allow_multiple non-vignette types */}
        {!isCustom && selectedType?.allow_multiple && !isVignette && (
          <div
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "rgb(var(--brand) / 0.08)",
              border: "1px solid rgb(var(--brand) / 0.2)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--brand))",
              fontSize: "12px",
            }}
          >
            {COMPLIANCE_MULTIPLE_HINT[lang]}
          </div>
        )}

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
            {isVignette ? "Country" : t("compliance.addModal.notesLabel")}
          </label>
          {isVignette ? (
            <VignetteCountryField value={notes} onChange={setNotes} />
          ) : (
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ width: "100%", resize: "vertical" }}
            />
          )}
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

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id: vehicleId, locale } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const t = useTranslations("staffVehicleEdit");
  const tV = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");

  const justCreated = searchParams.get("created") === "1";

  // ── Vehicle state ──────────────────────────────────────────────────────────
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    registration_plate: "",
    make: "",
    model: "",
    year: "",
    vin: "",
    notes: "",
    status: "ready" as "ready" | "preparing" | "on_rent",
    photo_url: "",
  });

  // ── Compliance state ───────────────────────────────────────────────────────
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [allTypes, setAllTypes] = useState<ComplianceType[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(false);

  const [editingRow, setEditingRow] = useState<ComplianceRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const lang = locale === "de" ? "de" : "en";

  const formatDate = (dateStr: string): string =>
    new Date(dateStr).toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const resolveTypeName = (ct: {
    name: string;
    slug: string;
    is_system: boolean;
    company_id: string | null;
  }): string => {
    if (ct.is_system && SYSTEM_SLUG_KEYS[ct.slug]) {
      return tSlug(SYSTEM_SLUG_KEYS[ct.slug]);
    }
    return ct.name;
  };

  const resolveComplianceDisplayName = (row: ComplianceRow): string => {
    if (row.compliance_types.slug === VIGNETTE_SLUG && row.notes) {
      return `Motorway Vignette — ${row.notes}`;
    }
    return resolveTypeName(row.compliance_types);
  };

  const getComplianceStatusLabel = (s: ComplianceStatus): string => {
    switch (s) {
      case "expired":  return tV("compliance.status.expired");
      case "expiring": return tV("compliance.status.expiring");
      default:         return tV("compliance.status.ok");
    }
  };

  // ── Load vehicle ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError(t("notAuthenticated"));
          setLoading(false);
          setTimeout(() => router.replace(`/${locale}/staff/login`), 1500);
          return;
        }

        const { data: profile } = await supabase
          .from("staff_profiles")
          .select("role, can_manage, company_id")
          .eq("auth_user_id", user.id)
          .single();

        if (!profile || (profile.role !== "admin" && !profile.can_manage)) {
          setError(t("notAllowed"));
          setLoading(false);
          setTimeout(() => router.replace(`/${locale}/staff/vehicles`), 1500);
          return;
        }

        setCompanyId(profile.company_id ?? null);

        const { data: vehicleData, error: vehicleError } = await supabase
          .from("vehicles")
          .select("*")
          .eq("id", vehicleId)
          .single();

        if (vehicleError) {
          setError(vehicleError.code === "PGRST116" ? t("vehicleNotFound") : t("loadFailed"));
          setLoading(false);
          return;
        }

        setVehicle(vehicleData);
        setFormData({
          name: vehicleData.name || "",
          registration_plate: vehicleData.registration_plate || "",
          make: vehicleData.make || "",
          model: vehicleData.model || "",
          year: vehicleData.year?.toString() || "",
          vin: vehicleData.vin || "",
          notes: vehicleData.notes || "",
          status: vehicleData.status || "ready",
          photo_url: vehicleData.photo_url || "",
        });
      } catch {
        setError(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [vehicleId, locale, router, supabase, t]);

  // ── Load compliance (after vehicle resolves) ───────────────────────────────
  useEffect(() => {
    if (!vehicle) return;
    fetchCompliance();
  }, [vehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchCompliance() {
    setComplianceLoading(true);
    try {
      const [{ data: complianceData }, { data: typesData }] = await Promise.all([
        supabase
          .from("vehicle_compliance")
          .select(
            "id, vehicle_id, compliance_type_id, expiry_date, last_completed_at, notes, compliance_types(id, name, slug, warning_days_before, sort_order, is_system, company_id, blocks_readiness, allow_multiple)"
          )
          .eq("vehicle_id", vehicle!.id),
        supabase
          .from("compliance_types")
          .select("id, name, slug, warning_days_before, sort_order, is_system, company_id, blocks_readiness, allow_multiple")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);

      const rows: ComplianceRow[] = ((complianceData ?? []) as ComplianceRowRaw[])
        .map(normalizeRow)
        .filter((r): r is ComplianceRow => r !== null);

      rows.sort((a, b) => a.compliance_types.sort_order - b.compliance_types.sort_order);
      setCompliance(rows);
      setAllTypes((typesData ?? []) as ComplianceType[]);
    } finally {
      setComplianceLoading(false);
    }
  }

  // ── Compliance save handlers ───────────────────────────────────────────────

  // Re-fetch the vehicle row and sync local status state so any DB-trigger-
  // computed readiness change (e.g. from a blocks_readiness update) is
  // reflected immediately without a full page reload.
  const refreshVehicleStatus = async () => {
    const { data } = await supabase
      .from("vehicles")
      .select("status")
      .eq("id", vehicleId)
      .single();
    if (data) {
      setVehicle((prev) => prev ? { ...prev, status: data.status } : prev);
      setFormData((prev) => ({ ...prev, status: data.status }));
    }
  };

  const handleEditSave = async (rowId: string, expiryDate: string, notes: string, customTypeName?: string, customBlocksReadiness?: boolean) => {
    // Update vehicle_compliance row
    const { error } = await supabase
      .from("vehicle_compliance")
      .update({ expiry_date: expiryDate, notes: notes || null })
      .eq("id", rowId);
    if (error) throw new Error(error.message);

    // Update compliance_types fields for custom (non-system) types
    let blocksReadinessChanged = false;
    if (customTypeName !== undefined || customBlocksReadiness !== undefined) {
      const row = compliance.find((r) => r.id === rowId);
      if (row && !row.compliance_types.is_system) {
        const typeUpdates: Record<string, unknown> = {};
        if (customTypeName !== undefined) typeUpdates.name = customTypeName;
        if (customBlocksReadiness !== undefined) {
          typeUpdates.blocks_readiness = customBlocksReadiness;
          blocksReadinessChanged =
            customBlocksReadiness !== row.compliance_types.blocks_readiness;
        }
        const { error: typeError } = await supabase
          .from("compliance_types")
          .update(typeUpdates)
          .eq("id", row.compliance_type_id);
        if (typeError) throw new Error(typeError.message);
      }
    }

    // Apply optimistic local state update
    setCompliance((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              expiry_date: expiryDate,
              notes: notes || null,
              compliance_types:
                !r.compliance_types.is_system
                  ? {
                      ...r.compliance_types,
                      ...(customTypeName !== undefined ? { name: customTypeName } : {}),
                      ...(customBlocksReadiness !== undefined ? { blocks_readiness: customBlocksReadiness } : {}),
                    }
                  : r.compliance_types,
            }
          : r
      )
    );

    // If blocks_readiness changed, re-fetch the vehicle status so any
    // DB-trigger-computed readiness change is reflected in the form immediately.
    if (blocksReadinessChanged) {
      await refreshVehicleStatus();
    }
  };

  const handleAddSave = async (
    vId: string,
    complianceTypeId: string | null,
    expiryDate: string,
    notes: string,
    customTypeName?: string,
    customBlocksReadiness?: boolean
  ) => {
    let resolvedTypeId = complianceTypeId;

    // ── Create custom compliance type if needed ──────────────────────────────
    if (!resolvedTypeId && customTypeName) {
      if (!companyId) throw new Error("Company ID not available");

      const slug = `custom-${Date.now()}`;
      const maxSortOrder = allTypes.reduce((max, ct) => Math.max(max, ct.sort_order), 0);

      const { data: newType, error: typeError } = await supabase
        .from("compliance_types")
        .insert({
          name: customTypeName,
          slug,
          company_id: companyId,
          is_system: false,
          is_active: true,
          blocks_readiness: customBlocksReadiness ?? false,
          allow_multiple: false,
          warning_days_before: 30,
          sort_order: maxSortOrder + 1,
        })
        .select("id, name, slug, warning_days_before, sort_order, is_system, company_id, blocks_readiness, allow_multiple")
        .single();

      if (typeError) throw new Error(typeError.message);

      resolvedTypeId = newType.id;

      // Optimistically add the new type to allTypes so the list stays in sync
      setAllTypes((prev) => [...prev, newType as ComplianceType]);
    }

    if (!resolvedTypeId) throw new Error("No compliance type resolved");

    const { data, error } = await supabase
      .from("vehicle_compliance")
      .insert({
        vehicle_id: vId,
        compliance_type_id: resolvedTypeId,
        expiry_date: expiryDate,
        notes: notes || null,
      })
      .select(
        "id, vehicle_id, compliance_type_id, expiry_date, last_completed_at, notes, compliance_types(id, name, slug, warning_days_before, sort_order, is_system, company_id, blocks_readiness, allow_multiple)"
      )
      .single();

    if (error) throw new Error(error.message);
    const normalized = normalizeRow(data as ComplianceRowRaw);
    if (!normalized) throw new Error("Failed to normalize compliance row");

    setCompliance((prev) => {
      const next = [...prev, normalized];
      next.sort((a, b) => a.compliance_types.sort_order - b.compliance_types.sort_order);
      return next;
    });
  };

  const handleDeleteRow = async (rowId: string) => {
    setDeletingRowId(rowId);
    try {
      const { error } = await supabase
        .from("vehicle_compliance")
        .delete()
        .eq("id", rowId);
      if (error) throw new Error(error.message);
      setCompliance((prev) => prev.filter((r) => r.id !== rowId));
    } finally {
      setDeletingRowId(null);
      setConfirmDeleteRowId(null);
    }
  };

  // ── Vehicle form handlers ──────────────────────────────────────────────────

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFileName(null);
      return;
    }
    setSelectedFileName(file.name);
    setUploading(true);
    setError(null);
    try {
      const filePath = `${vehicleId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("vehicle-photos")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from("vehicle-photos")
        .getPublicUrl(filePath);
      setFormData((prev) => ({ ...prev, photo_url: publicUrl }));
    } catch {
      setError(t("photoUploadFailed"));
      setSelectedFileName(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("vehicles")
        .update({
          name: formData.name,
          registration_plate: formData.registration_plate,
          make: formData.make || null,
          model: formData.model || null,
          year: formData.year ? parseInt(formData.year) : null,
          vin: formData.vin || null,
          notes: formData.notes || null,
          status: formData.status,
          photo_url: formData.photo_url || null,
        })
        .eq("id", vehicleId);
      if (updateError) throw updateError;
      router.push(`/${locale}/staff/vehicles`);
      router.refresh();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirmDelete"))) return;
    setDeleting(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", vehicleId);
      if (deleteError) throw deleteError;
      router.push(`/${locale}/staff/vehicles`);
      router.refresh();
    } catch {
      setError(t("deleteFailed"));
      setDeleting(false);
    }
  };

  // ── Shared style objects ───────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "var(--space-3)",
    fontSize: "14px",
    border: "1px solid rgb(var(--border))",
    borderRadius: "var(--radius)",
    background: "rgb(var(--background))",
    color: "rgb(var(--text))",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "14px",
    fontWeight: 500,
    color: "rgb(var(--text))",
    marginBottom: "var(--space-2)",
  };

  const errorBoxStyle: React.CSSProperties = {
    padding: "var(--space-4)",
    background: "rgb(var(--error) / 0.1)",
    border: "1px solid rgb(var(--error) / 0.3)",
    borderRadius: "var(--radius)",
    color: "rgb(var(--error))",
    fontSize: "14px",
  };

  // Single-record types: exclude once tracked. allow_multiple types: always available.
  const trackedSingleTypeIds = new Set(
    compliance
      .filter((r) => !r.compliance_types.allow_multiple)
      .map((r) => r.compliance_type_id)
  );
  const availableToAdd = allTypes.filter(
    (ct) => ct.allow_multiple || !trackedSingleTypeIds.has(ct.id)
  );

  // ── Early returns ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ textAlign: "center", color: "rgb(var(--muted))" }}>
            {t("loading")}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !vehicle) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <Link
                href={`/${locale}/staff/vehicles`}
                style={{
                  fontSize: "14px",
                  color: "rgb(var(--brand))",
                  textDecoration: "none",
                  marginBottom: "var(--space-2)",
                  display: "inline-block",
                }}
              >
                {t("backToVehicles")}
              </Link>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {t("title")}
              </h1>
            </div>
            <div style={errorBoxStyle}>{error}</div>
          </div>
        </div>
      </PageContainer>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <>
      {editingRow && (
        <EditComplianceModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSave={handleEditSave}
        />
      )}

      {showAddModal && (
        <AddComplianceModal
          vehicleId={vehicle.id}
          availableTypes={availableToAdd}
          locale={locale}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddSave}
        />
      )}

      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

            {/* Header */}
            <div>
              <Link
                href={`/${locale}/staff/vehicles`}
                style={{
                  fontSize: "14px",
                  color: "rgb(var(--brand))",
                  textDecoration: "none",
                  marginBottom: "var(--space-2)",
                  display: "inline-block",
                }}
              >
                {t("backToVehicles")}
              </Link>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {t("title")}
              </h1>
            </div>

            {/* Created-success banner */}
            {justCreated && (
              <div
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  background: "rgb(var(--success) / 0.1)",
                  border: "1px solid rgb(var(--success) / 0.3)",
                  borderRadius: "var(--radius)",
                  color: "rgb(var(--success))",
                  fontSize: "14px",
                }}
              >
                {t("createdBanner")}
              </div>
            )}

            {error && <div style={errorBoxStyle}>{error}</div>}

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
            >
              {/* Name */}
              <div>
                <label htmlFor="name" style={labelStyle}>{t("nameLabel")}</label>
                <input
                  id="name" name="name" type="text"
                  value={formData.name} onChange={handleChange}
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
                  value={formData.registration_plate} onChange={handleChange}
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
                    value={formData.make} onChange={handleChange}
                    placeholder={t("makePlaceholder")} style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="model" style={labelStyle}>{t("modelLabel")}</label>
                  <input
                    id="model" name="model" type="text"
                    value={formData.model} onChange={handleChange}
                    placeholder={t("modelPlaceholder")} style={inputStyle}
                  />
                </div>
              </div>

              {/* Year / Status */}
              <div
                className="grid-two-col"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}
              >
                <div>
                  <label htmlFor="year" style={labelStyle}>{t("yearLabel")}</label>
                  <input
                    id="year" name="year" type="number"
                    value={formData.year} onChange={handleChange}
                    placeholder={t("yearPlaceholder")} style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="status" style={labelStyle}>{t("statusLabel")}</label>
                  <select
                    id="status" name="status"
                    value={formData.status} onChange={handleChange} style={inputStyle}
                  >
                    <option value="ready">{t("statusReady")}</option>
                    <option value="preparing">{t("statusPreparing")}</option>
                    <option value="on_rent">{t("statusOnRent")}</option>
                  </select>
                </div>
              </div>

              {/* VIN */}
              <div>
                <label htmlFor="vin" style={labelStyle}>{t("vinLabel")}</label>
                <input
                  id="vin" name="vin" type="text"
                  value={formData.vin} onChange={handleChange}
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
                  onChange={handleFileChange} disabled={uploading}
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
                  value={formData.photo_url} onChange={handleChange}
                  placeholder={t("photoUrlPlaceholder")} style={inputStyle}
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" style={labelStyle}>{t("notesLabel")}</label>
                <textarea
                  id="notes" name="notes"
                  value={formData.notes} onChange={handleChange}
                  placeholder={t("notesPlaceholder")} rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              {/* ── Compliance section ───────────────────────────────────── */}
              <div
                style={{
                  borderTop: "1px solid rgb(var(--border))",
                  paddingTop: "var(--space-6)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-4)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "var(--space-2)",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))" }}>
                    {tV("compliance.title")}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "13px", padding: "6px 14px" }}
                    onClick={() => setShowAddModal(true)}
                  >
                    {tV("compliance.addButton")}
                  </button>
                </div>

                {complianceLoading ? (
                  <div style={{ fontSize: "14px", color: "rgb(var(--muted))", padding: "var(--space-4) 0" }}>
                    {tV("compliance.loading")}
                  </div>
                ) : compliance.length === 0 ? (
                  <div style={{ fontSize: "14px", color: "rgb(var(--muted))", padding: "var(--space-2) 0" }}>
                    {tV("compliance.empty")}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {/* Table header */}
                    <div
                      className="compliance-table-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 140px 120px 150px",
                        gap: "var(--space-3)",
                        padding: "0 var(--space-3) var(--space-2)",
                        borderBottom: "1px solid rgb(var(--border))",
                      }}
                    >
                      {[
                        tV("compliance.table.type"),
                        tV("compliance.table.expiryDate"),
                        tV("compliance.table.status"),
                        "",
                      ].map((h, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "rgb(var(--muted))",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {h}
                        </div>
                      ))}
                    </div>

                    {/* Rows */}
                    {compliance.map((row) => {
                      const cs = getComplianceStatus(
                        row.expiry_date,
                        row.compliance_types.warning_days_before
                      );
                      const blocksReadiness = row.compliance_types.blocks_readiness;
                      return (
                        <div
                          key={row.id}
                          className="compliance-table-row"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 140px 120px 150px",
                            gap: "var(--space-3)",
                            padding: "var(--space-3)",
                            borderRadius: "var(--radius)",
                            alignItems: "center",
                            background:
                              cs === "expired"
                                ? "rgb(var(--error) / 0.04)"
                                : cs === "expiring"
                                ? "rgb(var(--warning) / 0.04)"
                                : "transparent",
                          }}
                        >
                          <div style={{ fontSize: "14px", color: "rgb(var(--text))", fontWeight: 500 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                              <span>{resolveComplianceDisplayName(row)}</span>
                              {/* blocks_readiness badge */}
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "1px 7px",
                                  borderRadius: "var(--radius)",
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  letterSpacing: "0.03em",
                                  background: blocksReadiness
                                    ? "rgb(var(--error) / 0.1)"
                                    : "rgb(var(--muted) / 0.12)",
                                  color: blocksReadiness
                                    ? "rgb(var(--error))"
                                    : "rgb(var(--muted))",
                                  border: blocksReadiness
                                    ? "1px solid rgb(var(--error) / 0.25)"
                                    : "1px solid rgb(var(--border))",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {blocksReadiness
                                  ? COMPLIANCE_BADGE_BLOCKS[lang]
                                  : COMPLIANCE_BADGE_OK[lang]}
                              </span>
                            </div>
                            {/* Show notes for non-vignette rows only */}
                            {row.notes && row.compliance_types.slug !== VIGNETTE_SLUG && (
                              <div style={{ fontSize: "12px", color: "rgb(var(--muted))", fontWeight: 400, marginTop: 2 }}>
                                {row.notes}
                              </div>
                            )}
                          </div>

                          <div style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                            {formatDate(row.expiry_date)}
                          </div>

                          <div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: "var(--radius)",
                                background: statusBg(cs),
                                color: statusColor(cs),
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              {getComplianceStatusLabel(cs)}
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", alignItems: "center" }}>
                            {confirmDeleteRowId === row.id ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: "12px", padding: "4px 8px" }}
                                  disabled={deletingRowId === row.id}
                                  onClick={() => setConfirmDeleteRowId(null)}
                                >
                                  {tV("compliance.table.deleteCancel")}
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    fontSize: "12px",
                                    padding: "4px 8px",
                                    border: "1px solid rgb(var(--error))",
                                    borderRadius: "var(--radius)",
                                    background: "transparent",
                                    color: "rgb(var(--error))",
                                    cursor: deletingRowId === row.id ? "not-allowed" : "pointer",
                                    opacity: deletingRowId === row.id ? 0.6 : 1,
                                    fontWeight: 500,
                                  }}
                                  disabled={deletingRowId === row.id}
                                  onClick={() => handleDeleteRow(row.id)}
                                >
                                  {deletingRowId === row.id ? "…" : tV("compliance.table.deleteConfirm")}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  style={{
                                    fontSize: "12px",
                                    padding: "4px 10px",
                                    border: "1px solid rgb(var(--border))",
                                    borderRadius: "var(--radius)",
                                    background: "transparent",
                                    color: "rgb(var(--text))",
                                    cursor: "pointer",
                                    fontWeight: 500,
                                  }}
                                  onClick={() => setEditingRow(row)}
                                >
                                  {tV("compliance.table.editButton")}
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    fontSize: "12px",
                                    padding: "4px 10px",
                                    border: "1px solid rgb(var(--error) / 0.5)",
                                    borderRadius: "var(--radius)",
                                    background: "transparent",
                                    color: "rgb(var(--error))",
                                    cursor: "pointer",
                                    fontWeight: 500,
                                  }}
                                  onClick={() => setConfirmDeleteRowId(row.id)}
                                >
                                  {tV("compliance.table.deleteButton")}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* ── End compliance section ───────────────────────────────── */}

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
                  onClick={handleDelete}
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
          </div>
        </div>
      </PageContainer>

      {/* Responsive grid collapse */}
      <style>{`
        @media (max-width: 768px) {
          .grid-two-col {
            grid-template-columns: 1fr !important;
          }
          .compliance-table-row {
            grid-template-columns: 1fr 1fr !important;
            row-gap: var(--space-2) !important;
          }
        }
      `}</style>
    </>
  );
}