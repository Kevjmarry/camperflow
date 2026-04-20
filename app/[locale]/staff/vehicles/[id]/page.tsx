// app/[locale]/staff/vehicles/[id]/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import EditComplianceModal, { type ComplianceRow } from "@/components/vehicles/EditComplianceModal";
import AddComplianceModal, { type ComplianceType } from "@/components/vehicles/AddComplianceModal";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  notes: string | null;
  photo_url: string | null;
  status: "ready" | "preparing" | "on_rent";
  latest_odometer: number | null;
}

interface ComplianceTypeShape {
  id: string;
  name: string;
  slug: string;
  warning_days_before: number;
  sort_order: number;
  is_system: boolean;
  company_id: string | null;
}

// Raw shape returned by Supabase — relation may come back as array or object
interface ComplianceRowRaw {
  id: string;
  vehicle_id: string;
  compliance_type_id: string;
  expiry_date: string;
  last_completed_at: string | null;
  notes: string | null;
  compliance_types: ComplianceTypeShape | ComplianceTypeShape[] | null;
}

type ComplianceStatus = "expired" | "expiring" | "ok";

interface VehicleChecklist {
  id: string;
  checklist_type: string;
  status: "pending" | "in_progress" | "completed";
  template_name: string | null;
}

// Slugs that have translation keys in compliance.systemTypes.*
const SYSTEM_SLUG_KEYS: Record<string, string> = {
  "technical-inspection": "technicalInspection",
  "insurance":            "insurance",
  "gas-inspection":       "gasInspection",
  "habitation-service":   "habitationService",
  "general-service":      "generalService",
};

