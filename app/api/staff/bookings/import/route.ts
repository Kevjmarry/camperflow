import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportPreviewRow, NormalizedImportBooking } from '@/lib/bookings/import/types';
import { provisionBookingChecklists } from '@/lib/checklists/provisionBookingChecklists';

// ── internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns true when a datetime value carries no meaningful time — either it is
 * a bare date string (YYYY-MM-DD) or a datetime whose time component is exactly
 * midnight (T00:00:00[.000…][Z]), which is what CSV parsers emit when the source
 * only contained a date.
 */
function looksDateOnly(value: string): boolean {
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z?$/.test(s)) return true;
  return false;
}

/**
 * Returns the UTC offset in milliseconds for `tz` at the given UTC instant.
 * Positive = timezone is ahead of UTC (e.g. CEST = +2 h = +7_200_000 ms).
 */
function tzOffsetMs(tz: string, utcDate: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  // Reconstruct the local wall-clock time as a UTC ms value for arithmetic only
  const localAsUtcMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24, // guard against the rare "24" returned for midnight by some ICU builds
    get('minute'),
    get('second'),
  );
  return localAsUtcMs - utcDate.getTime();
}

/**
 * Converts a wall-clock datetime string (datePart + timePart) in `tz` to a UTC
 * ISO string. Uses a two-step offset lookup so DST-boundary dates are handled
 * correctly (the offset at the rough UTC estimate may differ from the offset at
 * the adjusted UTC time).
 */
function localToUtcIso(datePart: string, timePart: string, tz: string): string {
  // Step 1: treat the local time as if it were UTC — rough estimate only
  const roughMs = Date.parse(`${datePart}T${timePart}Z`);
  // Step 2: find the actual offset at that rough UTC moment and apply it
  const offset1 = tzOffsetMs(tz, new Date(roughMs));
  const adjustedMs = roughMs - offset1;
  // Step 3: re-evaluate the offset at the adjusted time (handles DST edge cases)
  const offset2 = tzOffsetMs(tz, new Date(adjustedMs));
  return new Date(roughMs - offset2).toISOString();
}

/**
 * If `dateStr` looks like a date-only value and `defaultTime` is set, returns a
 * UTC ISO string built from the date part + default time interpreted as
 * COMPANY_TIMEZONE local time. Otherwise returns `dateStr` unchanged, preserving
 * explicit source-provided times.
 */
