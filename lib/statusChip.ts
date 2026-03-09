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

const CATEGORY_STYLES: Record<StatusCategory, { color: string; background: string }> = {
  success: {
    color: "rgb(var(--success))",
    background: "rgb(var(--success) / 0.12)",
  },
  warning: {
    color: "rgb(var(--warning))",
    background: "rgb(var(--warning) / 0.12)",
  },
  error: {
    color: "rgb(var(--error))",
    background: "rgb(var(--error) / 0.12)",
  },
  muted: {
    color: "rgb(var(--muted))",
    background: "rgb(var(--muted) / 0.12)",
  },
};

export function getStatusChipStyle(status: string): CSSProperties {
  const category = STATUS_CATEGORY[status] ?? "muted";
  const colorStyles = CATEGORY_STYLES[category];
  return {
    display: "inline-block",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: "18px",
    whiteSpace: "nowrap",
    ...colorStyles,
  };
}