const isValidUUID = (id: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/** Normalize the Supabase relation — could be object, array, or null */
function normalizeComplianceType(
  raw: ComplianceTypeShape | ComplianceTypeShape[] | null
): ComplianceTypeShape | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/** Normalize a raw row into the typed ComplianceRow shape */
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

// ------------------------------------------------------------
// Main page
// ------------------------------------------------------------
export default function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");
  const tCal = useTranslations("vehicleDetail.vehicleCalendar");

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const [companyId, setCompanyId] = useState<string | null>(null);

  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [allTypes, setAllTypes] = useState<ComplianceType[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(true);

  const [vehicleChecklists, setVehicleChecklists] = useState<VehicleChecklist[]>([]);
  const [checklistsLoading, setChecklistsLoading] = useState(false);

  const [vehicleIssues, setVehicleIssues] = useState<{ id: string; title: string | null; description: string | null; blocking: boolean; createdAt: string | null; checklistInstanceId: string | null }[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [resolvingIssueId, setResolvingIssueId] = useState<string | null>(null);

  const [editingRow, setEditingRow] = useState<ComplianceRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [calendarSyncUrl, setCalendarSyncUrl] = useState("");

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

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

  useEffect(() => {
    if (!isValidUUID(id)) {
      router.replace(`/${locale}/staff/vehicles`);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError("");
        setNotFound(false);

        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace(`/${locale}/staff/login`);
          return;
        }

        const { data: profile } = await supabase
          .from("staff_profiles")
          .select("role, can_manage, company_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        setCanManage(
          profile ? profile.role === "admin" || profile.can_manage === true : false
        );
        setCompanyId(profile?.company_id ?? null);

        const { data: vehicleData, error: vehicleError } = await supabase
          .from("vehicles")
          .select("id, name, registration_plate, make, model, year, vin, notes, photo_url, status, latest_odometer")
          .eq("id", id)
          .single();

        if (vehicleError) {
          if (vehicleError.code === "PGRST116") {
            setNotFound(true);
            return;
          }
          setError(vehicleError.message || t("errorLoad"));
          return;
        }

        setVehicle(vehicleData as Vehicle);
      } catch (err: any) {
        setError(err?.message || t("errorLoad"));
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [id, locale, router, supabase]);

  useEffect(() => {
    if (!vehicle) return;

    const fetchCompliance = async () => {
      try {
        setComplianceLoading(true);

        const [{ data: complianceData }, { data: typesData }] = await Promise.all([
          supabase
            .from("vehicle_compliance")
            .select(
              "id, vehicle_id, compliance_type_id, expiry_date, last_completed_at, notes, compliance_types(id, name, slug, warning_days_before, sort_order, is_system, company_id)"
            )
            .eq("vehicle_id", vehicle.id),
          supabase
            .from("compliance_types")
            .select("id, name, slug, warning_days_before, sort_order, is_system, company_id")
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
    };

    fetchCompliance();
  }, [vehicle, supabase]);

  useEffect(() => {
    if (!vehicle) return;
    const fetchIssues = async () => {
      setIssuesLoading(true);
      try {
        const { data: issues } = await supabase
          .from('vehicle_issues')
          .select('id, created_at, source_checklist_instance_id, source_checklist_item_id')
          .eq('vehicle_id', vehicle.id)
          .eq('resolved', false);
        if (!issues || issues.length === 0) { setVehicleIssues([]); return; }

        // Prefer durable source column; reverse-lookup only for legacy rows.
        const byIssue = new Map<string, { title: string | null; description: string | null; blocking: boolean; checklistInstanceId: string | null }>();
        const legacyIssueIds = (issues as any[])
          .filter((i) => !i.source_checklist_instance_id)
          .map((i) => i.id);
        if (legacyIssueIds.length > 0) {
          const { data: linkedItems } = await supabase
            .from('checklist_instance_items')
            .select('linked_vehicle_issue_id, instance_id, issue_title, issue_description, issue_blocking')
            .in('linked_vehicle_issue_id', legacyIssueIds);
          for (const item of (linkedItems ?? []) as any[]) {
            if (item.linked_vehicle_issue_id && !byIssue.has(item.linked_vehicle_issue_id)) {
              byIssue.set(item.linked_vehicle_issue_id, {
                title: item.issue_title ?? null,
                description: item.issue_description ?? null,
                blocking: item.issue_blocking === true,
                checklistInstanceId: item.instance_id ?? null,
              });
            }
          }
        }
        // For new-style issues, fetch the item data via source_checklist_item_id
        const newStyleIssues = (issues as any[]).filter((i) => i.source_checklist_item_id);
        if (newStyleIssues.length > 0) {
          const itemIds = newStyleIssues.map((i: any) => i.source_checklist_item_id);
          const { data: sourceItems } = await supabase
            .from('checklist_instance_items')
            .select('id, issue_title, issue_description, issue_blocking')
            .in('id', itemIds);
          const sourceMap = new Map((sourceItems ?? []).map((it: any) => [it.id, it]));
          for (const issue of newStyleIssues) {
            const src = sourceMap.get(issue.source_checklist_item_id);
            byIssue.set(issue.id, {
              title: src?.issue_title ?? null,
              description: src?.issue_description ?? null,
              blocking: src?.issue_blocking === true,
              checklistInstanceId: issue.source_checklist_instance_id ?? null,
            });
          }
        }
        setVehicleIssues((issues as any[]).map((i) => ({
          id: i.id,
          title: byIssue.get(i.id)?.title ?? null,
          description: byIssue.get(i.id)?.description ?? null,
          blocking: byIssue.get(i.id)?.blocking ?? false,
          createdAt: i.created_at ?? null,
          checklistInstanceId: byIssue.get(i.id)?.checklistInstanceId ?? null,
        })));
      } finally {
        setIssuesLoading(false);
      }
    };
    fetchIssues();
  }, [vehicle, supabase]);

  useEffect(() => {
    if (!vehicle || !companyId) return;

    const loadVehicleChecklists = async () => {
      setChecklistsLoading(true);
      try {
        // 1. Fetch active vehicle-scoped templates for this company
        const { data: templates } = await supabase
          .from("checklist_templates")
          .select("id, name, type")
          .eq("company_id", companyId)
          .eq("scope", "vehicle")
          .eq("active", true);

        if (!templates || templates.length === 0) {
          setVehicleChecklists([]);
          return;
        }

        // 2. Fetch existing instances for this vehicle
        const { data: existing } = await supabase
          .from("checklist_instances")
          .select("id, template_id, checklist_type, status")
          .eq("vehicle_id", vehicle.id)
          .is("booking_id", null);

        const existingByTemplateId = new Map(
          (existing || []).map((i: any) => [i.template_id, i])
        );

        // 3. Create missing instances (with items)
        for (const template of templates) {
          if (existingByTemplateId.has(template.id)) continue;

          const { data: newInstance } = await supabase
            .from("checklist_instances")
            .insert({
              company_id: companyId,
              vehicle_id: vehicle.id,
              template_id: template.id,
              checklist_type: template.type,
              status: "pending",
            })
            .select("id")
            .single();

          if (newInstance) {
            const { data: templateItems } = await supabase
              .from("checklist_template_items")
              .select("id")
              .eq("template_id", template.id);

            if (templateItems && templateItems.length > 0) {
              await supabase.from("checklist_instance_items").insert(
                templateItems.map((item: any) => ({
                  instance_id: newInstance.id,
                  template_item_id: item.id,
                  checked: false,
                }))
              );
            }

            existingByTemplateId.set(template.id, {
              id: newInstance.id,
              template_id: template.id,
              checklist_type: template.type,
              status: "pending",
            });
          }
        }

        // 4. Build ordered list matching template order
        const result: VehicleChecklist[] = templates
          .map((t) => {
            const inst = existingByTemplateId.get(t.id);
            if (!inst) return null;
            return {
              id: inst.id,
              checklist_type: inst.checklist_type as string,
              status: inst.status as VehicleChecklist["status"],
              template_name: t.name as string | null,
            };
          })
          .filter((x): x is VehicleChecklist => x !== null);

        setVehicleChecklists(result);
      } finally {
        setChecklistsLoading(false);
      }
    };

    loadVehicleChecklists();
  }, [vehicle, companyId, supabase]);

  const handleEditSave = async (rowId: string, expiryDate: string, notes: string) => {
    const { error } = await supabase
      .from("vehicle_compliance")
      .update({ expiry_date: expiryDate, notes: notes || null })
      .eq("id", rowId);

    if (error) throw new Error(error.message);

    setCompliance((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, expiry_date: expiryDate, notes: notes || null } : r
      )
    );
  };

  const handleAddSave = async (
    vehicleId: string,
    complianceTypeId: string,
    expiryDate: string,
    notes: string
  ) => {
    const { data, error } = await supabase
      .from("vehicle_compliance")
      .insert({
        vehicle_id: vehicleId,
        compliance_type_id: complianceTypeId,
        expiry_date: expiryDate,
        notes: notes || null,
      })
      .select(
        "id, vehicle_id, compliance_type_id, expiry_date, last_completed_at, notes, compliance_types(id, name, slug, warning_days_before, sort_order, is_system, company_id)"
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

  const handleResolveIssue = async (issueId: string) => {
    setResolvingIssueId(issueId);
    try {
      const { error } = await supabase
        .from("vehicle_issues")
        .update({ resolved: true })
        .eq("id", issueId);
      if (error) throw new Error(error.message);
      setVehicleIssues((prev) => prev.filter((i) => i.id !== issueId));
    } finally {
      setResolvingIssueId(null);
    }
  };

  const trackedTypeIds = new Set(compliance.map((r) => r.compliance_type_id));
  const availableToAdd = allTypes.filter((ct) => !trackedTypeIds.has(ct.id));

  // Mirror the vehicles-list derived status: a ready vehicle with any
  // incomplete vehicle-scope checklist should display as 'preparing'.
  const derivedStatus: Vehicle["status"] =
    vehicle?.status === "ready" &&
    !checklistsLoading &&
    vehicleChecklists.some(
      (c) => c.status === "in_progress"
    )
      ? "preparing"
      : (vehicle?.status ?? "ready");

  const getVehicleStatusLabel = (status: string) => {
    switch (status) {
      case "ready":     return t("status.ready");
      case "preparing": return t("status.preparing");
      case "on_rent":   return t("status.onRent");
      default:          return status;
    }
  };

  const getVehicleStatusColor = (status: string) => {
    switch (status) {
      case "ready":     return "rgb(var(--success))";
      case "preparing": return "rgb(var(--warning))";
      case "on_rent":   return "rgb(var(--brand))";
      default:          return "rgb(var(--text))";
    }
  };

  const getChecklistStatusLabel = (status: VehicleChecklist["status"]) => {
    switch (status) {
      case "completed":   return t("checklists.completed");
      case "in_progress": return t("checklists.inProgress");
      default:            return t("checklists.notStarted");
    }
  };

  const getChecklistActionLabel = (status: VehicleChecklist["status"]) => {
    switch (status) {
      case "completed":   return t("checklists.view");
      case "in_progress": return t("checklists.continue");
      default:            return t("checklists.open");
    }
  };

  const getComplianceStatusLabel = (s: ComplianceStatus) => {
    switch (s) {
      case "expired":  return t("compliance.status.expired");
      case "expiring": return t("compliance.status.expiring");
      default:         return t("compliance.status.ok");
    }
  };

  if (notFound) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface page-surface">
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("notFound.title")}
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {t("notFound.description")}
            </p>
            <Link
              href={`/${locale}/staff/vehicles`}
              className="btn btn-primary"
              style={{ marginTop: "var(--space-6)" }}
            >
              {t("notFound.backButton")}
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface page-surface">
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
        <div className="surface page-surface">
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
                {t("pageTitle")}
              </h1>
            </div>
            <div
              style={{
                padding: "var(--space-4)",
                background: "rgb(var(--error) / 0.1)",
                border: "1px solid rgb(var(--error) / 0.3)",
                borderRadius: "var(--radius)",
                color: "rgb(var(--error))",
                fontSize: "14px",
              }}
            >
              {error || t("errorLoad")}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <>
      {editingRow && (
        <EditComplianceModal
          row={editingRow}
          locale={locale}
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
        <div className="surface page-surface">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "var(--space-4)",
                flexWrap: "wrap",
              }}
            >
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    flexWrap: "wrap",
                  }}
                >
                  <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                    {vehicle.name}
                  </h1>
                  <span
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius)",
                      background: `${getVehicleStatusColor(derivedStatus)}15`,
                      color: getVehicleStatusColor(derivedStatus),
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {getVehicleStatusLabel(derivedStatus)}
                  </span>
                </div>
                <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
                  {vehicle.registration_plate}
                </p>
              </div>

              {canManage && (
                <Link
                  href={`/${locale}/staff/vehicles/${vehicle.id}/edit`}
                  className="btn btn-primary"
                >
                  {t("editButton")}
                </Link>
              )}
            </div>

            {/* Photo + Fields */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "var(--space-6)",
              }}
            >
              <div className="surface" style={{ padding: "var(--space-6)" }}>
                <div
                  style={{
                    fontSize: "14px",
                    color: "rgb(var(--muted))",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  {t("fields.photo")}
                </div>
                {vehicle.photo_url ? (
                  <img
                    src={vehicle.photo_url}
                    alt={vehicle.name}
                    style={{
                      width: "100%",
                      height: 240,
                      objectFit: "cover",
                      borderRadius: "var(--radius)",
                      border: "1px solid rgb(var(--border))",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: 240,
                      borderRadius: "var(--radius)",
                      border: "1px solid rgb(var(--border))",
                      background: "rgb(var(--muted) / 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "rgb(var(--muted))",
                      fontSize: "14px",
                    }}
                  >
                    {t("fields.noPhoto")}
                  </div>
                )}
              </div>

              <div className="surface" style={{ padding: "var(--space-6)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <Field label={t("fields.make")}  value={vehicle.make  || "—"} />
                  <Field label={t("fields.model")} value={vehicle.model || "—"} />
                  <Field label={t("fields.year")}  value={vehicle.year ? String(vehicle.year) : "—"} />
                  <Field label={t("fields.vin")}   value={vehicle.vin   || "—"} />
                  <Field label={t("fields.latestOdometer")} value={vehicle.latest_odometer != null ? `${vehicle.latest_odometer.toLocaleString(locale)} km` : "—"} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="surface" style={{ padding: "var(--space-6)" }}>
              <div
                style={{
                  fontSize: "14px",
                  color: "rgb(var(--muted))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("fields.notes")}
              </div>
              <div
                style={{
                  color: "rgb(var(--text))",
                  whiteSpace: "pre-wrap",
                  fontSize: "14px",
                }}
              >
                {vehicle.notes && vehicle.notes.trim().length > 0
                  ? vehicle.notes
                  : t("fields.noNotes")}
              </div>
            </div>

            {/* Compliance */}
            <div id="compliance" className="surface" style={{ padding: "var(--space-6)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "var(--space-4)",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))" }}>
                  {t("compliance.title")}
                </div>
                {canManage && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: "13px", padding: "6px 14px" }}
                    onClick={() => setShowAddModal(true)}
                  >
                    {t("compliance.addButton")}
                  </button>
                )}
              </div>

              {vehicle.latest_odometer != null && (
                <div style={{ fontSize: "13px", color: "rgb(var(--muted))", marginBottom: "var(--space-3)" }}>
                  {t("fields.latestOdometer")}: <span style={{ fontWeight: 600, color: "rgb(var(--text))" }}>{vehicle.latest_odometer.toLocaleString(locale)} km</span>
                </div>
              )}

              {complianceLoading ? (
                <div
                  style={{
                    fontSize: "14px",
                    color: "rgb(var(--muted))",
                    padding: "var(--space-4) 0",
                  }}
                >
                  {t("compliance.loading")}
                </div>
              ) : compliance.length === 0 ? (
                <div
                  style={{
                    fontSize: "14px",
                    color: "rgb(var(--muted))",
                    padding: "var(--space-2) 0",
                  }}
                >
                  {t("compliance.empty")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {/* Table header */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 140px 120px 80px",
                      gap: "var(--space-3)",
                      padding: "0 var(--space-3) var(--space-2)",
                      borderBottom: "1px solid rgb(var(--border))",
                    }}
                  >
                    {[
                      t("compliance.table.type"),
                      t("compliance.table.expiryDate"),
                      t("compliance.table.status"),
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

                  {compliance.map((row) => {
                    const cs = getComplianceStatus(
                      row.expiry_date,
                      row.compliance_types.warning_days_before
                    );
                    return (
                      <div
                        key={row.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 140px 120px 80px",
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
                        <div
                          style={{
                            fontSize: "14px",
                            color: "rgb(var(--text))",
                            fontWeight: 500,
                          }}
                        >
                          {resolveTypeName(row.compliance_types)}
                          {row.notes && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "rgb(var(--muted))",
                                fontWeight: 400,
                                marginTop: 2,
                              }}
                            >
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

                        <div style={{ textAlign: "right" }}>
                          {canManage && (
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: "12px", padding: "4px 10px" }}
                              onClick={() => setEditingRow(row)}
                            >
                              {t("compliance.table.editButton")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Open Vehicle Issues */}
            <div id="issues" className="surface" style={{ padding: "var(--space-6)" }}>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                {t("issues.title")}
              </div>
              {issuesLoading ? (
                <div style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>{t("issues.loading")}</div>
              ) : vehicleIssues.length === 0 ? (
                <div style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>{t("issues.empty")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {vehicleIssues.map((issue) => {
                    const cardStyle: React.CSSProperties = {
                      padding: "var(--space-4)",
                      background: issue.blocking ? "rgb(var(--error) / 0.06)" : "rgb(var(--warning) / 0.06)",
                      border: `1px solid ${issue.blocking ? "rgb(var(--error) / 0.25)" : "rgb(var(--warning) / 0.25)"}`,
                      borderRadius: "var(--radius)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-1)",
                    };
                    const isResolving = resolvingIssueId === issue.id;

                    const issueHeader = (
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                          {issue.title || t("issues.fallbackTitle")}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "var(--radius)",
                            background: issue.blocking ? "rgb(var(--error) / 0.15)" : "rgb(var(--warning) / 0.15)",
                            color: issue.blocking ? "rgb(var(--error))" : "rgb(var(--warning))",
                          }}
                        >
                          {issue.blocking ? t("issues.blocking") : t("issues.attention")}
                        </span>
                      </div>
                    );

                    const issueBody = (
                      <>
                        {issue.description && (
                          <div style={{ fontSize: "13px", color: "rgb(var(--muted))" }}>{issue.description}</div>
                        )}
                        {issue.createdAt && (
                          <div style={{ fontSize: "12px", color: "rgb(var(--muted))" }}>
                            {t("issues.reported", { date: new Date(issue.createdAt).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) })}
                          </div>
                        )}
                      </>
                    );

                    if (issue.checklistInstanceId) {
                      return (
                        <Link
                          key={issue.id}
                          href={`/${locale}/staff/checklists/${issue.checklistInstanceId}`}
                          style={{ textDecoration: "none", ...cardStyle }}
                        >
                          {issueHeader}
                          {issueBody}
                          <div style={{ fontSize: "11px", color: "rgb(var(--brand))", marginTop: "var(--space-1)" }}>{t("issues.viewChecklist")}</div>
                        </Link>
                      );
                    }

                    return (
                      <div key={issue.id} style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
                            {issueHeader}
                            {issueBody}
                          </div>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "13px", padding: "4px 12px", flexShrink: 0, opacity: isResolving ? 0.6 : 1 }}
                            disabled={isResolving}
                            onClick={() => handleResolveIssue(issue.id)}
                          >
                            {isResolving ? t("issues.resolving") : t("issues.markResolved")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Vehicle Checklists */}
            <div className="surface" style={{ padding: "var(--space-6)" }}>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                {t("checklists.title")}
              </div>
              {checklistsLoading ? (
                <div style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                  {t("checklists.loading")}
                </div>
              ) : vehicleChecklists.length === 0 ? (
                <div style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                  {t("checklists.empty")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {vehicleChecklists.map((checklist) => (
                    <div
                      key={checklist.id}
                      style={{
                        padding: "var(--space-4)",
                        background: "rgb(var(--border) / 0.3)",
                        borderRadius: "var(--radius)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "var(--space-3)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))", marginBottom: "var(--space-1)" }}>
                          {checklist.template_name || checklist.checklist_type}
                        </div>
                        <div>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "var(--radius)",
                              fontSize: "12px",
                              fontWeight: 500,
                              background: checklist.status === "completed"
                                ? "rgb(var(--success) / 0.12)"
                                : checklist.status === "in_progress"
                                ? "rgb(var(--warning) / 0.12)"
                                : "rgb(var(--muted) / 0.15)",
                              color: checklist.status === "completed"
                                ? "rgb(var(--success))"
                                : checklist.status === "in_progress"
                                ? "rgb(var(--warning))"
                                : "rgb(var(--muted))",
                            }}
                          >
                            {getChecklistStatusLabel(checklist.status)}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/${locale}/staff/checklists/${checklist.id}?from=vehicle&vehicleId=${vehicle.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: "14px", padding: "var(--space-2) var(--space-4)", minHeight: "36px" }}
                      >
                        {getChecklistActionLabel(checklist.status)}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Calendar Sync */}
            <div className="surface" style={{ padding: "var(--space-6)" }}>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                {tCal("title")}
              </div>
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 280px" }}>
                  <label
                    htmlFor="calendar-sync-url"
                    style={{ fontSize: "13px", fontWeight: 500, color: "rgb(var(--text))", display: "block", marginBottom: "var(--space-2)" }}
                  >
                    {tCal("title")}
                  </label>
                  <input
                    id="calendar-sync-url"
                    type="url"
                    value={calendarSyncUrl}
                    onChange={(e) => setCalendarSyncUrl(e.target.value)}
                    placeholder={tCal("urlPlaceholder")}
                    style={{
                      width: "100%",
                      padding: "var(--space-2) var(--space-3)",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "14px",
                      color: "rgb(var(--text))",
                      background: "rgb(var(--surface))",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!calendarSyncUrl.trim()}
                  style={{ fontSize: "14px", whiteSpace: "nowrap" }}
                >
                  {tCal("connect")}
                </button>
              </div>
            </div>

          </div>
        </div>
      </PageContainer>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", color: "rgb(var(--text))", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
