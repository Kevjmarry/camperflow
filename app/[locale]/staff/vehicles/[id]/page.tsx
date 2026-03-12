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

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [allTypes, setAllTypes] = useState<ComplianceType[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(true);

  const [editingRow, setEditingRow] = useState<ComplianceRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

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
          .select("role, can_manage")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        setCanManage(
          profile ? profile.role === "admin" || profile.can_manage === true : false
        );

        const { data: vehicleData, error: vehicleError } = await supabase
          .from("vehicles")
          .select("id, name, registration_plate, make, model, year, vin, notes, photo_url, status")
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

  const trackedTypeIds = new Set(compliance.map((r) => r.compliance_type_id));
  const availableToAdd = allTypes.filter((ct) => !trackedTypeIds.has(ct.id));

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
        <div className="surface" style={{ padding: "var(--space-8)" }}>
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
        <div className="surface" style={{ padding: "var(--space-8)" }}>
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
                      background: `${getVehicleStatusColor(vehicle.status)}15`,
                      color: getVehicleStatusColor(vehicle.status),
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {getVehicleStatusLabel(vehicle.status)}
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
            <div className="surface" style={{ padding: "var(--space-6)" }}>
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