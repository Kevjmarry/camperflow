import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// ─── Shared auth + company scope helper ──────────────────────────────────────

async function resolveAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized', status: 401 as const };

  const { data: staffProfile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('company_id, role')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !staffProfile) {
    return { error: 'Staff profile not found', status: 403 as const };
  }
  if (staffProfile.role !== 'admin') {
    return { error: 'Insufficient permissions', status: 403 as const };
  }

  return { user, companyId: staffProfile.company_id as string };
}

function makeServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ─── GET — List stale bookings for review ─────────────────────────────────────

export async function GET(_request: NextRequest) {
  try {
    const auth = await resolveAdmin();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth;
    const serviceClient = makeServiceClient();

    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

    const { data: bookings, error: bookingsError } = await serviceClient
      .from('bookings')
      .select('id, status, customer_name, vehicle_id, return_at')
      .eq('company_id', companyId)
      .in('status', ['draft', 'confirmed', 'on_rent'])
      .gte('return_at', yearStart)
      .lt('return_at', now.toISOString())
      .order('return_at', { ascending: true });

    if (bookingsError) throw bookingsError;
    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ bookings: [] });
    }

    // Fetch vehicle names
    const vehicleIds = [...new Set(bookings.map((b) => b.vehicle_id).filter(Boolean))];
    const vehicleMap: Record<string, string> = {};
    if (vehicleIds.length > 0) {
      const { data: vehicles } = await serviceClient
        .from('vehicles')
        .select('id, name')
        .in('id', vehicleIds);
      for (const v of vehicles ?? []) {
        vehicleMap[v.id] = v.name;
      }
    }

    // Count pending checklist instances per booking
    const bookingIds = bookings.map((b) => b.id);
    const { data: instanceCounts } = await serviceClient
      .from('checklist_instances')
      .select('booking_id')
      .in('booking_id', bookingIds)
      .neq('status', 'completed');

    const countByBooking: Record<string, number> = {};
    for (const row of instanceCounts ?? []) {
      countByBooking[row.booking_id] = (countByBooking[row.booking_id] ?? 0) + 1;
    }

    const result = bookings.map((b) => ({
      id: b.id,
      status: b.status,
      customer_name: b.customer_name ?? null,
      vehicle_name: b.vehicle_id ? (vehicleMap[b.vehicle_id] ?? null) : null,
      return_at: b.return_at,
      pending_instances: countByBooking[b.id] ?? 0,
    }));

    return NextResponse.json({ bookings: result });
  } catch (err) {
    console.error('[backlog-review GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST — Apply per-booking decisions ───────────────────────────────────────

type Action = 'complete' | 'cancel' | 'skip';
interface Decision { id: string; action: Action }

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAdmin();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { user, companyId } = auth;

    const body = await request.json().catch(() => ({}));
    const reason: string = (body?.reason ?? '').trim();
    if (reason.length < 10) {
      return NextResponse.json(
        { error: 'reason must be at least 10 characters' },
        { status: 422 },
      );
    }

    const decisions: Decision[] = Array.isArray(body?.decisions) ? body.decisions : [];
    const activeDecisions = decisions.filter((d) => d.action !== 'skip');
    if (activeDecisions.length === 0) {
      return NextResponse.json({
        closed: { completed: 0, cancelled: 0, skipped: decisions.length },
        instances_closed: 0,
      });
    }

    const serviceClient = makeServiceClient();
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const yearStart = new Date(Date.UTC(nowDate.getUTCFullYear(), 0, 1)).toISOString();

    const toCompleteIds = activeDecisions.filter((d) => d.action === 'complete').map((d) => d.id);
    const toCancelIds = activeDecisions.filter((d) => d.action === 'cancel').map((d) => d.id);
    const allActiveIds = activeDecisions.map((d) => d.id);

    // ── 1. Verify all active bookings belong to this company and are still stale ─
    // Also enforce the current-year boundary to match what GET exposes.
    const { data: verifiedBookings, error: verifyError } = await serviceClient
      .from('bookings')
      .select('id, status')
      .eq('company_id', companyId)
      .in('id', allActiveIds)
      .in('status', ['draft', 'confirmed', 'on_rent'])
      .gte('return_at', yearStart)
      .lt('return_at', now);

    if (verifyError) throw verifyError;

    const verifiedIds = new Set((verifiedBookings ?? []).map((b) => b.id));
    const safeCompleteIds = toCompleteIds.filter((id) => verifiedIds.has(id));
    const safeCancelIds = toCancelIds.filter((id) => verifiedIds.has(id));
    const safeAllIds = [...safeCompleteIds, ...safeCancelIds];

    if (safeAllIds.length === 0) {
      return NextResponse.json({
        closed: { completed: 0, cancelled: 0, skipped: decisions.length },
        instances_closed: 0,
      });
    }

    // ── 2. Fetch non-completed checklist instances for active bookings ─────────
    const { data: instances, error: instancesFetchError } = await serviceClient
      .from('checklist_instances')
      .select('id, checklist_type, status, started_at, started_by, completed_at, completed_by')
      .in('booking_id', safeAllIds)
      .neq('status', 'completed');

    if (instancesFetchError) {
      console.error('[backlog-review] failed to fetch instances', instancesFetchError);
      return NextResponse.json({ error: 'Failed to fetch checklist instances' }, { status: 500 });
    }

    const pendingInstances = instances ?? [];

    // ── 3. Snapshot each instance into checklist_reopen_history ───────────────
    // Non-fatal: log failures but continue.
    for (const inst of pendingInstances) {
      const { data: snapshotItems } = await serviceClient
        .from('checklist_instance_items')
        .select(
          'id, template_item_id, checked, notes, checked_at, checked_by, ' +
          'issue_flag, issue_title, issue_description, issue_severity, ' +
          'issue_blocking, linked_vehicle_issue_id',
        )
        .eq('instance_id', inst.id);

      const snapshot = {
        instance: {
          status: inst.status,
          started_at: inst.started_at,
          started_by: inst.started_by,
          completed_at: inst.completed_at,
          completed_by: inst.completed_by,
        },
        items: snapshotItems ?? [],
      };

      const { error: historyError } = await serviceClient
        .from('checklist_reopen_history')
        .insert({
          checklist_instance_id: inst.id,
          snapshot,
          reopened_by: user.id,
          reason: `Backlog review — admin closed booking — ${reason}`,
        });

      if (historyError) {
        console.error('[backlog-review] snapshot insert failed for instance', inst.id, historyError);
      }
    }

    // ── 4. Force-complete checklist instances in safe order ───────────────────
    // handover FIRST — trg_prevent_return_before_handover blocks return completion
    // if any handover instance for the same booking is still not completed.
    const instanceUpdate = {
      status: 'completed',
      completed_at: now,
      completed_by: user.id,
    };

    const typeOrder = ['handover', 'return', 'cleaning', 'mechanical'] as const;
    let instancesClosed = 0;

    for (const checklistType of typeOrder) {
      const ids = pendingInstances
        .filter((i) => i.checklist_type === checklistType)
        .map((i) => i.id);
      if (ids.length === 0) continue;

      const { error: updateError } = await serviceClient
        .from('checklist_instances')
        .update(instanceUpdate)
        .in('id', ids);

      if (updateError) {
        console.error(`[backlog-review] failed to close ${checklistType} instances`, updateError);
        return NextResponse.json(
          { error: `Failed to close ${checklistType} checklist instances` },
          { status: 500 },
        );
      }
      instancesClosed += ids.length;
    }

    const orderedTypes = new Set(typeOrder as unknown as string[]);
    const remainingIds = pendingInstances
      .filter((i) => !orderedTypes.has(i.checklist_type))
      .map((i) => i.id);
    if (remainingIds.length > 0) {
      const { error: remainingError } = await serviceClient
        .from('checklist_instances')
        .update(instanceUpdate)
        .in('id', remainingIds);
      if (remainingError) {
        console.error('[backlog-review] failed to close remaining instances', remainingError);
      } else {
        instancesClosed += remainingIds.length;
      }
    }

    // ── 5. Close bookings ─────────────────────────────────────────────────────
    const auditFields = { closed_at: now, closed_by: user.id, closed_reason: reason };

    let completed = 0;
    if (safeCompleteIds.length > 0) {
      const { error: completeError } = await serviceClient
        .from('bookings')
        .update({ status: 'completed', ...auditFields })
        .in('id', safeCompleteIds)
        .eq('company_id', companyId);

      if (completeError) {
        console.error('[backlog-review] failed to complete bookings', completeError);
        return NextResponse.json({ error: 'Failed to complete bookings' }, { status: 500 });
      }
      completed = safeCompleteIds.length;
    }

    let cancelled = 0;
    if (safeCancelIds.length > 0) {
      const { error: cancelError } = await serviceClient
        .from('bookings')
        .update({ status: 'cancelled', ...auditFields })
        .in('id', safeCancelIds)
        .eq('company_id', companyId);

      if (cancelError) {
        console.error('[backlog-review] failed to cancel bookings', cancelError);
        return NextResponse.json({ error: 'Failed to cancel bookings' }, { status: 500 });
      }
      cancelled = safeCancelIds.length;
    }

    const skipped = decisions.filter((d) => d.action === 'skip').length
      + (allActiveIds.length - safeAllIds.length); // bookings that failed verification

    return NextResponse.json({
      closed: { completed, cancelled, skipped },
      instances_closed: instancesClosed,
    });
  } catch (err) {
    console.error('[backlog-review POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
