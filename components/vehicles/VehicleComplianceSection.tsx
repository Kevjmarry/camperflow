"use client";

import { useTranslations } from "next-intl";
import EditComplianceModal from "@/components/vehicles/EditComplianceModal";
import AddComplianceModal from "@/components/vehicles/AddComplianceModal";

const VIGNETTE_SLUG = "motorway-vignette";

const SYSTEM_SLUG_KEYS: Record<string, string> = {
  "technical-inspection": "technicalInspection",
  "insurance":            "insurance",
  "gas-inspection":       "gasInspection",
  "habitation-service":   "habitationService",
  "general-service":      "generalService",
  "engine-service":       "engineService",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ComplianceTypeShape {
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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

type ComplianceStatus = "expired" | "expiring" | "ok";

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
    const [ey, em, ed] = expiryDate.split('-').map(Number)
    const expiry = new Date(ey, em - 1, ed);
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface VehicleComplianceSectionProps {
  compliance: ComplianceRow[];
  complianceLoading: boolean;
  availableToAdd: ComplianceType[];
  vehicleId: string;
  locale: string;
  latestOdometer?: number | null;
  vehicleCategory?: string;
  editingRow: ComplianceRow | null;
  onEditRow: (row: ComplianceRow | null) => void;
  showAddModal: boolean;
  onShowAddModal: (v: boolean) => void;
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
    vehicleId: string,
    complianceTypeId: string | null,
    expiryDate: string,
    notes: string,
    customName?: string,
    customBlocksReadiness?: boolean,
    serviceDueOdometerKm?: number | null,
    warningDaysOverride?: number | null,
    warningKmOverride?: number | null
  ) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VehicleComplianceSection({
  compliance,
  complianceLoading,
  availableToAdd,
  vehicleId,
  locale,
  latestOdometer,
  vehicleCategory,
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
}: VehicleComplianceSectionProps) {
  const tV = useTranslations("vehicleDetail");
  const tSlug = useTranslations("vehicleDetail.compliance.systemTypes");

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
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

  const resolveComplianceDisplayName = (row: ComplianceRow): string => {
    if (row.compliance_types.slug === VIGNETTE_SLUG && row.notes) {
      return tV("compliance.motorwayVignette", { notes: row.notes });
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

  return (
    <>
      {editingRow && (
        <EditComplianceModal
          row={editingRow}
          locale={locale}
          onClose={() => onEditRow(null)}
          onSave={(id, exp, notes, km, warnDays, warnKm) =>
            onEditSave(id, exp, notes, undefined, undefined, km, warnDays, warnKm)
          }
        />
      )}

      {showAddModal && (
        <AddComplianceModal
          vehicleId={vehicleId}
          availableTypes={availableToAdd}
          locale={locale}
          onClose={() => onShowAddModal(false)}
          onSave={(vid, tid, exp, notes, km, warnDays, warnKm) =>
            onAddSave(vid, tid, exp, notes, undefined, undefined, km, warnDays, warnKm)
          }
        />
      )}

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
            onClick={() => onShowAddModal(true)}
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
                row.warning_days_before_override ?? row.compliance_types.warning_days_before,
                latestOdometer,
                row.service_due_odometer_km,
                row.warning_km_before_override ?? row.compliance_types.warning_km_before
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
                          ? tV("compliance.badge.blocksReadiness")
                          : tV("compliance.badge.operational")}
                      </span>
                    </div>
                    {row.notes && row.compliance_types.slug !== VIGNETTE_SLUG && (
                      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", fontWeight: 400, marginTop: 2 }}>
                        {row.notes}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                    <div>{formatDate(row.expiry_date)}</div>
                    {row.service_due_odometer_km != null && vehicleCategory !== "caravan" && (
                      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginTop: 2 }}>
                        {tV("compliance.dueAtKm", { n: row.service_due_odometer_km.toLocaleString(locale) })}
                      </div>
                    )}
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
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            border: "1px solid rgb(var(--border))",
                            borderRadius: "var(--radius)",
                            background: "transparent",
                            color: "rgb(var(--text))",
                            cursor: deletingRowId === row.id ? "not-allowed" : "pointer",
                            fontWeight: 500,
                            opacity: deletingRowId === row.id ? 0.6 : 1,
                          }}
                          disabled={deletingRowId === row.id}
                          onClick={() => onConfirmDeleteRow(null)}
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
                          onClick={() => onDeleteRow(row.id)}
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
                          onClick={() => onEditRow(row)}
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
                          onClick={() => onConfirmDeleteRow(row.id)}
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
    </>
  );
}