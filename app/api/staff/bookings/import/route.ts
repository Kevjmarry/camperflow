import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportPreviewRow, NormalizedImportBooking } from '@/lib/bookings/import/types';

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

// Timezone used to interpret company default pickup/dropoff times.
// Handles CET (UTC+1) and CEST (UTC+2) automatically via the DST logic below.
const COMPANY_TIMEZONE = 'Europe/Bratislava';

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
function applyDefaultTime(dateStr: string, defaultTime: string | null): string {
  if (!defaultTime || !looksDateOnly(dateStr)) return dateStr;
  const datePart = dateStr.trim().slice(0, 10); // always "YYYY-MM-DD"
  return localToUtcIso(datePart, defaultTime, COMPANY_TIMEZONE);
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

/**
 * Returns true when the raw iCal DTSTART is an all-day DATE value (8-digit
 * YYYYMMDD, no time component). This is the authoritative signal — checking the
 * raw value avoids false positives from midnight UTC strings that were produced
 * by the normalizer from a timed event that happened to land at midnight.
 */
function isIcalAllDay(rawMetadata: Record<string, unknown>): boolean {
  const raw = rawMetadata?.raw as Record<string, unknown> | undefined;
  if (!raw) return false;
  const dtstart = typeof raw.DTSTART === 'string' ? raw.DTSTART.trim() : '';
  return /^\d{8}$/.test(dtstart);
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
): Promise<string | null> {
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
    if (byEmail) return byEmail.id;
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
    if (byNamePhone) return byNamePhone.id;
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
  return created.id;
}

// Shape of the existing row fields we need for merge decisions.
interface ExistingBookingData {
  id: string;
  source_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  source_reference: string | null;
  pickup_at: string | null;
  return_at: string | null;
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

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

    const companyId: string = staffProfile.company_id;

    // Fetch company default pickup/return times to fill in date-only rows
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('pickup_time, dropoff_time')
      .eq('id', companyId)
      .maybeSingle();
    const defaultPickupTime: string | null = companySettings?.pickup_time ?? null;
    const defaultDropoffTime: string | null = companySettings?.dropoff_time ?? null;

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
          'id, source_type, source_booking_id, customer_name, customer_phone, customer_email, notes, source_reference, pickup_at, return_at',
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
            customer_name: e.customer_name ?? null,
            customer_phone: e.customer_phone ?? null,
            customer_email: e.customer_email ?? null,
            notes: e.notes ?? null,
            source_reference: e.source_reference ?? null,
            pickup_at: e.pickup_at ?? null,
            return_at: e.return_at ?? null,
          };
        }
      }
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let blocked = 0;
    const errors: { rowNumber: number; message: string }[] = [];

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
          // If the iCal event is all-day (raw DTSTART is 8-digit DATE, no time),
          // the normalizer emits midnight UTC — a weaker signal than the
          // specific pickup/return times stored from the CSV/JSON import.
          // In that case, keep the existing timestamps unchanged.
          // Only overwrite if the iCal event carries an actual time component.
          const icalIsAllDay = isIcalAllDay(n.rawMetadata);
          const mergedPickupAt =
            icalIsAllDay && existing!.pickup_at
              ? existing!.pickup_at
              : applyDefaultTime(n.pickupAt, defaultPickupTime);
          const mergedReturnAt =
            icalIsAllDay && existing!.return_at
              ? existing!.return_at
              : applyDefaultTime(n.returnAt, defaultDropoffTime);

          const customerId = await findOrCreateCustomer(
            supabase,
            companyId,
            mergedName,
            mergedPhone,
            mergedEmail,
          );

          // ── Allowed iCal updates ──────────────────────────────────────────
          // Only status, times (when richer), vehicle, and sync fields are
          // updated; source_type / source_booking_id are NOT changed so the
          // record retains its CSV/JSON provenance.
          const { error } = await supabase
            .from('bookings')
            .update({
              status: mapExternalStatus(n.externalStatus),
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
              ...(customerId ? { customer_id: customerId } : {}),
            })
            .eq('id', existingId);

          if (error) {
            errors.push({ rowNumber: row.rowNumber, message: error.message });
          } else {
            updated++;
          }
        } else {
          // Standard update: full overwrite with incoming values.
          const customerId = await findOrCreateCustomer(
            supabase,
            companyId,
            n.customerName!,
            n.customerPhone ?? null,
            n.customerEmail ?? null,
          );

          const { error } = await supabase
            .from('bookings')
            .update({
              company_id: companyId,
              status: mapExternalStatus(n.externalStatus),
              pickup_at: applyDefaultTime(n.pickupAt, defaultPickupTime),
              return_at: applyDefaultTime(n.returnAt, defaultDropoffTime),
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
              ...(customerId ? { customer_id: customerId } : {}),
            })
            .eq('id', existingId);

          if (error) {
            errors.push({ rowNumber: row.rowNumber, message: error.message });
          } else {
            updated++;
          }
        }
      } else {
        // Insert new booking.
        const customerId = await findOrCreateCustomer(
          supabase,
          companyId,
          n.customerName!,
          n.customerPhone ?? null,
          n.customerEmail ?? null,
        );

        const { error } = await supabase
          .from('bookings')
          .insert({
            company_id: companyId,
            status: mapExternalStatus(n.externalStatus),
            pickup_at: applyDefaultTime(n.pickupAt, defaultPickupTime),
            return_at: applyDefaultTime(n.returnAt, defaultDropoffTime),
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
            booking_number: generateBookingNumber(),
            booking_code: generateBookingCode(),
            imported_at: now,
            ...(customerId ? { customer_id: customerId } : {}),
          });

        if (error) {
          errors.push({ rowNumber: row.rowNumber, message: error.message });
        } else {
          created++;
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
            start_at: applyDefaultTime(n.pickupAt, defaultPickupTime),
            end_at: applyDefaultTime(n.returnAt, defaultDropoffTime),
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

    return NextResponse.json({ created, updated, blocked, errors });
  } catch (err: unknown) {
    console.error('Booking import route error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
