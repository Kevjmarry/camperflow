// app/[locale]/staff/vehicles/[id]/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import BackLink from "@/components/staff/BackLink";
import EditComplianceModal, { type ComplianceRow } from "@/components/vehicles/EditComplianceModal";
import AddComplianceModal, { type ComplianceType } from "@/components/vehicles/AddComplianceModal";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  vehicle_category: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  notes: string | null;
  photo_url: string | null;
  status: "ready" | "preparing" | "on_rent";
  latest_odometer: number | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  youtube_url: string | null;
}

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

// Raw shape returned by Supabase — relation may come back as array or object
interface ComplianceRowRaw {
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
  "engine-service":       "engineService",
};

function getYouTubeEmbedId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1].split("?")[0] || null;
      return u.searchParams.get("v");
    }
  } catch {
    // not a valid URL
  }
  return null;
}

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
  expiryDate: string | null,
  warningDaysBefore: number,
  latestOdometer?: number | null,
  serviceDueOdometerKm?: number | null,
  warningKmBefore?: number | null
): ComplianceStatus {
  let dateStatus: ComplianceStatus = "ok";
  if (expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays < 0) dateStatus = "expired";
    else if (diffDays <= warningDaysBefore) dateStatus = "expiring";
  }

  let kmStatus: ComplianceStatus = "ok";
  if (serviceDueOdometerKm != null && latestOdometer != null) {
    if (latestOdometer >= serviceDueOdometerKm) kmStatus = "expired";
    else if (warningKmBefore != null && latestOdometer >= serviceDueOdometerKm - warningKmBefore) kmStatus = "expiring";
  }

  if (dateStatus === "expired" || kmStatus === "expired") return "expired";
  if (dateStatus === "expiring" || kmStatus === "expiring") return "expiring";
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

  const [calendarSource, setCalendarSource] = useState<{
    ical_url: string | null;
    sync_interval: string;
    last_synced_at: string | null;
    last_sync_status: string | null;
  } | null>(null);

  // Change this one key to update the displayed sync schedule site-wide (e.g. "interval1h" on Pro).
  const CRON_SCHEDULE_KEY = "cronScheduleLabel" as const;

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(locale, {
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

        const [{ data: vehicleData, error: vehicleError }, { data: calSource }] =
          await Promise.all([
            supabase
              .from("vehicles")
              .select("id, name, registration_plate, vehicle_category, make, model, year, vin, notes, photo_url, status, latest_odometer, length_m, width_m, height_m, youtube_url")
              .eq("id", id)
              .single(),
            supabase
              .from("vehicle_calendar_sources")
              .select("ical_url, sync_interval, last_synced_at, last_sync_status")
              .eq("vehicle_id", id)
              .maybeSingle(),
          ]);

        if (vehicleError) {
          if (vehicleError.code === "PGRST116") {
            setNotFound(true);
            return;
          }
          setError(vehicleError.message || t("errorLoad"));
          return;
        }

        setVehicle(vehicleData as Vehicle);
        setCalendarSource(calSource ?? null);
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
              "id, vehicle_id, compliance_type_id, expiry_date, last_completed_at, notes, service_due_odometer_km, warning_days_before_override, warning_km_before_override, compliance_types(id, name, slug, warning_days_before, warning_km_before, sort_order, is_system, company_id)"
            )
            .eq("vehicle_id", vehicle.id),
          supabase
            .from("compliance_types")
            .select("id, name, slug, warning_days_before, warning_km_before, sort_order, is_system, company_id")
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

  const handleEditSave = async (rowId: string, expiryDate: string, notes: string, serviceDueOdometerKm?: number | null, warningDaysOverride?: number | null, warningKmOverride?: number | null) => {
    const { error } = await supabase
      .from("vehicle_compliance")
      .update({ expiry_date: expiryDate || null, notes: notes || null, service_due_odometer_km: serviceDueOdometerKm ?? null, warning_days_before_override: warningDaysOverride ?? null, warning_km_before_override: warningKmOverride ?? null })
      .eq("id", rowId);

    if (error) throw new Error(error.message);

    setCompliance((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, expiry_date: expiryDate || null, notes: notes || null, service_due_odometer_km: serviceDueOdometerKm ?? null, warning_days_before_override: warningDaysOverride ?? null, warning_km_before_override: warningKmOverride ?? null }
          : r
      )
    );
  };

  const handleAddSave = async (
    vehicleId: string,
    complianceTypeId: string,
    expiryDate: string,
    notes: string,
    serviceDueOdometerKm?: number | null,
    warningDaysOverride?: number | null,
    warningKmOverride?: number | null
  ) => {
    const { data, error } = await supabase
      .from("vehicle_compliance")
      .insert({
        vehicle_id: vehicleId,
        compliance_type_id: complianceTypeId,
        expiry_date: expiryDate || null,
        notes: notes || null,
        service_due_odometer_km: serviceDueOdometerKm ?? null,
        warning_days_before_override: warningDaysOverride ?? null,
        warning_km_before_override: warningKmOverride ?? null,
      })
      .select(
        "id, vehicle_id, compliance_type_id, expiry_date, last_completed_at, notes, service_due_odometer_km, warning_days_before_override, warning_km_before_override, compliance_types(id, name, slug, warning_days_before, warning_km_before, sort_order, is_system, company_id)"
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
  const availableToAdd = allTypes.filter(
    (ct) =>
      !trackedTypeIds.has(ct.id) &&
      !(vehicle?.vehicle_category === "caravan" && ct.slug === "engine-service")
  );

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

  const vehicleCategory = vehicle?.vehicle_category || 'motorhome';

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
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <BackLink href={`/${locale}/staff/vehicles`}>{t("backToVehicles")}</BackLink>
          </div>
          <div className="surface page-surface">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {t("pageTitle")}
              </h1>
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
        </div>
      </PageContainer>
    );
  }

  return (
    <>
      <style>{`
        .photo-fields-grid {
          display: grid;
          gap: var(--space-6);
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 481px) {
          .photo-fields-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }
        }
        .dimensions-grid {
          display: grid;
          gap: var(--space-4);
          grid-template-columns: 1fr;
        }
        @media (min-width: 481px) {
          .dimensions-grid {
            grid-template-columns: 1fr 1fr 1fr;
          }
        }
        .compliance-header {
          display: none;
        }
        @media (min-width: 481px) {
          .compliance-header {
            display: grid;
            grid-template-columns: 1fr 140px 120px 80px;
            gap: var(--space-3);
            padding: 0 var(--space-3) var(--space-2);
            border-bottom: 1px solid rgb(var(--border));
          }
        }
        .compliance-row {
          display: grid;
          grid-template-areas:
            "crow-name crow-status"
            "crow-date crow-date"
            "crow-action crow-action";
          grid-template-columns: 1fr auto;
          gap: var(--space-2) var(--space-3);
          padding: var(--space-3);
          border-radius: var(--radius);
        }
        @media (min-width: 481px) {
          .compliance-row {
            grid-template-areas: "crow-name crow-date crow-status crow-action";
            grid-template-columns: 1fr 140px 120px 80px;
            gap: var(--space-3);
            align-items: center;
          }
        }
        .compliance-row-name   { grid-area: crow-name; }
        .compliance-row-date   { grid-area: crow-date; }
        .compliance-row-status { grid-area: crow-status; }
        .compliance-row-action { grid-area: crow-action; display: flex; justify-content: flex-start; }
        @media (min-width: 481px) {
          .compliance-row-action { justify-content: flex-end; }
        }
      `}</style>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <BackLink href={`/${locale}/staff/vehicles`}>{t("backToVehicles")}</BackLink>
          </div>
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
            <div className="photo-fields-grid">
              <div className="surface" style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    borderRadius: "var(--radius)",
                    overflow: "hidden",
                  }}
                >
                  {vehicle.photo_url ? (
                    <img
                      src={vehicle.photo_url}
                      alt={vehicle.name}
                      style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", color: "rgb(var(--muted))", fontSize: "14px" }}>
                      {t("fields.noPhoto")}
                    </span>
                  )}
                </div>
              </div>

              <div className="surface" style={{ padding: "var(--space-6)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <Field label="Registration plate" value={vehicle.registration_plate || "—"} />
                  <Field label={t("fields.vehicleCategory")} value={t(`fields.vehicleCategory${vehicleCategory.charAt(0).toUpperCase() + vehicleCategory.slice(1)}`)} />
                  <Field label={t("fields.make")}  value={vehicle.make  || "—"} />
                  <Field label={t("fields.model")} value={vehicle.model || "—"} />
                  <Field label={t("fields.year")}  value={vehicle.year ? String(vehicle.year) : "—"} />
                  <Field label={t("fields.vin")}   value={vehicle.vin   || "—"} />
                  {vehicleCategory !== "caravan" && (
                    <Field label={t("fields.latestOdometer")} value={vehicle.latest_odometer != null ? `${vehicle.latest_odometer.toLocaleString(locale)} km` : "—"} />
                  )}
                </div>
              </div>
            </div>

            {/* Dimensions */}
            {(vehicle.length_m != null || vehicle.width_m != null || vehicle.height_m != null) && (
              <div className="surface" style={{ padding: "var(--space-6)" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                  Dimensions
                </div>
                <div className="dimensions-grid">
                  <DimensionField label="Length" value={vehicle.length_m} />
                  <DimensionField label="Width"  value={vehicle.width_m} />
                  <DimensionField label="Height" value={vehicle.height_m} />
                </div>
              </div>
            )}

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

            {/* Video Tour */}
            {vehicle.youtube_url && (() => {
              const embedId = getYouTubeEmbedId(vehicle.youtube_url);
              if (!embedId) return null;
              return (
                <div className="surface" style={{ padding: "var(--space-6)" }}>
                  <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                    Video tour
                  </div>
                  <div style={{ maxWidth: 854, margin: "0 auto", width: "100%" }}>
                  <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid rgb(var(--border))" }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${embedId}`}
                      title="Video tour"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                    />
                  </div>
                  </div>
                </div>
              );
            })()}

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

              {vehicle.latest_odometer != null && vehicleCategory !== "caravan" && (
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
                  <div className="compliance-header">
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
                      row.warning_days_before_override ?? row.compliance_types.warning_days_before,
                      vehicle.latest_odometer,
                      row.service_due_odometer_km,
                      row.warning_km_before_override ?? row.compliance_types.warning_km_before
                    );
                    return (
                      <div
                        key={row.id}
                        className="compliance-row"
                        style={{
                          background:
                            cs === "expired"
                              ? "rgb(var(--error) / 0.04)"
                              : cs === "expiring"
                              ? "rgb(var(--warning) / 0.04)"
                              : "transparent",
                        }}
                      >
                        <div
                          className="compliance-row-name"
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

                        <div className="compliance-row-date" style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                          <div>{formatDate(row.expiry_date)}</div>
                          {row.service_due_odometer_km != null && vehicleCategory !== "caravan" && (
                            <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginTop: 2 }}>
                              Due at {row.service_due_odometer_km.toLocaleString(locale)} km
                            </div>
                          )}
                        </div>

                        <div className="compliance-row-status">
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

                        <div className="compliance-row-action">
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
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>{tCal("status")}</div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: "var(--radius)",
                        fontSize: "13px",
                        fontWeight: 600,
                        background: calendarSource?.ical_url
                          ? "rgb(var(--success) / 0.12)"
                          : "rgb(var(--muted) / 0.15)",
                        color: calendarSource?.ical_url
                          ? "rgb(var(--success))"
                          : "rgb(var(--muted))",
                      }}
                    >
                      {calendarSource?.ical_url ? tCal("connected") : tCal("notConnected")}
                    </span>
                  </div>
                  {calendarSource?.ical_url && (
                    <>
                      <div>
                        <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>{tCal("syncInterval")}</div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "rgb(var(--text))" }}>
                          {tCal(CRON_SCHEDULE_KEY)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>{tCal("lastSynced")}</div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "rgb(var(--text))" }}>
                          {calendarSource.last_synced_at
                            ? formatDate(calendarSource.last_synced_at)
                            : tCal("never")}
                        </div>
                      </div>
                      {calendarSource.last_sync_status && (
                        <div>
                          <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>{tCal("lastSyncResult")}</div>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "var(--radius)",
                              fontSize: "13px",
                              fontWeight: 600,
                              background: calendarSource.last_sync_status === "success"
                                ? "rgb(var(--success) / 0.12)"
                                : "rgb(var(--error) / 0.12)",
                              color: calendarSource.last_sync_status === "success"
                                ? "rgb(var(--success))"
                                : "rgb(var(--error))",
                            }}
                          >
                            {calendarSource.last_sync_status === "success" ? tCal("syncSuccess") : tCal("syncError")}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {calendarSource?.last_synced_at &&
                  Date.now() - new Date(calendarSource.last_synced_at).getTime() > 26 * 60 * 60 * 1000 && (
                  <div
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      background: "rgb(var(--warning) / 0.1)",
                      border: "1px solid rgb(var(--warning) / 0.3)",
                      borderRadius: "var(--radius)",
                      color: "rgb(var(--warning))",
                      fontSize: "13px",
                    }}
                  >
                    {tCal("staleWarning")}
                  </div>
                )}
              </div>
            </div>

          </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function DimensionField({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: "rgb(var(--text))" }}>
        {value != null ? `${value} m` : "—"}
      </div>
    </div>
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
