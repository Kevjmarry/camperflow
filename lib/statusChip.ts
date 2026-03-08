import type { CSSProperties } from "react";

type StatusCategory = "success" | "warning" | "error" | "muted";

const STATUS_CATEGORY: Record<string, StatusCategory> = {
  // success (green)
  ready: "success",
  confirmed: "success",
  completed: "success",
  on_rent: "success",
  // warning (orange)
  preparing: "warning",
  in_progress: "warning",
  // error (red)
  cancelled: "error",
  blocked: "error",
  high: "error",
  // muted (gray)
  not_started: "muted",
  draft: "muted",
  pending: "muted",
  low: "muted",
  medium: "muted",
};

const CATEGORY_STYLES: Record<StatusCategory, { color: string; background: string; border: string }> = {
  success: {
    color: "rgb(var(--success))",
    background: "rgb(var(--success) / 0.12)",
    border: "1px solid rgb(var(--success) / 0.3)",
  },
  warning: {
    color: "rgb(var(--warning))",
    background: "rgb(var(--warning) / 0.12)",
    border: "1px solid rgb(var(--warning) / 0.3)",
  },
  error: {
    color: "rgb(var(--error))",
    background: "rgb(var(--error) / 0.12)",
    border: "1px solid rgb(var(--error) / 0.3)",
  },
  muted: {
    color: "rgb(var(--muted))",
    background: "rgb(var(--muted) / 0.12)",
    border: "1px solid rgb(var(--muted) / 0.3)",
  },
};

export function getStatusChipStyle(status: string): CSSProperties {
  const category = STATUS_CATEGORY[status] ?? "muted";
  const colorStyles = CATEGORY_STYLES[category];
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 12px",
    borderRadius: "9999px",
    fontSize: "13px",
    fontWeight: 500,
    whiteSpace: "nowrap",
    ...colorStyles,
  };
}