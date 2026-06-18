import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: bookingId } = await params;
    const supabase = await createClient();

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Staff profile + company scope
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

    // Parse body
    const body = await request.json().catch(() => ({}));
    const revertReason: string | undefined = body?.revert_reason?.trim() || undefined;

    // Verify booking belongs to this company
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('id', bookingId)
      .eq('company_id', companyId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Only write booking row if it needs flipping; if already confirmed, skip (idempotent)
    let updated = booking;
    if (booking.status === 'on_rent') {
      const { data: reverted, error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          reverted_at: new Date().toISOString(),
          reverted_by: user.id,
          revert_reason: revertReason ?? null,
        })
        .eq('id', bookingId)
        .eq('company_id', companyId)
        .select('id, status, reverted_at, reverted_by, revert_reason')
        .single();

      if (updateError) {
        console.error('[revert booking]', updateError);
        return NextResponse.json({ error: 'Failed to revert booking' }, { status: 500 });
      }
      updated = reverted;
    }

    // ── Reset all booking checklist instances (handover, return, cleaning, mechanical)
    // Order matters: instance FIRST, items SECOND.
    // Resetting items may fire DB triggers that write back to checklist_instances.
    // If the instance is still 'completed' at that point a lock trigger can raise
    // P0001 and the items UPDATE fails. Resetting the instance to 'pending' first
    // eliminates that conflict.
    //
    // Service role is required here: the RLS USING clause on checklist_instances
    // only permits writes when status='completed'. An in_progress instance
    // (partial work that was never finished) would be silently excluded from
    // both SELECT and UPDATE by the user-scoped client, causing the reset to be
    // skipped entirely. Auth/company scope is enforced above; service role is used
    // only for the checklist read+reset where RLS would otherwise block legitimate
    // admin operations.
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: instances, error: instanceFetchError } = await serviceClient
      .from('checklist_instances')
      .select('id, status, started_at, started_by, completed_at, completed_by')
      .eq('booking_id', bookingId)
      .in('checklist_type', ['handover', 'return', 'cleaning', 'mechanical']);

    if (instanceFetchError) {
      console.error('[revert booking] failed to fetch checklist instances', instanceFetchError);
      return NextResponse.json(
        { error: 'Booking reverted but failed to find checklist instances for reset' },
        { status: 500 },
      );
    }

    if (instances && instances.length > 0) {
      const instanceIds = instances.map((i) => i.id);

      // Step 0: Capture snapshot and write history BEFORE any reset.
      // Mirrors the reopen flow in useChecklistReopen.ts.
      for (const inst of instances) {
        const { data: snapshotItems } = await serviceClient
          .from('checklist_instance_items')
          .select('id, template_item_id, checked, notes, checked_at, checked_by, issue_flag, issue_title, issue_description, issue_severity, issue_blocking, linked_vehicle_issue_id')
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
            reason: revertReason ?? null,
          });

        if (historyError) {
          console.error('[revert booking] failed to insert reopen history', historyError);
          // Non-fatal: log and continue — reset should still proceed.
        }
      }

      // Step 1: Reset instance FIRST — clears 'completed'/'in_progress' status so
      // that the items-change status-sync trigger (fired in step 2) runs in a
      // 'pending' context and does not trip the lock trigger (P0001).
      const { data: resetData, error: instanceResetError } = await serviceClient
        .from('checklist_instances')
        .update({
          status: 'pending',
          started_at: null,
          started_by: null,
          completed_at: null,
          completed_by: null,
          // handover fields
          office_deposit_collected: false,
          office_id_verified: false,
          office_contract_signed: false,
          handover_keys_given: false,
          handover_documents_given: false,
          // return fields
          return_keys_received: false,
          return_documents_received: false,
          return_contract_closed: false,
          return_deposit_status: null,
        })
        .in('id', instanceIds)
        .select('id');

      if (instanceResetError) {
        console.error('[revert booking] failed to reset checklist instances', instanceResetError);
        return NextResponse.json(
          { error: 'Booking reverted but failed to reset checklist instance status' },
          { status: 500 },
        );
      }

      if (!resetData || resetData.length === 0) {
        console.error(
          '[revert booking] checklist instance reset affected 0 rows — missing row? Instance IDs:',
          instanceIds,
        );
        return NextResponse.json(
          { error: 'Booking reverted but checklist instance update affected 0 rows' },
          { status: 500 },
        );
      }

      // Step 2: Reset all checklist items — instance is now 'pending' so the
      // status-sync trigger fires safely without hitting the lock.
      const { error: itemsResetError } = await serviceClient
        .from('checklist_instance_items')
        .update({
          checked: false,
          checked_at: null,
          checked_by: null,
        })
        .in('instance_id', instanceIds);

      if (itemsResetError) {
        console.error('[revert booking] failed to reset checklist items', itemsResetError);
        return NextResponse.json(
          { error: 'Booking reverted but failed to reset checklist items' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ booking: updated });
  } catch (err) {
    console.error('[revert booking] unexpected', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}