function applyDefaultTime(dateStr: string, defaultTime: string | null, tz: string, _isExplicitUtc?: boolean, subtractDay?: boolean): string {
  if (!defaultTime) return dateStr;
  if (looksDateOnly(dateStr)) {
    const datePart = dateStr.trim().slice(0, 10); // always "YYYY-MM-DD"
    return localToUtcIso(datePart, defaultTime, tz);
  }
  // Midnight in company timezone = date-only placeholder (TZID or UTC midnight).
  // For DTEND, subtractDay=true shifts the recovered local date back one day
  // because iCal DATE-TIME DTEND is exclusive (midnight of day-after-last).
  if (isMidnightInCompanyTz(dateStr, tz)) {
    let datePart = localDateInCompanyTz(dateStr, tz);
    if (subtractDay) {
      const d = new Date(`${datePart}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      datePart = d.toISOString().slice(0, 10);
    }
    return localToUtcIso(datePart, defaultTime, tz);
  }
  return dateStr;
}

/**
 * Returns true when a stored UTC datetime is a midnight placeholder — i.e. its
 * wall-clock time in COMPANY_TIMEZONE is exactly 00:00:00. Null / unparseable
 * values also return true so they are treated as "no meaningful time stored".
 *
 * Used to decide whether an existing stored pickup/return time should be
 * preserved or replaced with the company default when the incoming iCal event
 * carries only a date (no real time component).
 */
function isMidnightInCompanyTz(value: string | null, tz: string): boolean {
  if (!value) return true;
  const d = new Date(value);
  if (isNaN(d.getTime())) return true;
  const offsetMs = tzOffsetMs(tz, d);
  const localMs = d.getTime() + offsetMs;
  return localMs % 86_400_000 === 0;
}

/**
 * Returns the local date string (YYYY-MM-DD) in COMPANY_TIMEZONE for a UTC
 * ISO instant. Used when a TZID-midnight iCal value (e.g. 2026-03-30T22:00:00.000Z
 * for Europe/Bratislava UTC+2) must be mapped back to the correct local calendar
 * date ("2026-03-31") before a company default pickup/dropoff time is applied.
 */
function localDateInCompanyTz(utcIso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(utcIso));
}

/**
 * Returns the local time string (HH:MM:SS) in COMPANY_TIMEZONE for a UTC ISO
 * instant. Used in the BM-iCal date-only merge to extract only the time-of-day
 * from an existing stored timestamp so it can be re-applied to a new source date.
 */
function localTimeInCompanyTz(utcIso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcIso));
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? '00').padStart(2, '0');
  // Guard against the rare ICU "24" emitted for midnight — normalise to "00".
  const h = String(parseInt(get('hour'), 10) % 24).padStart(2, '0');
  return `${h}:${get('minute')}:${get('second')}`;
}

function generateBookingNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${year}${month}${day}-${rand}`;
}

function generateBookingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function mapExternalStatus(externalStatus?: string): string {
  const s = (externalStatus ?? '').toUpperCase();
  if (s === 'CONFIRMED') return 'confirmed';
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'TENTATIVE') return 'draft';
  return 'draft';
}

function validateNormalized(n: NormalizedImportBooking): string | null {
  if (!n.sourceType) return 'Missing sourceType';
  if (!n.sourceBookingId) return 'Missing sourceBookingId';
  if (!n.pickupAt) return 'Missing pickupAt';
  if (!n.returnAt) return 'Missing returnAt';
  if (!n.customerName?.trim()) return 'Missing customer_name';
  // iCal feeds rarely carry a phone number — only enforce for structured CSV/JSON imports
  if (n.sourceType !== 'ical' && !n.customerPhone?.trim()) return 'Missing customer_phone';
  return null;
}

// ── Bookingmood family helpers ─────────────────────────────────────────────────

/**
 * The three source_types that share the same external booking-ID space for
 * Bookingmood-originated data. Used as the IN list when querying for existing
 * records that might have arrived via a different channel.
 */
const BOOKINGMOOD_FAMILY = ['bookingmood_csv', 'bookingmood_json', 'ical'] as const;

/**
 * Returns true when rawMetadata signals that an iCal event originated from
 * Bookingmood. Checks (any one is sufficient):
 *   • UID ends with @bookingmood.com
 *   • URL contains bookingmood.com
 *   • ORGANIZER contains bookingmood.com
 *
 * rawMetadata is structured as { raw: { UID: "...", URL: "...", ... } } by
 * normalizeICalEvent — the raw iCal property values live one level down.
 */
function isBookingmoodOriginIcal(rawMetadata: Record<string, unknown>): boolean {
  const raw = rawMetadata?.raw as Record<string, unknown> | undefined;
  if (!raw) return false;

  const uid = typeof raw.UID === 'string' ? raw.UID.toLowerCase() : '';
  if (uid.endsWith('@bookingmood.com')) return true;

  const url = typeof raw.URL === 'string' ? raw.URL.toLowerCase() : '';
  if (url.includes('bookingmood.com')) return true;

  const organizer = typeof raw.ORGANIZER === 'string' ? raw.ORGANIZER.toLowerCase() : '';
  if (organizer.includes('bookingmood.com')) return true;

  return false;
}

/**
 * Returns true when the incoming row is a member of the Bookingmood idempotency
 * family — i.e. it shares booking IDs with bookingmood_csv / bookingmood_json.
 * Structured imports always qualify; iCal qualifies only when it originates from
 * Bookingmood (detected via raw metadata). Non-Bookingmood iCal is isolated.
 */
function isBookingmoodFamilyMember(
  sourceType: string,
  rawMetadata: Record<string, unknown>,
): boolean {
  if (sourceType === 'bookingmood_csv' || sourceType === 'bookingmood_json') return true;
  if (sourceType === 'ical') return isBookingmoodOriginIcal(rawMetadata);
  return false;
}

/**
 * Returns true when the existing stored source is a Bookingmood structured
 * import (CSV or JSON) — i.e. richer than iCal.
 */
function isBookingmoodRicherSource(existingSourceType: string): boolean {
  return existingSourceType === 'bookingmood_csv' || existingSourceType === 'bookingmood_json';
}

// ── Customer find-or-create ────────────────────────────────────────────────────

/**
 * Finds an existing customer for the company matching on email (primary) or
 * full_name+phone (fallback). Creates a new customer row if none found.
 * Returns the customer id, or null on error.
 */
async function findOrCreateCustomer(
  supabase: SupabaseClient,
  companyId: string,
  fullName: string,
  phone: string | null,
  email: string | null,
): Promise<{ id: string; isNew: boolean } | null> {
  const trimmedEmail = email?.trim() || null;
  const trimmedPhone = phone?.trim() || null;
  const trimmedName = fullName?.trim() || null;

  // Try email match first (most reliable)
  if (trimmedEmail) {
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('email', trimmedEmail)
      .maybeSingle();
    if (byEmail) return { id: byEmail.id, isNew: false };
  }

  // Fallback: match by full_name + phone
  if (trimmedName && trimmedPhone) {
    const { data: byNamePhone } = await supabase
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_name', trimmedName)
      .eq('phone', trimmedPhone)
      .maybeSingle();
    if (byNamePhone) return { id: byNamePhone.id, isNew: false };
  }

  // Last resort: iCal events carry no phone and often no email.
  // Match on name alone to avoid creating a null-contact duplicate of an
  // existing record and losing its stored email/phone.
  if (trimmedName && !trimmedEmail && !trimmedPhone) {
    const { data: byName } = await supabase
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_name', trimmedName)
      .maybeSingle();
    if (byName) return { id: byName.id, isNew: false };
  }

  // Create new customer
  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      company_id: companyId,
      full_name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
    })
    .select('id')
    .single();

  if (error || !created) return null;
  return { id: created.id, isNew: true };
}

