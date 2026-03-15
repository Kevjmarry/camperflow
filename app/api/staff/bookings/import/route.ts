import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
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
  if (!n.customerPhone?.trim()) return 'Missing customer_phone';
  return null;
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
    const existingIdMap: Record<string, string> = {};

    const sourceTypeGroups = new Map<string, string[]>();
    for (const row of bookingRows) {
      const st = row.normalized!.sourceType;
      if (!sourceTypeGroups.has(st)) sourceTypeGroups.set(st, []);
      sourceTypeGroups.get(st)!.push(row.normalized!.sourceBookingId);
    }

    for (const [sourceType, ids] of sourceTypeGroups) {
      const { data: existing } = await supabase
        .from('bookings')
        .select('id, source_type, source_booking_id')
        .eq('company_id', companyId)
        .eq('source_type', sourceType)
        .in('source_booking_id', ids);

      for (const e of existing ?? []) {
        existingIdMap[`${e.source_type}:${e.source_booking_id}`] = e.id;
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

      const sharedPayload = {
        company_id: companyId,
        status: mapExternalStatus(n.externalStatus),
        pickup_at: applyDefaultTime(n.pickupAt, defaultPickupTime),
        return_at: applyDefaultTime(n.returnAt, defaultDropoffTime),
        vehicle_id: row.matchedVehicleId,
        customer_name: n.customerName!,
        customer_phone: n.customerPhone!,
        customer_email: n.customerEmail ?? null,
        notes: n.notes ?? null,
        source_type: n.sourceType,
        source_booking_id: n.sourceBookingId,
        source_reference: n.sourceReference ?? null,
        import_last_seen_at: now,
        source_metadata: n.rawMetadata,
      };

      if (existingId) {
        const { error } = await supabase
          .from('bookings')
          .update(sharedPayload)
          .eq('id', existingId);

        if (error) {
          errors.push({ rowNumber: row.rowNumber, message: error.message });
        } else {
          updated++;
        }
      } else {
        const { error } = await supabase
          .from('bookings')
          .insert({
            ...sharedPayload,
            booking_number: generateBookingNumber(),
            booking_code: generateBookingCode(),
            imported_at: now,
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
