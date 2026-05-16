/**
 * Normalises a raw iCal VEVENT into a NormalizedImportBooking.
 *
 * Handles the three DATE/DATE-TIME variants defined in RFC 5545:
 *   - DATE only            YYYYMMDD
 *   - DATE-TIME UTC        YYYYMMDDTHHMMSSZ
 *   - DATE-TIME w/ TZID   YYYYMMDDTHHMMSS + TZID param
 *
 * Blocked-period detection is summary-based — the same patterns that
 * Airbnb, Booking.com, and other OTAs use in their iCal exports.
 *
 * Vehicle reference resolution order (multi-vehicle / Bookingmood feeds):
 *   1. Caller-supplied vehicleReference (non-empty → single_vehicle mode)
 *   2. LOCATION property of the VEVENT (Bookingmood multi-calendar feeds
 *      embed the rental-unit / product name here per RFC 5545)
 *   3. Empty string (left for downstream vehicle-matching to handle)
 */

import { ICalRawEvent, getProp } from "@/lib/bookings/import/parseICalEvents";
import { NormalizedImportBooking } from "@/lib/bookings/import/types";

// ── timezone helpers (mirrored from the existing import route) ────────────────

function tzOffsetMs(tz: string, utcDate: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const localAsUtcMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return localAsUtcMs - utcDate.getTime();
}

/** Convert a wall-clock ISO string (no Z, no offset) in `tz` to a UTC ISO string. */
function localTzToUtcIso(localIso: string, tz: string): string {
  const roughMs = Date.parse(`${localIso}Z`);
  const offset1 = tzOffsetMs(tz, new Date(roughMs));
  const adjustedMs = roughMs - offset1;
  const offset2 = tzOffsetMs(tz, new Date(adjustedMs));
  return new Date(roughMs - offset2).toISOString();
}

// ── DATE / DATE-TIME parser ───────────────────────────────────────────────────

/**
 * Converts an iCal DATE or DATE-TIME value string to a UTC ISO string.
 *
 * @param value  Raw iCal value, e.g. "20240615", "20240615T100000Z", "20240615T100000"
 * @param tzid   Optional TZID parameter value from the property (e.g. "Europe/Berlin")
 */
export function parseDtToIso(value: string, tzid?: string): string {
  // DATE only: YYYYMMDD → all-day, normalise to midnight UTC
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const mo = value.slice(4, 6);
    const d = value.slice(6, 8);
    return `${y}-${mo}-${d}T00:00:00.000Z`;
  }

  // DATE-TIME: YYYYMMDDTHHMMSS[Z]
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const [, yr, mo, dy, hh, mm, ss, z] = m;
    const isoLocal = `${yr}-${mo}-${dy}T${hh}:${mm}:${ss}`;

    if (z === "Z") {
      return new Date(`${isoLocal}Z`).toISOString();
    }

    if (tzid) {
      try {
        return localTzToUtcIso(isoLocal, tzid);
      } catch {
        // Unknown TZID — fall back to treating as UTC
        return new Date(`${isoLocal}Z`).toISOString();
      }
    }

    // Floating time with no TZID → treat as UTC (best-effort)
    return new Date(`${isoLocal}Z`).toISOString();
  }

  // Fallback: let the JS runtime try
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toISOString();
}

// ── event classification ──────────────────────────────────────────────────────

/**
 * SUMMARY values that platforms use to mark host-blocked / unavailable periods.
 * Kept as the primary signal; expanded with common hold/personal patterns.
 */
const BLOCKED_SUMMARY_PATTERNS: RegExp[] = [
  /\bblocked?\b/i,
  /\bblocked\s+period\b/i,
  /\bnot[\s-]?available\b/i,
  /\bunavailable\b/i,
  /\bunavailability\b/i,
  /\bowner[\s-]?block\b/i,
  /\bowner[\s-]?hold\b/i,
  /\bowner[\s-]?stay\b/i,
  /\bowner[\s-]?use\b/i,
  /\bmaintenance\b/i,
  /\bclosed\b/i,
  /\bhold\b/i,
  /\bpersonal\b/i,
  /\bclosure\b/i,
  /airbnb \(not available\)/i,
];

/**
 * X-property name fragments that confirm a real guest reservation.
 * Matched case-insensitively against property names (not values).
 */