async function deleteCustomerIfUnreferenced(
  supabase: SupabaseClient,
  customerId: string,
): Promise<void> {
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId);
  if ((count ?? 0) === 0) {
    await supabase.from('customers').delete().eq('id', customerId);
  }
}

// ── Trip-detail extraction from freetext notes ────────────────────────────────

type TripDetailsMeta = {
  pets?: boolean;
  guest_count?: number;
  airport_transfer?: boolean;
  extra_driver?: boolean;
  whatsapp_optin?: boolean;
};

/**
 * Parses freetext notes (e.g. Bookingmood iCal DESCRIPTION, CSV notes column)
 * looking for "Label: Value" pairs that correspond to known trip-detail fields.
 * Only returns fields that were clearly found; ignores unrecognised lines.
 */
function parseNotesForTripDetails(notes: string | null): TripDetailsMeta {
  if (!notes?.trim()) return {};

  // RFC 5545 text properties encode line-breaks as \n (backslash + n literal).
  // Normalise both \n and \N to actual newlines before splitting so key-value
  // pairs embedded in iCal DESCRIPTION values are correctly separated.
  const normalised = notes.replace(/\\[nN]/g, '\n');
  const result: TripDetailsMeta = {};
  // Split on newlines or semicolons (some OTAs use semicolons as separators)
  const lines = normalised.split(/[\n\r;]+/);

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const label = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!label || !rawValue) continue;

    const l = label.toLowerCase();
    const v = rawValue.toLowerCase();

    const asBool =
      v === 'yes' || v === 'true' || v === '1' ? true
      : v === 'no' || v === 'false' || v === '0' ? false
      : null;

    if (/\bpets?\b/.test(l) || l.includes('travelling with pet') || l.includes('with pet')) {
      if (asBool !== null && !('pets' in result)) result.pets = asBool;
    } else if (l.includes('airport')) {
      if (asBool !== null && !('airport_transfer' in result)) result.airport_transfer = asBool;
    } else if (l.includes('extra driver') || l.includes('additional driver') || l.includes('second driver')) {
      if (asBool !== null && !('extra_driver' in result)) result.extra_driver = asBool;
    } else if (l.includes('whatsapp')) {
      if (asBool !== null && !('whatsapp_optin' in result)) result.whatsapp_optin = asBool;
    } else if (
      l.includes('guest') || l.includes('adults') || l.includes('pax') ||
      l.includes('persons') || l.includes('people') || l.includes('passenger')
    ) {
      const num = Number(rawValue);
      if (!isNaN(num) && num > 0 && !('guest_count' in result)) result.guest_count = num;
    }
  }

  return result;
}

/**
 * Merges parsed trip-detail values into an existing staff_metadata object.
 * Only fills keys that are absent from `existing` — never overwrites.
 * Returns the merged object when at least one key was added, null otherwise.
 */
function mergeStaffMeta(
  existing: Record<string, unknown> | null,
  parsed: TripDetailsMeta,
): Record<string, unknown> | null {
  if (Object.keys(parsed).length === 0) return null;
  const base = existing ?? {};
  const merged: Record<string, unknown> = { ...base };
  let changed = false;

  for (const [k, v] of Object.entries(parsed)) {
    if (!(k in merged)) {
      merged[k] = v;
      changed = true;
    }
  }

  return changed ? merged : null;
}

