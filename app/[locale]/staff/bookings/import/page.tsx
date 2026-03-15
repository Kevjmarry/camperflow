"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { detectSourceType } from "@/lib/bookings/import/detectSourceType";
import { buildImportPreview } from "@/lib/bookings/import/buildImportPreview";
import type { ImportSourceType, ImportPreviewRow } from "@/lib/bookings/import/types";
import { createClient } from "@/lib/supabase/client";

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

    const ref = row.normalized.vehicleReference.trim().toLowerCase();
    const matches = vehicles.filter((v) => (v.name ?? "").trim().toLowerCase() === ref);

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

export default function BookingImportPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("bookingsImport");

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<ImportSourceType | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isMatchingVehicles, setIsMatchingVehicles] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setSourceType(null);
    setPreviewRows([]);
    setPreviewError(null);
    setIsParsing(true);
    setIsMatchingVehicles(false);
    setIsCheckingExisting(false);
    setImportResult(null);
    setImportError(null);

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
    setSourceType(null);
    setPreviewRows([]);
    setPreviewError(null);
    setIsParsing(false);
    setIsMatchingVehicles(false);
    setIsCheckingExisting(false);
    setImportResult(null);
    setImportError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

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

  const isLoading = isParsing || isMatchingVehicles || isCheckingExisting;

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

  const loadingMessage = isMatchingVehicles
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

          {/* Summary card + Import button */}
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

          {/* Preview area */}
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