const BOOKING_XPROP_FRAGMENTS = [
  "CONFIRMATION-CODE",
  "CONFIRMATION_CODE",
  "RESERVATION-ID",
  "RESERVATION_ID",
  "BOOKING-ID",
  "BOOKING_ID",
];

/**
 * X-property name fragments that confirm a host-blocked / hold period.
 */
const BLOCKED_XPROP_FRAGMENTS = [
  "BLOCKED",
  "UNAVAIL",
  "OWNER-BLOCK",
  "OWNER_BLOCK",
  "HOLD",
];

/**
 * Classify a raw VEVENT as "booking" or "blocked_period".
 *
 * Signal priority (first match wins):
 *   0. Provider URL path (Bookingmood proven signals, highest confidence)
 *   1. Definitive block X-property or CATEGORIES → blocked_period
 *   2. Definitive booking X-property             → booking
 *   3. Block SUMMARY pattern                     → blocked_period
 *   4. Guest ATTENDEE with MAILTO                → booking
 *   5. Ambiguous tiebreaker                      → blocked_period
 *      (safer default: a false block is recoverable; a false booking risks
 *       accepting a double-booking from an OTA)
 */
function classifyICalEvent(
  event: ICalRawEvent,
  attendeeName: string | undefined,
  customerEmail: string | undefined
): "booking" | "blocked_period" {
  const summary = getProp(event, "SUMMARY")?.value?.trim() ?? "";
  const uid = getProp(event, "UID")?.value ?? "";

  // 0. URL path — provider-confirmed event type (highest confidence, checked first).
  //    Bookingmood proven signals from actual VEVENT data:
  //      /bookings/       → real guest reservation
  //      /calendar-events/ → host-created block / hold
  //    Other providers that include reservation-detail URLs benefit too.
  const urlPath = getProp(event, "URL")?.value ?? "";
  if (urlPath.includes("/bookings/")) return "booking";
  if (urlPath.includes("/calendar-events/")) return "blocked_period";

  // 1a. Definitive block X-property
  for (const key of Object.keys(event.properties)) {
    if (!key.startsWith("X-")) continue;
    const upper = key.toUpperCase();
    if (BLOCKED_XPROP_FRAGMENTS.some((f) => upper.includes(f))) {
      return "blocked_period";
    }
  }

  // 1b. CATEGORIES contains block keyword
  const categories = getProp(event, "CATEGORIES")?.value?.toUpperCase() ?? "";
  if (
    categories.includes("BLOCKED") ||
    categories.includes("UNAVAILABLE") ||
    categories.includes("HOLD")
  ) {
    return "blocked_period";
  }

  // 2. Definitive booking X-property
  for (const key of Object.keys(event.properties)) {
    if (!key.startsWith("X-")) continue;
    const upper = key.toUpperCase();
    if (BOOKING_XPROP_FRAGMENTS.some((f) => upper.includes(f))) {
      return "booking";
    }
  }

  // 3. Block SUMMARY pattern
  if (BLOCKED_SUMMARY_PATTERNS.some((re) => re.test(summary))) {
    return "blocked_period";
  }

  // 4. Guest ATTENDEE with MAILTO (real guest in the event)
  if (customerEmail) return "booking";
  // Attendee name without email is also strong guest evidence when a UID exists
  if (attendeeName && uid) return "booking";

  // 5. Ambiguous — default to blocked_period
  return "blocked_period";
}

// ── customer info extraction ──────────────────────────────────────────────────

/**
 * Try to extract a customer name from the ATTENDEE CN parameter.
 * Platforms that expose guest names put them in CN on the ATTENDEE line.
 */
function extractAttendeeName(event: ICalRawEvent): string | undefined {
  const attendees = event.properties["ATTENDEE"] ?? [];
  for (const a of attendees) {
    const cn = a.params["CN"];
    if (cn && cn !== "MAILTO" && !cn.includes("@")) {
      return cn.trim() || undefined;
    }
  }
  return undefined;
}

function extractAttendeeEmail(event: ICalRawEvent): string | undefined {
  const attendees = event.properties["ATTENDEE"] ?? [];
  for (const a of attendees) {
    // The ATTENDEE value itself is typically "MAILTO:email@example.com"
    const raw = a.value.trim();
    if (raw.toLowerCase().startsWith("mailto:")) {
      return raw.slice("mailto:".length).trim() || undefined;
    }
  }
  return undefined;
}

