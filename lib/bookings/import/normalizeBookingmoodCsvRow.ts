import { NormalizedImportBooking } from "@/lib/bookings/import/types";

// ── metadata key normalizers ───────────────────────────────────────────────

function parseBooleanLike(value: string): boolean | string {
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "1") return true;
  if (v === "false" || v === "no" || v === "0") return false;
  return value;
}

function isPetsLabel(label: string): boolean {
  const l = label.toLowerCase();
  return /\bpets?\b/.test(l) || l.includes("travelling with pet") || l.includes("with pet");
}

function isGuestCountLabel(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes("guest") ||
    l.includes("adults") ||
    l.includes("pax") ||
    l.includes("persons") ||
    l.includes("people") ||
    l.includes("passenger")
  );
}

function isAirportTransferLabel(label: string): boolean {
  return label.toLowerCase().includes("airport");
}

function isExtraDriverLabel(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes("extra driver") ||
    l.includes("additional driver") ||
    l.includes("second driver")
  );
}

function isWhatsappOptinLabel(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("whatsapp") && (l.includes("discount") || l.includes("offer"));
}

/**
 * Scans all CSV row keys, extracts normalised extras, and returns a metadata
 * object with stable top-level keys plus a `raw` copy of the original row.
 * Only adds a key when the source value is non-empty.
 */
function buildNormalizedMetadata(
  row: Record<string, string>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(row)) {
    if (!rawValue?.trim()) continue;

    if (isPetsLabel(key)) {
      normalized.pets = parseBooleanLike(rawValue);
    } else if (isGuestCountLabel(key)) {
      const num = Number(rawValue);
      normalized.guest_count = isNaN(num) ? rawValue : num;
    } else if (isAirportTransferLabel(key)) {
      normalized.airport_transfer = parseBooleanLike(rawValue);
    } else if (isExtraDriverLabel(key)) {
      normalized.extra_driver = parseBooleanLike(rawValue);
    } else if (isWhatsappOptinLabel(key)) {
      normalized.whatsapp_optin = parseBooleanLike(rawValue);
    }
  }

  // Always preserve the original row verbatim so nothing is lost
  normalized.raw = row as Record<string, unknown>;

  return normalized;
}

// ── blocked-period detection ───────────────────────────────────────────────

/**
 * Normalises a raw type string for comparison:
 * - trims whitespace
 * - lowercases
 * - collapses hyphens, underscores, and spaces into a single hyphen
 *
 * Examples: "Blocked Period" → "blocked-period", "owner_block" → "owner-block"
 */
function normalizeType(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "-");
}

/**
 * Returns true when the CSV row represents a blocked/unavailability period
 * rather than a real customer booking. Matches all common Bookingmood variants:
 *
 *   blocked-period, blocked period, blocked, block, unavailable,
 *   not available, owner block, maintenance
 */
function isBlockedPeriod(row: Record<string, string>): boolean {
  const rawType = (row.type ?? row.Type ?? "").trim();
  if (!rawType) return false;

  const t = normalizeType(rawType);

  // Explicit blocked-period / block / blocked variants
  if (t === "blocked-period") return true;
  if (t === "blocked") return true;
  if (t === "block") return true;
  if (t === "blocks") return true;

  // Unavailability variants
  if (t === "unavailable") return true;
  if (t === "not-available") return true;

  // Owner / maintenance variants
  if (t === "owner-block") return true;
  if (t === "owner-blocked") return true;
  if (t === "maintenance") return true;

  // Prefix-based catch-all for "unavailab..." variants (e.g. "unavailability")
  if (t.startsWith("unavailab")) return true;

  return false;
}

/**
 * Extracts a human-readable label for a blocked period. Falls back to undefined
 * so callers can substitute a localised default.
 */
function extractBlockLabel(row: Record<string, string>): string | undefined {
  const value = (
    row.title ?? row.Title ??
    row.reason ?? row.Reason ??
    row.description ?? row.Description ??
    row.name ?? row.Name
  )?.trim();
  return value || undefined;
}

// ── main normalizer ────────────────────────────────────────────────────────

export function normalizeBookingmoodCsvRow(
  row: Record<string, string>
): NormalizedImportBooking {
  // ── blocked period ───────────────────────────────────────────────────────
  if (isBlockedPeriod(row)) {
    return {
      sourceType: "bookingmood_csv",
      sourceBookingId: row.external_id || row.reference || "",
      sourceReference: row.reference || undefined,
      bookingType: "blocked_period",
      label: extractBlockLabel(row),
      vehicleReference: row.product || "",
      pickupAt: row.start_date || "",
      returnAt: row.end_date || "",
      rawMetadata: buildNormalizedMetadata(row),
    };
  }

  // ── regular booking ──────────────────────────────────────────────────────
  const totalPrice = parseFloat(row.total);

  let customerName: string | undefined;
  let customerEmail: string | undefined;
  let customerPhone: string | undefined;

  if (row.contacts) {
    try {
      const contacts = JSON.parse(row.contacts);
      const first = Array.isArray(contacts) ? contacts[0] : undefined;
      if (first) {
        customerName = first.name || undefined;
        customerEmail = first.email || undefined;
        customerPhone = first.phone || undefined;
      }
    } catch {
      // unparseable contacts — leave fields undefined
    }
  }

  return {
    sourceType: "bookingmood_csv",
    sourceBookingId: row.external_id || row.reference || "",
    sourceReference: row.reference || undefined,
    bookingType: "booking",
    externalStatus: row.status || undefined,
    vehicleReference: row.product || "",
    pickupAt: row.start_date || "",
    returnAt: row.end_date || "",
    customerName,
    customerEmail,
    customerPhone,
    totalPrice: isNaN(totalPrice) ? undefined : totalPrice,
    currency: row.currency || undefined,
    notes: row.notes || undefined,
    rawMetadata: buildNormalizedMetadata(row),
  };
}
