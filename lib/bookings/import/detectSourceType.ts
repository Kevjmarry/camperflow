import type { ImportSourceType } from "./types";

// BookingMood TSV/CSV exports — real export header fields (case-insensitive).
// All five required headers must be present; detection is strengthened by
// supportive headers but is not dependent on them.
const BOOKINGMOOD_CSV_REQUIRED_HEADERS = [
  "reference",
  "product",
  "start_date",
  "end_date",
  "external_id",
];
const BOOKINGMOOD_CSV_SUPPORTIVE_HEADERS = [
  "contacts",
  "details",
  "fees",
  "taxes",
  "payments",
  "title",
  "status",
  "currency",
  "total",
];
// At least this many supportive headers must also be present.
const BOOKINGMOOD_CSV_SUPPORTIVE_THRESHOLD = 2;

function detectFormat(fileName: string, text: string): "csv" | "json" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";

  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "csv";
}

function isBookingMoodCsv(firstLine: string): boolean {
  const normalized = firstLine.toLowerCase();

  // Explicit brand mention in header row
  if (normalized.includes("bookingmood")) return true;

  // Detect delimiter: prefer tab if present, otherwise comma
  const delimiter = normalized.includes("\t") ? "\t" : ",";
  const cols = normalized.split(delimiter).map((c) => c.trim().replace(/["']/g, ""));

  const hasAllRequired = BOOKINGMOOD_CSV_REQUIRED_HEADERS.every((h) =>
    cols.includes(h)
  );
  if (!hasAllRequired) return false;

  const supportiveCount = BOOKINGMOOD_CSV_SUPPORTIVE_HEADERS.filter((h) =>
    cols.includes(h)
  ).length;

  return supportiveCount >= BOOKINGMOOD_CSV_SUPPORTIVE_THRESHOLD;
}

function isBookingMoodJson(text: string): boolean {
  // Only parse the outer envelope — avoid full parse for large files
  const snippet = text.slice(0, 4096);
  if (/["']source["']\s*:\s*["']bookingmood["']/i.test(snippet)) return true;
  if (/["']platform["']\s*:\s*["']bookingmood["']/i.test(snippet)) return true;
  if (/["']bookingmood_id["']/i.test(snippet)) return true;

  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (
        typeof obj.source === "string" &&
        obj.source.toLowerCase() === "bookingmood"
      )
        return true;
      if (
        typeof obj.platform === "string" &&
        obj.platform.toLowerCase() === "bookingmood"
      )
        return true;
    }
  } catch {
    // malformed JSON — fall through to generic
  }

  return false;
}

export function detectSourceType(
  fileName: string,
  text: string
): ImportSourceType {
  const lowerName = fileName.toLowerCase();
  const format = detectFormat(fileName, text);

  if (format === "json") {
    const isBookingMood =
      lowerName.includes("bookingmood") || isBookingMoodJson(text);
    return isBookingMood ? "bookingmood_json" : "generic_json";
  }

  // CSV / TSV
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const isBookingMood =
    lowerName.includes("bookingmood") || isBookingMoodCsv(firstLine);
  return isBookingMood ? "bookingmood_csv" : "generic_csv";
}
