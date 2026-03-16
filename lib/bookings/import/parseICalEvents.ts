/**
 * Minimal RFC 5545 iCal parser.
 *
 * Extracts VEVENT components from a VCALENDAR text and returns their
 * properties as a flat map. Only what is needed for booking normalisation is
 * parsed; the rest is preserved verbatim in the raw value.
 */

export interface ICalProperty {
  value: string;
  params: Record<string, string>;
}

/**
 * A raw VEVENT component. Properties that can appear multiple times (e.g.
 * ATTENDEE, RDATE) are stored as arrays; for convenience a helper accessor is
 * provided.
 */
export interface ICalRawEvent {
  /** All parsed property lines, keyed by uppercased property name. */
  properties: Record<string, ICalProperty[]>;
}

/** Return the first value for a property, or undefined. */
export function getProp(event: ICalRawEvent, name: string): ICalProperty | undefined {
  return event.properties[name.toUpperCase()]?.[0];
}

// ── line-level parsing ────────────────────────────────────────────────────────

/**
 * RFC 5545 §3.1: a logical content line may be folded across physical lines by
 * inserting CRLF followed by a single WSP character. Unfold before processing.
 */
function unfold(text: string): string {
  // Both CRLF and LF folds are handled
  return text.replace(/\r?\n[ \t]/g, "");
}

/**
 * Parse a single content line into name, params, and value.
 * Returns null for blank or unparseable lines.
 *
 * Format: NAME[;PARAM=VALUE]...:property-value
 * The colon separating name+params from value is the FIRST colon on the line.
 */
function parseLine(
  line: string
): { name: string; params: Record<string, string>; value: string } | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;

  const namePart = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);

  const segments = namePart.split(";");
  const name = segments[0].trim().toUpperCase();
  if (!name) return null;

  const params: Record<string, string> = {};
  for (let i = 1; i < segments.length; i++) {
    const eqIdx = segments[i].indexOf("=");
    if (eqIdx !== -1) {
      const paramName = segments[i].slice(0, eqIdx).trim().toUpperCase();
      const paramValue = segments[i].slice(eqIdx + 1).trim();
      params[paramName] = paramValue;
    }
  }

  return { name, params, value };
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Parse all VEVENT blocks from a VCALENDAR text.
 *
 * - Ignores everything outside BEGIN:VEVENT … END:VEVENT
 * - Preserves multi-value properties (ATTENDEE, RDATE, …) as arrays
 * - Skips nested components (VALARM, etc.) inside VEVENTs
 */
export function parseICalEvents(icsText: string): ICalRawEvent[] {
  const lines = unfold(icsText).split(/\r?\n/);
  const events: ICalRawEvent[] = [];

  let current: ICalRawEvent | null = null;
  let nestedDepth = 0; // track nested BEGIN/END inside a VEVENT (e.g. VALARM)

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "BEGIN:VEVENT") {
      current = { properties: {} };
      nestedDepth = 0;
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (current) {
        events.push(current);
        current = null;
      }
      continue;
    }

    if (!current) continue;

    // Track nested components inside VEVENT (e.g. VALARM) so we don't
    // misinterpret their END lines as END:VEVENT.
    if (trimmed.startsWith("BEGIN:")) {
      nestedDepth++;
      continue;
    }
    if (trimmed.startsWith("END:")) {
      if (nestedDepth > 0) {
        nestedDepth--;
      }
      continue;
    }

    // Skip lines inside nested components
    if (nestedDepth > 0) continue;

    const parsed = parseLine(line);
    if (!parsed) continue;

    if (!current.properties[parsed.name]) {
      current.properties[parsed.name] = [];
    }
    current.properties[parsed.name].push({
      value: parsed.value,
      params: parsed.params,
    });
  }

  return events;
}