// ── main normalizer ───────────────────────────────────────────────────────────

/**
 * Normalise a raw VEVENT into the shared NormalizedImportBooking shape.
 *
 * @param event            Parsed VEVENT from parseICalEvents
 * @param vehicleReference Caller-supplied vehicle name (non-empty in
 *                         single_vehicle mode; empty string in multi_vehicle
 *                         mode — the function then reads LOCATION from the
 *                         event itself, which is where Bookingmood encodes the
 *                         rental-unit / product name in multi-calendar feeds).
 */
export function normalizeICalEvent(
  event: ICalRawEvent,
  vehicleReference: string
): NormalizedImportBooking {
  const uid = getProp(event, "UID")?.value ?? "";
  const summary = getProp(event, "SUMMARY")?.value?.trim() ?? "";
  const description = getProp(event, "DESCRIPTION")?.value?.trim();
  const status = getProp(event, "STATUS")?.value?.toUpperCase();

  const dtStartProp = getProp(event, "DTSTART");
  const dtEndProp = getProp(event, "DTEND");

  const pickupAt = dtStartProp
    ? parseDtToIso(dtStartProp.value, dtStartProp.params["TZID"])
    : "";

  // RFC 5545 §3.6.1: DATE-only DTEND is exclusive — e.g. DTEND:20240616 means
  // the last occupied day is June 15, not June 16. Subtract 1 calendar day so
  // the company dropoff time is applied on the correct date.
  const dtEndIsDateOnly = dtEndProp ? /^\d{8}$/.test(dtEndProp.value) : false;
  let returnAt = dtEndProp
    ? parseDtToIso(dtEndProp.value, dtEndProp.params["TZID"])
    : "";
  if (dtEndIsDateOnly && returnAt) {
    const d = new Date(returnAt);
    d.setUTCDate(d.getUTCDate() - 1);
    returnAt = d.toISOString();
  }
  const EXPLICIT_UTC_RE = /^\d{8}T\d{6}Z$/;
  const pickupAtExplicitUtc = dtStartProp
    ? EXPLICIT_UTC_RE.test(dtStartProp.value)
    : false;
  const returnAtExplicitUtc = dtEndProp
    ? EXPLICIT_UTC_RE.test(dtEndProp.value)
    : false;

  // ── vehicle reference resolution ──────────────────────────────────────────
  // Priority:
  //   1. Caller-supplied (single_vehicle mode — user explicitly picked a vehicle)
  //   2. LOCATION property (Bookingmood multi-calendar feeds put the unit/product
  //      name here; other OTAs also use LOCATION for the rental resource name)
  //   3. Empty string — left for downstream applyVehicleMatching to handle
  const location = getProp(event, "LOCATION")?.value?.trim() ?? "";
  const effectiveVehicleReference = vehicleReference || location;

  const rawMetadata: Record<string, unknown> = {
    raw: Object.fromEntries(
      Object.entries(event.properties).map(([k, v]) => [
        k,
        v.length === 1 ? v[0].value : v.map((p) => p.value),
      ])
    ),
  };

  // ── customer info (needed for classification below) ──────────────────────
  const attendeeName = extractAttendeeName(event);
  const customerEmail = extractAttendeeEmail(event);

  // ── classify ──────────────────────────────────────────────────────────────
  const bookingType = classifyICalEvent(event, attendeeName, customerEmail);

  if (bookingType === "blocked_period") {
    return {
      sourceType: "ical",
      sourceBookingId: uid,
      bookingType,
      label: summary || undefined,
      vehicleReference: effectiveVehicleReference,
      pickupAt,
      returnAt,
      pickupAtExplicitUtc,
      returnAtExplicitUtc,
      rawMetadata,
    };
  }

  // ── real booking ──────────────────────────────────────────────────────────
  const customerName = attendeeName ?? (summary || undefined);

  return {
    sourceType: "ical",
    sourceBookingId: uid,
    bookingType,
    externalStatus: status,
    vehicleReference: effectiveVehicleReference,
    pickupAt,
    returnAt,
    pickupAtExplicitUtc,
    returnAtExplicitUtc,
    customerName,
    customerEmail,
    notes: description,
    rawMetadata,
  };
}
