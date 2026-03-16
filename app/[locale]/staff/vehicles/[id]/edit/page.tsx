"use client";

import { use, useEffect, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import PageContainer from "@/components/PageContainer";
import VehicleEditForm from "@/components/vehicles/VehicleEditForm";
import type {
  VehicleFormData,
  ComplianceRow,
  ComplianceRowRaw,
  ComplianceType,
  ComplianceTypeShape,
} from "@/components/vehicles/VehicleEditForm";

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
  operational_hold: boolean;
  hold_reason: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

  const [formData, setFormData] = useState<VehicleFormData>({
    name: "",
    registration_plate: "",
    make: "",
    model: "",
    year: "",
    vin: "",
    notes: "",
    photo_url: "",
    operational_hold: false,
    hold_reason: "",
  });

  // ── Calendar sync state ────────────────────────────────────────────────────
  const [calendarSyncUrl, setCalendarSyncUrl] = useState("");
  const [calendarSyncInterval, setCalendarSyncInterval] = useState("none");
  const [calendarLastSyncedAt, setCalendarLastSyncedAt] = useState<string | null>(null);
  const [calendarLastSyncStatus, setCalendarLastSyncStatus] = useState<string | null>(null);
  const [calendarLastSyncError, setCalendarLastSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; blocked: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Compliance state ───────────────────────────────────────────────────────
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [allTypes, setAllTypes] = useState<ComplianceType[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(false);

  const [editingRow, setEditingRow] = useState<ComplianceRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(null);

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

        const [{ data: vehicleData, error: vehicleError }, { data: calendarSource }] =
          await Promise.all([
            supabase.from("vehicles").select("*").eq("id", vehicleId).single(),
            supabase
              .from("vehicle_calendar_sources")
              .select("ical_url, sync_interval, last_synced_at, last_sync_status, last_sync_error")
              .eq("vehicle_id", vehicleId)
              .maybeSingle(),
          ]);

        if (vehicleError) {
          setError(vehicleError.code === "PGRST116" ? t("vehicleNotFound") : t("loadFailed"));
          setLoading(false);
          return;
        }

        setCalendarSyncUrl(calendarSource?.ical_url ?? "");
        setCalendarSyncInterval(calendarSource?.sync_interval ?? "none");
        setCalendarLastSyncedAt(calendarSource?.last_synced_at ?? null);
        setCalendarLastSyncStatus(calendarSource?.last_sync_status ?? null);
        setCalendarLastSyncError(calendarSource?.last_sync_error ?? null);
        setVehicle(vehicleData);
        setFormData({
          name: vehicleData.name || "",
          registration_plate: vehicleData.registration_plate || "",
          make: vehicleData.make || "",
          model: vehicleData.model || "",
          year: vehicleData.year?.toString() || "",
          vin: vehicleData.vin || "",
          notes: vehicleData.notes || "",
          photo_url: vehicleData.photo_url || "",
          operational_hold: vehicleData.operational_hold ?? false,
          hold_reason: vehicleData.hold_reason ?? "",
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

  const refreshVehicleStatus = async () => {
    const { data } = await supabase
      .from("vehicles")
      .select("status")
      .eq("id", vehicleId)
      .single();
    if (data) {
      setVehicle((prev) => prev ? { ...prev, status: data.status } : prev);
    }
  };

  const handleEditSave = async (rowId: string, expiryDate: string, notes: string, customTypeName?: string, customBlocksReadiness?: boolean) => {
    const { error } = await supabase
      .from("vehicle_compliance")
      .update({ expiry_date: expiryDate, notes: notes || null })
      .eq("id", rowId);
    if (error) throw new Error(error.message);

    if (customTypeName !== undefined || customBlocksReadiness !== undefined) {
      const row = compliance.find((r) => r.id === rowId);
      if (row && !row.compliance_types.is_system) {
        const typeUpdates: Record<string, unknown> = {};
        if (customTypeName !== undefined) typeUpdates.name = customTypeName;
        if (customBlocksReadiness !== undefined) typeUpdates.blocks_readiness = customBlocksReadiness;
        const { error: typeError } = await supabase
          .from("compliance_types")
          .update(typeUpdates)
          .eq("id", row.compliance_type_id);
        if (typeError) throw new Error(typeError.message);
      }
    }

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

    await refreshVehicleStatus();
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

    if (!resolvedTypeId && customTypeName) {
      if (!companyId) throw new Error("Company ID not available");

      const normalized = customTypeName
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

      const { data: existingType } = await supabase
        .from("compliance_types")
        .select("id, name, slug, warning_days_before, sort_order, is_system, company_id, blocks_readiness, allow_multiple")
        .eq("company_id", companyId)
        .eq("normalized_name", normalized)
        .eq("is_active", true)
        .maybeSingle();

      if (existingType) {
        resolvedTypeId = existingType.id;
        setAllTypes((prev) =>
          prev.some((t) => t.id === existingType.id)
            ? prev
            : [...prev, existingType as ComplianceType]
        );
      } else {
        const maxSortOrder = allTypes.reduce((max, ct) => Math.max(max, ct.sort_order), 0);
        const slug = `custom-${Date.now()}`;

        const { data: newType, error: insertError } = await supabase
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

        if (insertError) {
          const { data: racedType, error: refetchError } = await supabase
            .from("compliance_types")
            .select("id, name, slug, warning_days_before, sort_order, is_system, company_id, blocks_readiness, allow_multiple")
            .eq("company_id", companyId)
            .eq("normalized_name", normalized)
            .eq("is_active", true)
            .maybeSingle();

          if (refetchError || !racedType) throw new Error(insertError.message);

          resolvedTypeId = racedType.id;
          setAllTypes((prev) =>
            prev.some((t) => t.id === racedType.id)
              ? prev
              : [...prev, racedType as ComplianceType]
          );
        } else {
          resolvedTypeId = newType.id;
          setAllTypes((prev) => [...prev, newType as ComplianceType]);
        }
      }
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
    const normalizedRow = normalizeRow(data as ComplianceRowRaw);
    if (!normalizedRow) throw new Error("Failed to normalize compliance row");

    setCompliance((prev) => {
      const next = [...prev, normalizedRow];
      next.sort((a, b) => a.compliance_types.sort_order - b.compliance_types.sort_order);
      return next;
    });

    await refreshVehicleStatus();
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
      await refreshVehicleStatus();
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
          photo_url: formData.photo_url || null,
          operational_hold: formData.operational_hold,
          hold_reason: formData.operational_hold && formData.hold_reason.trim()
            ? formData.hold_reason.trim()
            : null,
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

  // ── Calendar sync handlers ─────────────────────────────────────────────────

  const handleSyncIntervalChange = async (interval: string) => {
    setCalendarSyncInterval(interval);
    // Persist immediately — only if a calendar source record exists (ical_url set)
    if (calendarSyncUrl.trim()) {
      await supabase
        .from("vehicle_calendar_sources")
        .upsert(
          { vehicle_id: vehicleId, ical_url: calendarSyncUrl.trim(), sync_interval: interval, updated_at: new Date().toISOString() },
          { onConflict: "vehicle_id" },
        );
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch(`/api/staff/vehicles/${vehicleId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync_interval: calendarSyncInterval }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Sync failed (HTTP ${res.status})`);
      }
      setSyncResult({ created: data.created, updated: data.updated, blocked: data.blocked });
      setCalendarLastSyncedAt(data.syncedAt ?? new Date().toISOString());
      setCalendarLastSyncStatus("success");
      setCalendarLastSyncError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setSyncError(msg);
      setCalendarLastSyncStatus("error");
      setCalendarLastSyncError(msg);
      setCalendarLastSyncedAt(new Date().toISOString());
    } finally {
      setSyncing(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const trackedSingleTypeIds = new Set(
    compliance
      .filter((r) => !r.compliance_types.allow_multiple)
      .map((r) => r.compliance_type_id)
  );
  const availableToAdd = allTypes.filter(
    (ct) => ct.allow_multiple || !trackedSingleTypeIds.has(ct.id)
  );

  // ── Style objects (page-level only) ───────────────────────────────────────

  const errorBoxStyle: CSSProperties = {
    padding: "var(--space-4)",
    background: "rgb(var(--error) / 0.1)",
    border: "1px solid rgb(var(--error) / 0.3)",
    borderRadius: "var(--radius)",
    color: "rgb(var(--error))",
    fontSize: "14px",
  };

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

          <VehicleEditForm
            formData={formData}
            setFormData={setFormData}
            onChange={handleChange}
            onFileChange={handleFileChange}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            saving={saving}
            deleting={deleting}
            uploading={uploading}
            selectedFileName={selectedFileName}
            compliance={compliance}
            complianceLoading={complianceLoading}
            availableToAdd={availableToAdd}
            vehicleId={vehicle.id}
            locale={locale}
            editingRow={editingRow}
            onEditRow={setEditingRow}
            showAddModal={showAddModal}
            onShowAddModal={setShowAddModal}
            deletingRowId={deletingRowId}
            confirmDeleteRowId={confirmDeleteRowId}
            onConfirmDeleteRow={setConfirmDeleteRowId}
            onDeleteRow={handleDeleteRow}
            onEditSave={handleEditSave}
            onAddSave={handleAddSave}
            initialCalendarSyncUrl={calendarSyncUrl}
            syncInterval={calendarSyncInterval}
            onSyncIntervalChange={handleSyncIntervalChange}
            onSyncNow={handleSyncNow}
            syncing={syncing}
            lastSyncedAt={calendarLastSyncedAt}
            lastSyncStatus={calendarLastSyncStatus}
            lastSyncError={calendarLastSyncError}
            syncResult={syncResult}
            syncResultError={syncError}
          />

        </div>
      </div>

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
    </PageContainer>
  );
}