// Shape of the existing row fields we need for merge decisions.
interface ExistingBookingData {
  id: string;
  source_type: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  source_reference: string | null;
  pickup_at: string | null;
  return_at: string | null;
  vehicle_id: string | null;
  customer_id: string | null;
  staff_metadata: Record<string, unknown> | null;
}

async function postImportNormalize(allIds: string[], nowIso: string): Promise<void> {
  if (!allIds.length) return;
  const svc = createServiceClient();
  const nowMs = new Date(nowIso).getTime();

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, pickup_at, return_at, status')
    .in('id', allIds);
  if (!bookings?.length) return;

  const pastIds: string[] = [];
  const activeIds: string[] = [];
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    if (!b.return_at) continue;
    const returnMs = new Date(b.return_at).getTime();
    if (returnMs < nowMs) {
      pastIds.push(b.id);
    } else if (b.pickup_at && new Date(b.pickup_at).getTime() <= nowMs) {
      activeIds.push(b.id);
    }
  }

  if (pastIds.length) {
    await svc.from('bookings').update({ status: 'completed' }).in('id', pastIds);
  }

  if (activeIds.length) {
    await svc.from('bookings').update({ status: 'on_rent' }).in('id', activeIds);
    const { data: handoverInstances } = await svc
      .from('checklist_instances')
      .select('id')
      .in('booking_id', activeIds)
      .eq('checklist_type', 'handover')
      .eq('status', 'pending');
    if (handoverInstances?.length) {
      await svc
        .from('checklist_instances')
        .update({ status: 'completed', completed_at: nowIso })
        .in('id', handoverInstances.map((i) => i.id));
    }
  }
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') ?? '';
    const isInternalCronCall =
      cronSecret && cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;

    let supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceClient>;
    let companyId: string;

    if (isInternalCronCall) {
      supabase = createServiceClient();
      // company_id is validated via vehicle ownership check below
      const body = await request.clone().json().catch(() => ({}));
      const rows: ImportPreviewRow[] = body?.rows ?? [];
      const firstVehicleId = rows.find((r) => r.matchedVehicleId)?.matchedVehicleId;
      if (!firstVehicleId) {
        return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
      }
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('company_id')
        .eq('id', firstVehicleId)
        .single();
      if (!vehicle) {
        return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
      }
      companyId = vehicle.company_id;
    } else {
      supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { data: staffProfile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('company_id, role, can_manage')
        .eq('auth_user_id', user.id)
        .single();
      if (profileError || !staffProfile) {
        return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 });
      }
      if (staffProfile.role !== 'admin' && !staffProfile.can_manage) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      companyId = staffProfile.company_id;
    }

    // Fetch company default pickup/return times to fill in date-only rows
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('pickup_time, dropoff_time, company_timezone')
      .eq('id', companyId)
      .maybeSingle();
    const defaultPickupTime: string | null = (companySettings as any)?.pickup_time ?? null;
    const defaultDropoffTime: string | null = (companySettings as any)?.dropoff_time ?? null;
    const companyTimezone: string = (companySettings as any)?.company_timezone ?? 'Europe/Bratislava';

    const body = await request.json();
    const rows: ImportPreviewRow[] = body?.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    // Split rows by intent
    const bookingRows = rows.filter(
      (r) => (r.actionType === 'create' || r.actionType === 'update') && r.matchStatus === 'matched' && r.normalized,
    );
    const blockRows = rows.filter(
      (r) => r.actionType === 'block' && r.matchStatus === 'matched' && r.normalized,
    );

    if (bookingRows.length === 0 && blockRows.length === 0) {
      return NextResponse.json({ created: 0, updated: 0, blocked: 0, errors: [] });
    }

    // Collect all candidate vehicle IDs from both sets for server-side ownership check
    const candidateVehicleIds = [
      ...new Set(
        [...bookingRows, ...blockRows]
          .map((r) => r.matchedVehicleId)
          .filter((id): id is string => !!id),
      ),
    ];

    const validVehicleIds = new Set<string>();
    if (candidateVehicleIds.length > 0) {
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('id')
        .eq('company_id', companyId)
        .in('id', candidateVehicleIds);

      for (const v of vehicles ?? []) {
        validVehicleIds.add(v.id);
      }
    }

    // ── bookings: batch-fetch existing for insert vs update decision ──────────

    // existingIdMap: key → DB row id (for update path)
    const existingIdMap: Record<string, string> = {};
    // existingDataMap: key → full row snapshot (for Bookingmood merge logic)
    const existingDataMap: Record<string, ExistingBookingData> = {};

    if (bookingRows.length > 0) {
      // Map each source_booking_id to the incoming source_type so we can build
      // the map keys using the *incoming* type (not the stored one).
      const incomingTypeForId = new Map<string, string>();
      const querySourceTypes = new Set<string>();

      for (const row of bookingRows) {
        const n = row.normalized!;
        incomingTypeForId.set(n.sourceBookingId, n.sourceType);

        if (isBookingmoodFamilyMember(n.sourceType, n.rawMetadata)) {
          // Bookingmood family: search all three source_types in one query so
          // we find the record regardless of which channel last wrote it.
          for (const fst of BOOKINGMOOD_FAMILY) {
            querySourceTypes.add(fst);
          }
        } else {
          // Non-Bookingmood sources (including plain iCal) are isolated.
          querySourceTypes.add(n.sourceType);
        }
      }

      const allBookingIds = bookingRows.map((r) => r.normalized!.sourceBookingId);

      const { data: existing } = await supabase
        .from('bookings')
        .select(
          'id, source_type, source_booking_id, status, customer_name, customer_phone, customer_email, notes, source_reference, pickup_at, return_at, vehicle_id, customer_id, staff_metadata',
        )
        .eq('company_id', companyId)
        .in('source_type', [...querySourceTypes])
        .in('source_booking_id', allBookingIds);

      for (const e of existing ?? []) {
        // Key uses the *incoming* source_type so the lookup below
        // (`${n.sourceType}:${n.sourceBookingId}`) always matches, regardless
        // of how the existing record was originally imported.
        const incomingType = incomingTypeForId.get(e.source_booking_id);
        if (incomingType) {
          const key = `${incomingType}:${e.source_booking_id}`;
          existingIdMap[key] = e.id;
          existingDataMap[key] = {
            id: e.id,
            source_type: e.source_type,
            status: e.status,
            customer_name: e.customer_name ?? null,
            customer_phone: e.customer_phone ?? null,
            customer_email: e.customer_email ?? null,
            notes: e.notes ?? null,
            source_reference: e.source_reference ?? null,
            pickup_at: e.pickup_at ?? null,
            return_at: e.return_at ?? null,
            vehicle_id: e.vehicle_id ?? null,
            customer_id: e.customer_id ?? null,
            staff_metadata: (e.staff_metadata as Record<string, unknown> | null) ?? null,
          };
        }
      }
    }

    const now = new Date().toISOString();
    const syncRunId = crypto.randomUUID();
    let created = 0;
    let updated = 0;
    let blocked = 0;
    const errors: { rowNumber: number; message: string }[] = [];
    const newBookingIds: string[] = [];
    const updatedBookingIds: string[] = [];

    // ── process booking rows ──────────────────────────────────────────────────
    for (const row of bookingRows) {
      const n = row.normalized!;

      const validationError = validateNormalized(n);
      if (validationError) {
        errors.push({ rowNumber: row.rowNumber, message: validationError });
        continue;
      }

      if (!row.matchedVehicleId) {
        errors.push({ rowNumber: row.rowNumber, message: 'Missing matchedVehicleId' });
        continue;
      }
      if (!validVehicleIds.has(row.matchedVehicleId)) {
        errors.push({ rowNumber: row.rowNumber, message: 'Invalid vehicle for company' });
        continue;
      }

      const key = `${n.sourceType}:${n.sourceBookingId}`;
      const existingId = existingIdMap[key];

      if (existingId) {
        const existing = existingDataMap[key];

        // Bookingmood iCal updating an existing Bookingmood CSV/JSON booking:
        // apply safe-merge rules to avoid clobbering richer structured data.
        const isBookingmoodIcalMerge =
          n.sourceType === 'ical' &&
          isBookingmoodOriginIcal(n.rawMetadata) &&
          existing != null &&
          isBookingmoodRicherSource(existing.source_type);

        if (isBookingmoodIcalMerge) {
          // ── Preserve richer CSV/JSON contact fields ──────────────────────
          // Keep existing value when non-empty; fall back to iCal only if missing.
          const mergedName = existing!.customer_name?.trim() || n.customerName || '';
          const mergedPhone = existing!.customer_phone?.trim() || n.customerPhone || '';
          const mergedEmail = existing!.customer_email?.trim() || n.customerEmail || null;
          const mergedNotes = existing!.notes?.trim() || n.notes || null;
          const mergedSourceRef = existing!.source_reference?.trim() || n.sourceReference || null;

          // ── Time precedence ───────────────────────────────────────────────
          // Treat the iCal value as date-only when it is either:
          //   • a bare DATE (YYYYMMDD → T00:00:00.000Z after parseDtToIso), or
          //   • a DATE-TIME with TZID whose wall-clock time is midnight in
          //     COMPANY_TIMEZONE (e.g. 2026-03-30T22:00:00.000Z for
          //     DTSTART;TZID=Europe/Bratislava:20260331T000000).
          //
          // When the iCal carries no real time:
          //   • keep the existing stored time only if it is meaningful (non-midnight)
          //   • if the existing stored time is midnight or null (a placeholder),
          //     replace it with the company default so it is corrected on update
          // Only explicit real iCal times may override unconditionally.
          const pickupIsDateOnly = !n.pickupAtExplicitUtc && (looksDateOnly(n.pickupAt) || isMidnightInCompanyTz(n.pickupAt, companyTimezone));
          const returnIsDateOnly = !n.returnAtExplicitUtc && (looksDateOnly(n.returnAt) || isMidnightInCompanyTz(n.returnAt, companyTimezone));
          // When the iCal carries only a date (no real time), preserve the
          // existing CF-enriched time-of-day — but re-apply it to the NEW
          // source date so a date change in the source is never silently lost.
          const mergedPickupAt =
            pickupIsDateOnly && existing!.pickup_at && !looksDateOnly(existing!.pickup_at) && !isMidnightInCompanyTz(existing!.pickup_at, companyTimezone)
              ? localToUtcIso(
                  localDateInCompanyTz(n.pickupAt, companyTimezone),
                  localTimeInCompanyTz(existing!.pickup_at, companyTimezone),
                  companyTimezone,
                )
              : applyDefaultTime(n.pickupAt, defaultPickupTime, companyTimezone, n.pickupAtExplicitUtc);
          const mergedReturnAt =
            returnIsDateOnly && existing!.return_at && !looksDateOnly(existing!.return_at) && !isMidnightInCompanyTz(existing!.return_at, companyTimezone)
              ? localToUtcIso(
                  localDateInCompanyTz(n.returnAt, companyTimezone),
                  localTimeInCompanyTz(existing!.return_at, companyTimezone),
                  companyTimezone,
                )
              : applyDefaultTime(n.returnAt, defaultDropoffTime, companyTimezone, n.returnAtExplicitUtc, true);

          const customerId = await findOrCreateCustomer(
            supabase,
            companyId,
            mergedName,
            mergedPhone,
            mergedEmail,
          );

          // Fill any missing trip-detail keys in staff_metadata from notes text.
          // Uses the merged notes (existing takes priority over incoming iCal notes).
          const parsedMetaBmIcal = parseNotesForTripDetails(mergedNotes);
          const updatedStaffMetaBmIcal = mergeStaffMeta(existing!.staff_metadata, parsedMetaBmIcal);

          // ── Allowed iCal updates ──────────────────────────────────────────
          // Only status, times (when richer), vehicle, and sync fields are
          // updated; source_type / source_booking_id are NOT changed so the
          // record retains its CSV/JSON provenance.
          const { error } = await supabase
            .from('bookings')
            .update({
              ...(existing!.status !== 'completed' ? { status: mapExternalStatus(n.externalStatus) } : {}),
              vehicle_id: row.matchedVehicleId,
              customer_name: mergedName,
              customer_phone: mergedPhone,
              customer_email: mergedEmail,
              notes: mergedNotes,
              source_reference: mergedSourceRef,
              pickup_at: mergedPickupAt,
              return_at: mergedReturnAt,
              import_last_seen_at: now,
              source_metadata: n.rawMetadata,
              sync_run_id: syncRunId,
              ...(customerId ? { customer_id: customerId.id } : {}),
              ...(updatedStaffMetaBmIcal ? { staff_metadata: updatedStaffMetaBmIcal } : {}),
            })
            .eq('id', existingId);

          if (error) {
            errors.push({ rowNumber: row.rowNumber, message: error.message });
            if (customerId?.isNew) await deleteCustomerIfUnreferenced(supabase, customerId.id);
          } else {
            updated++;
            updatedBookingIds.push(existingId);
          }
        } else {
          // Standard update: preserve existing non-empty operational fields;
          // imports may only fill fields that are currently empty.
          const mergedCustomerName = existing?.customer_name?.trim() || n.customerName!;
          const mergedCustomerPhone = (existing?.customer_phone?.trim() || n.customerPhone) ?? '';
          const mergedCustomerEmail = (existing?.customer_email?.trim() || n.customerEmail) ?? null;
          const mergedNotes = (existing?.notes?.trim() || n.notes) ?? null;
          const mergedSourceRef = (existing?.source_reference?.trim() || n.sourceReference) ?? null;
          const mergedVehicleId = existing?.vehicle_id || row.matchedVehicleId;

          const resolvedPickupAt = applyDefaultTime(n.pickupAt, defaultPickupTime, companyTimezone, n.pickupAtExplicitUtc);
          const resolvedReturnAt = applyDefaultTime(n.returnAt, defaultDropoffTime, companyTimezone, n.returnAtExplicitUtc, true);

          let customerId: { id: string; isNew: boolean } | null = null;
          if (!existing?.customer_id) {
            customerId = await findOrCreateCustomer(
              supabase,
              companyId,
              mergedCustomerName,
              mergedCustomerPhone || null,
              mergedCustomerEmail,
            );
          }

          const parsedMetaUpdate = parseNotesForTripDetails(mergedNotes);
          const updatedStaffMetaUpdate = mergeStaffMeta(existing?.staff_metadata ?? null, parsedMetaUpdate);

          const { error } = await supabase
            .from('bookings')
            .update({
              company_id: companyId,
              ...(existing?.status !== 'completed' ? { status: mapExternalStatus(n.externalStatus) } : {}),
              pickup_at: resolvedPickupAt,
              return_at: resolvedReturnAt,
              vehicle_id: mergedVehicleId,
              customer_name: mergedCustomerName,
              customer_phone: mergedCustomerPhone,
              customer_email: mergedCustomerEmail,
              notes: mergedNotes,
              source_type: n.sourceType,
              source_booking_id: n.sourceBookingId,
              source_reference: mergedSourceRef,
              import_last_seen_at: now,
              source_metadata: n.rawMetadata,
              sync_run_id: syncRunId,
              ...(existing?.customer_id
                ? { customer_id: existing.customer_id }
                : customerId
                  ? { customer_id: customerId.id }
                  : {}),
              ...(updatedStaffMetaUpdate ? { staff_metadata: updatedStaffMetaUpdate } : {}),
            })
            .eq('id', existingId);

          if (error) {
            errors.push({ rowNumber: row.rowNumber, message: error.message });
            if (customerId?.isNew) await deleteCustomerIfUnreferenced(supabase, customerId.id);
          } else {
            updated++;
            updatedBookingIds.push(existingId);
          }
        }
      } else {
        // Insert new booking.
        // applyDefaultTime handles date-only/midnight values: if defaultPickupTime
        // is configured it replaces midnight with the company's pickup/dropoff
        // time; if not configured the date-only value is written as-is.
        const customerId = await findOrCreateCustomer(
          supabase,
          companyId,
          n.customerName!,
          n.customerPhone ?? null,
          n.customerEmail ?? null,
        );

        const parsedMetaInsert = parseNotesForTripDetails(n.notes ?? null);
        const initialStaffMeta = mergeStaffMeta(null, parsedMetaInsert);

        const { data: newBooking, error } = await supabase
          .from('bookings')
          .insert({
            company_id: companyId,
            status: mapExternalStatus(n.externalStatus),
            pickup_at: applyDefaultTime(n.pickupAt, defaultPickupTime, companyTimezone, n.pickupAtExplicitUtc),
            return_at: applyDefaultTime(n.returnAt, defaultDropoffTime, companyTimezone, n.returnAtExplicitUtc, true),
            vehicle_id: row.matchedVehicleId,
            customer_name: n.customerName!,
            customer_phone: n.customerPhone ?? '',
            customer_email: n.customerEmail ?? null,
            notes: n.notes ?? null,
            source_type: n.sourceType,
            source_booking_id: n.sourceBookingId,
            source_reference: n.sourceReference ?? null,
            import_last_seen_at: now,
            source_metadata: n.rawMetadata,
            sync_run_id: syncRunId,
            booking_number: generateBookingNumber(),
            booking_code: generateBookingCode(),
            imported_at: now,
            payment_type: null,
            balance_invoice_sent: null,
            prearrival_whatsapp_sent: null,
            return_whatsapp_sent: null,
            ...(customerId ? { customer_id: customerId.id } : {}),
            ...(initialStaffMeta ? { staff_metadata: initialStaffMeta } : {}),
          })
          .select('id')
          .single();

        if (error) {
          errors.push({ rowNumber: row.rowNumber, message: error.message });
          if (customerId?.isNew) await deleteCustomerIfUnreferenced(supabase, customerId.id);
        } else {
          created++;
          newBookingIds.push(newBooking.id);
        }
      }
    }

    // ── process block rows ────────────────────────────────────────────────────
    for (const row of blockRows) {
      const n = row.normalized!;

      if (!row.matchedVehicleId) {
        errors.push({ rowNumber: row.rowNumber, message: 'Missing matchedVehicleId' });
        continue;
      }
      if (!validVehicleIds.has(row.matchedVehicleId)) {
        errors.push({ rowNumber: row.rowNumber, message: 'Invalid vehicle for company' });
        continue;
      }
      if (!n.pickupAt || !n.returnAt) {
        errors.push({ rowNumber: row.rowNumber, message: 'Missing start/end date for block' });
        continue;
      }

      // If the block was manually edited in CamperFlow, preserve user changes —
      // only refresh import_last_seen_at so the sync cleanup doesn't prune it.
      const { data: lockedCheck } = await supabase
        .from('vehicle_blocks')
        .select('id, sync_locked')
        .eq('company_id', companyId)
        .eq('source_type', n.sourceType)
        .eq('source_booking_id', n.sourceBookingId)
        .maybeSingle();

      if (lockedCheck?.sync_locked) {
        const { error } = await supabase
          .from('vehicle_blocks')
          .update({ import_last_seen_at: now })
          .eq('id', lockedCheck.id);
        if (error) errors.push({ rowNumber: row.rowNumber, message: error.message });
        else blocked++;
        continue;
      }

      const { error } = await supabase
        .from('vehicle_blocks')
        .upsert(
          {
            company_id: companyId,
            vehicle_id: row.matchedVehicleId,
            source_type: n.sourceType,
            source_booking_id: n.sourceBookingId,
            source_reference: n.sourceReference ?? null,
            label: n.label ?? null,
            block_type: n.blockType ?? 'unavailable',
            start_at: applyDefaultTime(n.pickupAt, defaultPickupTime, companyTimezone, n.pickupAtExplicitUtc),
            end_at: applyDefaultTime(n.returnAt, defaultDropoffTime, companyTimezone, n.returnAtExplicitUtc, true),
            source_metadata: n.rawMetadata,
            import_last_seen_at: now,
            updated_at: now,
          },
          { onConflict: 'company_id,source_type,source_booking_id' },
        );

      if (error) {
        errors.push({ rowNumber: row.rowNumber, message: error.message });
      } else {
        blocked++;
      }
    }

    // Delete stale imported vehicle_blocks not seen in this sync run.
    // Scoped to source_types present in this batch so CF-created/manual blocks
    // (different source_type) are never touched. sync_locked blocks are skipped.
    if (blockRows.length > 0) {
      const blockSourceTypes = [...new Set(blockRows.map((r) => r.normalized!.sourceType))];
      await supabase
        .from('vehicle_blocks')
        .delete()
        .eq('company_id', companyId)
        .in('vehicle_id', [...validVehicleIds])
        .in('source_type', blockSourceTypes)
        .eq('sync_locked', false)
        .lt('import_last_seen_at', now);
    }

    // Cancel stale bookings that were not seen in this sync run.
    // Applies only to source types that are fully replaced each import.
    let cancelled = 0;
    const { data: staleBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('company_id', companyId)
      .in('vehicle_id', [...validVehicleIds])
      .in('source_type', ['bookingmood_csv', 'ical'])
      .neq('sync_run_id', syncRunId)
      .not('status', 'in', '("cancelled","completed")');

    if (staleBookings && staleBookings.length > 0) {
      const staleIds = staleBookings.map((b) => b.id);
      const { error: cancelError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .in('id', staleIds);

      if (!cancelError) cancelled = staleIds.length;
    }

    // Provision checklists for newly created bookings; failures are non-fatal.
    await Promise.all(
      newBookingIds.map((id) =>
        provisionBookingChecklists(id).catch((err) =>
          console.error('[import] provisionBookingChecklists failed for booking', id, err)
        )
      )
    );

    // Normalize imported booking states: past → completed, active → on_rent with handover done.
    await postImportNormalize([...newBookingIds, ...updatedBookingIds], now).catch((err) =>
      console.error('[import] postImportNormalize failed', err)
    );

    return NextResponse.json({ created, updated, blocked, cancelled, errors });
  } catch (err: unknown) {
    console.error('Booking import route error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
