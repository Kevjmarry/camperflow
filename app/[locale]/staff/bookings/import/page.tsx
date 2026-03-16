"use client";

import { useState, useRef, useMemo, DragEvent, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { detectSourceType } from "@/lib/bookings/import/detectSourceType";
import { buildImportPreview } from "@/lib/bookings/import/buildImportPreview";
import type { ImportSourceType, ImportPreviewRow } from "@/lib/bookings/import/types";
import { createClient } from "@/lib/supabase/client";

// ── vehicle name normalization ────────────────────────────────────────────────

/**
 * Reduce a vehicle name / external reference to a canonical form for fuzzy
 * matching.  Applied to both sides of the comparison so the same
 * transformations cancel out.
 *
 * Pipeline (order matters):
 *   1. NFD decompose + strip combining diacritics  (é → e, ü → u, …)
 *   2. Lowercase
 *   3. Common separators (- _ . / \ | , ; :) → single space
 *   4. Strip any remaining non-alphanumeric characters
 *   5. Collapse runs of whitespace
 *   6. Trim
 */
function normalizeVehicleRef(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_./\\|,;:]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── vehicle matching (client-side read, no writes) ────────────────────────────

async function applyVehicleMatching(
  rows: ImportPreviewRow[],
  vehicleNotFoundMsg: string,
  ambiguousMsg: string,
  noCompanyIdMsg: string,
  vehicleQueryErrorMsg: string,
): Promise<ImportPreviewRow[]> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  let companyId = user?.app_metadata?.company_id as string | undefined;

  if (!companyId && user?.id) {
    const { data: staffProfile } = await supabase
      .from("staff_profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    companyId = staffProfile?.company_id ?? undefined;
  }

  if (!companyId) {
    throw new Error(noCompanyIdMsg);
  }

  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, name")
    .eq("company_id", companyId);

  if (error || !vehicles) {
    throw new Error(vehicleQueryErrorMsg);
  }

  return rows.map((row) => {
    if (!row.normalized?.vehicleReference) {
      return row;
    }

    // Pass 1 — exact match (case-insensitive, trimmed): preserves current
    // behaviour for names that already match precisely.
    const ref = row.normalized.vehicleReference.trim().toLowerCase();
    let matches = vehicles.filter((v) => (v.name ?? "").trim().toLowerCase() === ref);

    // Pass 2 — normalized match: catches diacritic, punctuation, and separator
    // variations without touching the manual fallback flow.
    if (matches.length === 0) {
      const normRef = normalizeVehicleRef(row.normalized.vehicleReference);
      if (normRef) {
        matches = vehicles.filter((v) => normalizeVehicleRef(v.name ?? "") === normRef);
      }
    }

    if (matches.length === 1) {
      return { ...row, matchStatus: "matched" as const, matchedVehicleId: matches[0].id };
    } else if (matches.length === 0) {
      if (row.actionType === "error") {
        return { ...row, matchStatus: "unmatched" as const };
      }
      return {
        ...row,
        matchStatus: "unmatched" as const,
        actionType: "error" as const,
        errorMessage: vehicleNotFoundMsg,
      };
    } else {
      if (row.actionType === "error") {
        return { ...row, matchStatus: "ambiguous" as const };
      }
      return {
        ...row,
        matchStatus: "ambiguous" as const,
        actionType: "error" as const,
        errorMessage: ambiguousMsg,
      };
    }
  });
}

// ── existing booking detection (idempotency: company_id + source_type + source_booking_id) ──

async function applyExistingBookingMatching(
  rows: ImportPreviewRow[],
): Promise<ImportPreviewRow[]> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  let companyId = user?.app_metadata?.company_id as string | undefined;

  if (!companyId && user?.id) {
    const { data: staffProfile } = await supabase
      .from("staff_profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    companyId = staffProfile?.company_id ?? undefined;
  }

  if (!companyId) return rows;

  const checkableRows = rows.filter(
    (r) => r.actionType === "create" && r.matchStatus === "matched" && r.normalized,
  );

  if (checkableRows.length === 0) return rows;

  const sourceTypeGroups = new Map<string, string[]>();
  for (const row of checkableRows) {
    const st = row.normalized!.sourceType;
    if (!sourceTypeGroups.has(st)) sourceTypeGroups.set(st, []);
    sourceTypeGroups.get(st)!.push(row.normalized!.sourceBookingId);
  }

  const existingKeys = new Set<string>();
  for (const [sourceType, ids] of sourceTypeGroups) {
    const { data: existing } = await supabase
      .from("bookings")
      .select("source_type, source_booking_id")
      .eq("company_id", companyId)
      .eq("source_type", sourceType)
      .in("source_booking_id", ids);

    for (const e of existing ?? []) {
      existingKeys.add(`${e.source_type}:${e.source_booking_id}`);
    }
  }

  return rows.map((row) => {
    if (row.actionType !== "create" || !row.normalized) return row;
    const key = `${row.normalized.sourceType}:${row.normalized.sourceBookingId}`;
    if (existingKeys.has(key)) {
      return { ...row, actionType: "update" as const };
    }
    return row;
  });
}

// ── import execution (delegates to server route) ──────────────────────────────

type ImportResult = {
  created: number;
  updated: number;
  blocked: number;
  errors: { rowNumber: number; message: string }[];
};

async function callImportRoute(rows: ImportPreviewRow[]): Promise<ImportResult> {
  const readyRows = rows.filter(
    (r) =>
      (r.actionType === "create" || r.actionType === "update" || r.actionType === "block") &&
      r.matchStatus === "matched",
  );

  const res = await fetch("/api/staff/bookings/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: readyRows }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? `Server error ${res.status}`);
  }

  return data as ImportResult;
}

// ── component ─────────────────────────────────────────────────────────────────

type ImportMode = "file" | "ical";

export default function BookingImportPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("bookingsImport");

  // ── shared state ────────────────────────────────────────────────────────────
  const [importMode, setImportMode] = useState<ImportMode>("file");
  const [sourceType, setSourceType] = useState<ImportSourceType | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ── file-mode state ─────────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isMatchingVehicles, setIsMatchingVehicles] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── iCal-mode state ─────────────────────────────────────────────────────────
  const [icalUrl, setIcalUrl] = useState("");
  const [icalVehicleMode, setIcalVehicleMode] = useState<"single_vehicle" | "multi_vehicle">("single_vehicle");
  const [icalVehicleId, setIcalVehicleId] = useState("");
  const [icalVehicleName, setIcalVehicleName] = useState("");
  const [vehicles, setVehicles] = useState<{ id: string; name: string }[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [isFetchingIcal, setIsFetchingIcal] = useState(false);
  const vehiclesLoadedRef = useRef(false);

  // ── bulk vehicle assignment state ────────────────────────────────────────────
  const [vehicleAssignments, setVehicleAssignments] = useState<Record<string, string>>({});

  // ── shared reset ────────────────────────────────────────────────────────────
  const resetPreview = () => {
    setSourceType(null);
    setPreviewRows([]);
    setPreviewError(null);
    setIsParsing(false);
    setIsMatchingVehicles(false);
    setIsCheckingExisting(false);
    setIsFetchingIcal(false);
    setImportResult(null);
    setImportError(null);
    setVehicleAssignments({});
  };

  // ── file mode handlers ──────────────────────────────────────────────────────
  const handleFile = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    resetPreview();
    setIsParsing(true);
    if (!vehiclesLoadedRef.current) {
      vehiclesLoadedRef.current = true;
      loadVehicles();
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      try {
        const detected = detectSourceType(file.name, text);
        if (!detected) {
          setPreviewError(t("preview.undetectedSource"));
          setIsParsing(false);
          return;
        }
        setSourceType(detected);
        const rows = buildImportPreview(text, detected);
        setIsParsing(false);
        setIsMatchingVehicles(true);
        const matchedRows = await applyVehicleMatching(
          rows,
          t("match.vehicleNotFound"),
          t("match.ambiguous"),
          t("match.noCompanyId"),
          t("match.vehicleQueryError"),
        );
        setIsMatchingVehicles(false);
        setIsCheckingExisting(true);
        const finalRows = await applyExistingBookingMatching(matchedRows);
        setPreviewRows(finalRows);
        setIsCheckingExisting(false);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : t("preview.parseError"));
        setIsParsing(false);
        setIsMatchingVehicles(false);
        setIsCheckingExisting(false);
      }
    };
    reader.onerror = () => {
      setPreviewError(t("preview.readError"));
      setIsParsing(false);
      setIsMatchingVehicles(false);
      setIsCheckingExisting(false);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
  };

  const handleRemove = () => {
    setSelectedFile(null);
    resetPreview();
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── iCal mode handlers ──────────────────────────────────────────────────────
  const loadVehicles = async () => {
    setVehiclesLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      let companyId = user?.app_metadata?.company_id as string | undefined;
      if (!companyId && user?.id) {
        const { data: p } = await supabase
          .from("staff_profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .single();
        companyId = p?.company_id ?? undefined;
      }
      if (!companyId) return;
      const { data } = await supabase
        .from("vehicles")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      setVehicles(data ?? []);
    } finally {
      setVehiclesLoading(false);
    }
  };

  const handleSwitchToIcal = () => {
    resetPreview();
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
    setImportMode("ical");
    if (!vehiclesLoadedRef.current) {
      vehiclesLoadedRef.current = true;
      loadVehicles();
    }
  };

  const handleSwitchToFile = () => {
    resetPreview();
    setImportMode("file");
  };

  const handleFetchIcal = async () => {
    if (!icalUrl.trim()) return;
    if (icalVehicleMode === "single_vehicle" && !icalVehicleId) {
      setPreviewError(t("ical.noVehicleSelected"));
      return;
    }
    resetPreview();
    setIsFetchingIcal(true);

    try {
      const requestBody: Record<string, string> = { url: icalUrl.trim() };
      if (icalVehicleMode === "single_vehicle") {
        requestBody.vehicleReference = icalVehicleName;
        requestBody.vehicleId = icalVehicleId;
      }

      const res = await fetch("/api/staff/bookings/ical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Server error ${res.status}`);
      }

      setSourceType("ical");
      setIsFetchingIcal(false);

      let rows = data.rows as ImportPreviewRow[];

      if (icalVehicleMode === "multi_vehicle") {
        setIsMatchingVehicles(true);
        rows = await applyVehicleMatching(
          rows,
          t("match.vehicleNotFound"),
          t("match.ambiguous"),
          t("match.noCompanyId"),
          t("match.vehicleQueryError"),
        );
        setIsMatchingVehicles(false);
      }

      setIsCheckingExisting(true);
      const finalRows = await applyExistingBookingMatching(rows);
      setPreviewRows(finalRows);
      setIsCheckingExisting(false);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t("ical.fetchError"));
      setIsFetchingIcal(false);
      setIsMatchingVehicles(false);
      setIsCheckingExisting(false);
    }
  };

  // ── import handler (shared) ─────────────────────────────────────────────────
  const handleImport = async () => {
    setIsImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await callImportRoute(previewRows);
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("import.unexpectedError"));
    } finally {
      setIsImporting(false);
    }
  };

  // ── bulk vehicle assignment ─────────────────────────────────────────────────
  const applyBulkAssignment = (ref: string, vehicleId: string) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    const vehicleNotFoundMsg = t("match.vehicleNotFound");
    setPreviewRows((prev) =>
      prev.map((row) => {
        if (row.matchStatus !== "unmatched" || row.normalized?.vehicleReference !== ref) return row;
        // Only restore actionType when this row's error was vehicle-not-found; leave other errors intact
        const isVehicleError = row.errorMessage === vehicleNotFoundMsg;
        const restoredAction = isVehicleError
          ? row.normalized!.bookingType === "blocked_period"
            ? ("block" as const)
            : row.normalized!.bookingType === "existing"
              ? ("update" as const)
              : ("create" as const)
          : row.actionType;
        return {
          ...row,
          matchStatus: "matched" as const,
          matchedVehicleId: vehicleId,
          actionType: restoredAction,
          errorMessage: isVehicleError ? undefined : row.errorMessage,
        };
      }),
    );
    setVehicleAssignments((prev) => {
      const next = { ...prev };
      delete next[ref];
      return next;
    });
  };

  // ── derived ─────────────────────────────────────────────────────────────────
  const isLoading = importMode === "file"
    ? isParsing || isMatchingVehicles || isCheckingExisting
    : isFetchingIcal || isMatchingVehicles || isCheckingExisting;

  const rowsToCreate = previewRows.filter(
    (r) => r.actionType === "create" && r.matchStatus === "matched",
  ).length;
  const rowsToUpdate = previewRows.filter(
    (r) => r.actionType === "update" && r.matchStatus === "matched",
  ).length;
  const rowsToBlock = previewRows.filter(
    (r) => r.actionType === "block" && r.matchStatus === "matched",
  ).length;
  const rowsReady = rowsToCreate + rowsToUpdate + rowsToBlock;
  const rowsWithErrors = previewRows.filter((r) => r.actionType === "error").length;
  const rowsSkipped = previewRows.filter((r) => r.actionType === "skip").length;

  // Group unmatched rows by vehicleReference for bulk assignment
  const unmatchedGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of previewRows) {
      if (row.matchStatus !== "unmatched" || !row.normalized?.vehicleReference) continue;
      const ref = row.normalized.vehicleReference;
      map.set(ref, (map.get(ref) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([ref, count]) => ({ ref, count }));
  }, [previewRows]);

  const matchStatusLabel = (status: ImportPreviewRow["matchStatus"]) => {
    if (status === "matched") return t("match.statusMatched");
    if (status === "ambiguous") return t("match.statusAmbiguous");
    return t("match.statusUnmatched");
  };

  const actionTypeLabel = (action: ImportPreviewRow["actionType"]) => {
    if (action === "create") return t("action.create");
    if (action === "update") return t("action.update");
    if (action === "block") return t("action.block");
    if (action === "skip") return t("action.skip");
    return t("action.error");
  };

  const loadingMessage = isFetchingIcal
    ? t("preview.fetchingIcal")
    : isMatchingVehicles
    ? t("preview.matchingVehicles")
    : isCheckingExisting
    ? t("preview.checkingExisting")
    : t("preview.parsing");

  const tableColumns = [
    t("table.rowNum"),
    t("table.sourceId"),
    t("table.vehicleRef"),
    t("table.pickup"),
    t("table.return"),
    t("table.match"),
    t("table.action"),
    t("table.issue"),
  ];

  // ── tab button style helper ─────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "var(--space-2) var(--space-5)",
    fontSize: "14px",
    fontWeight: active ? 600 : 400,
    color: active ? "rgb(var(--brand))" : "rgb(var(--muted))",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid rgb(var(--brand))" : "2px solid transparent",
    cursor: "pointer",
    marginBottom: "-1px",
  });

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

          {/* Header */}
          <div>
            <Link
              href={`/${locale}/staff/bookings`}
              style={{
                fontSize: "14px",
                color: "rgb(var(--brand))",
                textDecoration: "none",
                marginBottom: "var(--space-2)",
                display: "inline-block",
              }}
            >
              {t("backToBookings")}
            </Link>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("title")}
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {t("subtitle")}
            </p>
          </div>

          {/* Mode tabs */}
          <div style={{ borderBottom: "1px solid rgb(var(--border))" }}>
            <button type="button" style={tabStyle(importMode === "file")} onClick={handleSwitchToFile}>
              {t("tabs.file")}
            </button>
            <button type="button" style={tabStyle(importMode === "ical")} onClick={handleSwitchToIcal}>
              {t("tabs.ical")}
            </button>
          </div>

          {/* ── File upload mode ── */}
          {importMode === "file" ? (
            <>
              {/* Upload card */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "rgb(var(--brand))" : "rgb(var(--border))"}`,
                  borderRadius: "var(--radius)",
                  background: dragOver ? "rgb(var(--brand) / 0.04)" : "rgb(var(--surface-raised, var(--surface)))",
                  padding: "var(--space-10) var(--space-8)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                  textAlign: "center",
                }}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={dragOver ? "rgb(var(--brand))" : "rgb(var(--muted))"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>

                <div>
                  <p style={{ fontSize: "15px", fontWeight: 500, color: "rgb(var(--text))", marginBottom: "var(--space-1)" }}>
                    {t("dropzone.primary")}
                  </p>
                  <p style={{ fontSize: "13px", color: "rgb(var(--muted))" }}>
                    {t("dropzone.accepted")}
                  </p>
                </div>

                <span
                  className="btn btn-secondary"
                  style={{ pointerEvents: "none", fontSize: "14px" }}
                >
                  {t("dropzone.browse")}
                </span>

                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.json"
                  style={{ display: "none" }}
                  onChange={handleInputChange}
                  aria-label={t("dropzone.inputLabel")}
                />
              </div>

              {/* Selected file feedback */}
              {selectedFile && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  padding: "var(--space-3) var(--space-4)",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: "var(--radius)",
                  background: "rgb(var(--success) / 0.06)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgb(var(--success))"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div>
                      <p style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                        {selectedFile.name}
                      </p>
                      <p style={{ fontSize: "12px", color: "rgb(var(--muted))" }}>
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemove}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "rgb(var(--muted))",
                      fontSize: "13px",
                      padding: "var(--space-1) var(--space-2)",
                    }}
                  >
                    {t("file.remove")}
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ── iCal URL mode ── */
            <div style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: "var(--radius)",
              padding: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-5)",
              background: "rgb(var(--surface-raised, var(--surface)))",
            }}>
              {/* URL input */}
              <div>
                <label
                  htmlFor="ical-url"
                  style={{ fontSize: "13px", fontWeight: 500, color: "rgb(var(--text))", display: "block", marginBottom: "var(--space-2)" }}
                >
                  {t("ical.urlLabel")}
                </label>
                <input
                  id="ical-url"
                  type="url"
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  placeholder={t("ical.urlPlaceholder")}
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

              {/* Vehicle mode toggle */}
              <div>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "rgb(var(--text))", marginBottom: "var(--space-2)" }}>
                  {t("ical.vehicleMode")}
                </p>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {(["single_vehicle", "multi_vehicle"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setIcalVehicleMode(mode)}
                      style={{
                        padding: "var(--space-1) var(--space-4)",
                        fontSize: "13px",
                        fontWeight: icalVehicleMode === mode ? 600 : 400,
                        border: `1px solid ${icalVehicleMode === mode ? "rgb(var(--brand))" : "rgb(var(--border))"}`,
                        borderRadius: "var(--radius)",
                        background: icalVehicleMode === mode ? "rgb(var(--brand) / 0.08)" : "rgb(var(--surface))",
                        color: icalVehicleMode === mode ? "rgb(var(--brand))" : "rgb(var(--muted))",
                        cursor: "pointer",
                      }}
                    >
                      {mode === "single_vehicle" ? t("ical.vehicleModeSingle") : t("ical.vehicleModeMulti")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vehicle selector — single_vehicle only */}
              {icalVehicleMode === "single_vehicle" && (
                <div>
                  <label
                    htmlFor="ical-vehicle"
                    style={{ fontSize: "13px", fontWeight: 500, color: "rgb(var(--text))", display: "block", marginBottom: "var(--space-2)" }}
                  >
                    {t("ical.vehicleLabel")}
                  </label>
                  {vehiclesLoading ? (
                    <p style={{ fontSize: "13px", color: "rgb(var(--muted))" }}>
                      {t("ical.vehiclesLoading")}
                    </p>
                  ) : (
                    <select
                      id="ical-vehicle"
                      value={icalVehicleId}
                      onChange={(e) => {
                        const v = vehicles.find((v) => v.id === e.target.value);
                        setIcalVehicleId(e.target.value);
                        setIcalVehicleName(v?.name ?? "");
                      }}
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
                    >
                      <option value="">{t("ical.vehiclePlaceholder")}</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Fetch button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleFetchIcal}
                  disabled={!icalUrl.trim() || (icalVehicleMode === "single_vehicle" && !icalVehicleId) || isFetchingIcal}
                  style={{ fontSize: "14px" }}
                >
                  {isFetchingIcal ? t("ical.fetching") : t("ical.fetchButton")}
                </button>
              </div>
            </div>
          )}

          {/* Summary card + Import button — shared between both modes */}
          {sourceType && !isLoading && !previewError && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "var(--space-3)",
                padding: "var(--space-4)",
                border: "1px solid rgb(var(--border))",
                borderRadius: "var(--radius)",
                background: "rgb(var(--surface-raised, var(--surface)))",
              }}>
                <div>
                  <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                    {t("summary.sourceType")}
                  </p>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                    {sourceType}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                    {t("summary.totalRows")}
                  </p>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                    {previewRows.length}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                    {t("summary.toCreate")}
                  </p>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--success))" }}>
                    {rowsToCreate}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                    {t("summary.toUpdate")}
                  </p>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--brand))" }}>
                    {rowsToUpdate}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                    {t("summary.toBlock")}
                  </p>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "rgb(161, 120, 0)" }}>
                    {rowsToBlock}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                    {t("summary.rowsWithErrors")}
                  </p>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: rowsWithErrors > 0 ? "rgb(var(--error))" : "rgb(var(--muted))" }}>
                    {rowsWithErrors}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                    {t("summary.rowsSkipped")}
                  </p>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--muted))" }}>
                    {rowsSkipped}
                  </p>
                </div>
              </div>

              {/* Import button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={rowsReady === 0 || isImporting}
                  onClick={handleImport}
                  style={{ fontSize: "14px", minWidth: "160px" }}
                >
                  {isImporting
                    ? t("import.importing")
                    : t("import.button", { count: rowsReady })}
                </button>
              </div>
            </div>
          )}

          {/* Bulk vehicle assignment — shown when unmatched references remain after auto-matching */}
          {sourceType && !isLoading && !previewError && unmatchedGroups.length > 0 && (
            <div style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: "var(--radius)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
              background: "rgb(var(--surface-raised, var(--surface)))",
            }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "rgb(var(--text))", margin: 0 }}>
                {t("bulkAssign.sectionTitle")}
              </p>
              {unmatchedGroups.map(({ ref, count }) => (
                <div
                  key={ref}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: "160px", flex: "1 1 160px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "rgb(var(--text))" }}>
                      {ref}
                    </span>
                    <span style={{ fontSize: "12px", color: "rgb(var(--muted))", marginLeft: "var(--space-2)" }}>
                      {t("bulkAssign.rowCount", { count })}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", flex: "0 0 auto" }}>
                    <select
                      value={vehicleAssignments[ref] ?? ""}
                      onChange={(e) =>
                        setVehicleAssignments((prev) => ({ ...prev, [ref]: e.target.value }))
                      }
                      style={{
                        padding: "var(--space-1) var(--space-3)",
                        border: "1px solid rgb(var(--border))",
                        borderRadius: "var(--radius)",
                        fontSize: "13px",
                        color: "rgb(var(--text))",
                        background: "rgb(var(--surface))",
                        minWidth: "160px",
                      }}
                    >
                      <option value="">{t("bulkAssign.selectPlaceholder")}</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!vehicleAssignments[ref]}
                      onClick={() => applyBulkAssignment(ref, vehicleAssignments[ref] ?? "")}
                      style={{ fontSize: "13px", whiteSpace: "nowrap" }}
                    >
                      {t("bulkAssign.assignButton")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Import result feedback */}
          {importResult && (
            <div style={{
              padding: "var(--space-4)",
              border: `1px solid ${importResult.errors.length > 0 ? "rgb(var(--error) / 0.4)" : "rgb(var(--success) / 0.4)"}`,
              borderRadius: "var(--radius)",
              background: importResult.errors.length > 0 ? "rgb(var(--error) / 0.04)" : "rgb(var(--success) / 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "rgb(var(--text))" }}>
                {t("import.resultTitle")}
              </p>
              <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", color: "rgb(var(--success))" }}>
                  {t("import.resultCreated", { count: importResult.created })}
                </span>
                <span style={{ fontSize: "13px", color: "rgb(var(--brand))" }}>
                  {t("import.resultUpdated", { count: importResult.updated })}
                </span>
                {importResult.blocked > 0 && (
                  <span style={{ fontSize: "13px", color: "rgb(161, 120, 0)" }}>
                    {t("import.resultBlocked", { count: importResult.blocked })}
                  </span>
                )}
                {importResult.errors.length > 0 && (
                  <span style={{ fontSize: "13px", color: "rgb(var(--error))" }}>
                    {t("import.resultErrors", { count: importResult.errors.length })}
                  </span>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  {importResult.errors.map((e) => (
                    <li key={e.rowNumber} style={{ fontSize: "12px", color: "rgb(var(--error))" }}>
                      {t("import.rowError", { row: e.rowNumber, message: e.message })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Import execution error */}
          {importError && (
            <div style={{
              padding: "var(--space-4)",
              border: "1px solid rgb(var(--error) / 0.4)",
              borderRadius: "var(--radius)",
              background: "rgb(var(--error) / 0.04)",
            }}>
              <p style={{ fontSize: "14px", color: "rgb(var(--error))" }}>{importError}</p>
            </div>
          )}

          {/* Preview area — shared between both modes */}
          {isLoading ? (
            <div style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: "var(--radius)",
              minHeight: "160px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))", textAlign: "center", padding: "var(--space-6)" }}>
                {loadingMessage}
              </p>
            </div>
          ) : previewError ? (
            <div style={{
              border: "1px solid rgb(var(--error) / 0.4)",
              borderRadius: "var(--radius)",
              minHeight: "80px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgb(var(--error) / 0.04)",
              padding: "var(--space-4)",
            }}>
              <p style={{ fontSize: "14px", color: "rgb(var(--error))", textAlign: "center" }}>
                {previewError}
              </p>
            </div>
          ) : previewRows.length > 0 ? (
            <div style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: "var(--radius)",
              overflowX: "auto",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "rgb(var(--surface-raised, var(--surface)))" }}>
                    {tableColumns.map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "var(--space-2) var(--space-3)",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "rgb(var(--muted))",
                          borderBottom: "1px solid rgb(var(--border))",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      style={{
                        borderBottom: "1px solid rgb(var(--border) / 0.5)",
                        background: row.actionType === "error"
                          ? "rgb(var(--error) / 0.03)"
                          : row.actionType === "block"
                          ? "rgba(234, 179, 8, 0.04)"
                          : row.actionType === "update"
                          ? "rgb(var(--brand) / 0.04)"
                          : row.actionType === "skip"
                          ? "rgb(var(--muted) / 0.04)"
                          : undefined,
                      }}
                    >
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "rgb(var(--muted))" }}>
                        {row.rowNumber}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "rgb(var(--text))" }}>
                        {row.normalized?.sourceBookingId ?? "—"}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "rgb(var(--text))" }}>
                        {row.normalized?.vehicleReference ?? "—"}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "rgb(var(--text))", whiteSpace: "nowrap" }}>
                        {row.normalized?.pickupAt ?? "—"}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "rgb(var(--text))", whiteSpace: "nowrap" }}>
                        {row.normalized?.returnAt ?? "—"}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: row.matchStatus === "matched"
                            ? "rgb(var(--success) / 0.12)"
                            : row.matchStatus === "ambiguous"
                            ? "rgba(234, 179, 8, 0.12)"
                            : "rgb(var(--error) / 0.12)",
                          color: row.matchStatus === "matched"
                            ? "rgb(var(--success))"
                            : row.matchStatus === "ambiguous"
                            ? "rgb(161, 120, 0)"
                            : "rgb(var(--error))",
                        }}>
                          {matchStatusLabel(row.matchStatus)}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: row.actionType === "create"
                            ? "rgb(var(--success) / 0.12)"
                            : row.actionType === "update"
                            ? "rgb(var(--brand) / 0.12)"
                            : row.actionType === "block"
                            ? "rgba(234, 179, 8, 0.12)"
                            : row.actionType === "error"
                            ? "rgb(var(--error) / 0.12)"
                            : "rgb(var(--muted) / 0.10)",
                          color: row.actionType === "create"
                            ? "rgb(var(--success))"
                            : row.actionType === "update"
                            ? "rgb(var(--brand))"
                            : row.actionType === "block"
                            ? "rgb(161, 120, 0)"
                            : row.actionType === "error"
                            ? "rgb(var(--error))"
                            : "rgb(var(--muted))",
                        }}>
                          {actionTypeLabel(row.actionType)}
                        </span>
                      </td>
                      <td style={{
                        padding: "var(--space-2) var(--space-3)",
                        color: row.actionType === "block"
                          ? "rgb(161, 120, 0)"
                          : row.actionType === "skip"
                          ? "rgb(var(--muted))"
                          : "rgb(var(--error))",
                        fontSize: "12px",
                      }}>
                        {row.actionType === "block"
                          ? (row.normalized?.label ?? t("import.defaultBlockLabel"))
                          : (row.errorMessage ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: "var(--radius)",
              minHeight: "160px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))", textAlign: "center", padding: "var(--space-6)" }}>
                {t("preview.placeholder")}
              </p>
            </div>
          )}

        </div>
      </div>
    </PageContainer>
  );
}
