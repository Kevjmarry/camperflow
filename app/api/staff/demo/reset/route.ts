import { NextResponse } from 'next/server'
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  ALPINE_COMPANY_ID,
  SNAPSHOT_CAPTURED_AT,
  bookings as snapshotBookings,
  checklistInstances as snapshotChecklistInstances,
  checklistInstanceItems as snapshotChecklistInstanceItems,
  vehicleBlocks as snapshotVehicleBlocks,
  vehicleCompliance as snapshotVehicleCompliance,
  vehicleIssues as snapshotVehicleIssues,
  guestFeedback as snapshotGuestFeedback,
  vehicles as snapshotVehicles,
  companySettings as snapshotCompanySettings,
} from '@/lib/demo/alpine-snapshot'

type SupabaseClient = ReturnType<typeof createServiceClient>

async function insertChunked(table: string, rows: unknown[], admin: SupabaseClient, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + size) as never)
    if (error) throw new Error(`insert ${table}: ${error.message}`)
  }
}

export async function POST(req: Request) {
  const supabase = await createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  if (profile.company_id !== ALPINE_COMPANY_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cid = ALPINE_COMPANY_ID
  const body = await req.json().catch(() => ({}))

  // ── STEP 2: CONFIRM RESTORE ────────────────────────────────────────────────
  if (body?.confirmRestore === true) {
    const admin = createServiceClient()
    const snapshotVehicleIds = (snapshotVehicles as { id: string }[]).map(v => v.id)

    try {
      // ── DELETE phase ─────────────────────────────────────────────────────
      // Vehicles are NEVER deleted — they are stable identity rows.
      // Only operational child data is deleted, in FK-safe order.
      //
      // 1. checklist_instances (company_id) → CASCADE: checklist_instance_items,
      //    checklist_reopen_history; also SETs NULL on vehicle_issues source cols.
      let r = await admin.from('checklist_instances').delete().eq('company_id', cid)
      if (r.error) throw new Error(`delete checklist_instances: ${r.error.message}`)

      // 2. vehicle_issues (company_id) — instances already gone, no FK cycle risk.
      r = await admin.from('vehicle_issues').delete().eq('company_id', cid)
      if (r.error) throw new Error(`delete vehicle_issues: ${r.error.message}`)

      // 3. vehicle_compliance — no company_id column; scope by snapshot vehicle IDs.
      r = await admin.from('vehicle_compliance').delete().in('vehicle_id', snapshotVehicleIds)
      if (r.error) throw new Error(`delete vehicle_compliance: ${r.error.message}`)

      // 4. vehicle_blocks (company_id)
      r = await admin.from('vehicle_blocks').delete().eq('company_id', cid)
      if (r.error) throw new Error(`delete vehicle_blocks: ${r.error.message}`)

      // 5. bookings (company_id) — all FK references to bookings are SET NULL,
      //    so nothing cascades or blocks here.
      r = await admin.from('bookings').delete().eq('company_id', cid)
      if (r.error) throw new Error(`delete bookings: ${r.error.message}`)

      // 6. guest_feedback (company_id)
      r = await admin.from('guest_feedback').delete().eq('company_id', cid)
      if (r.error) throw new Error(`delete guest_feedback: ${r.error.message}`)

      // ── UPSERT / INSERT phase ─────────────────────────────────────────────
      // Vehicles: upsert by id — updates snapshot fields on existing rows,
      // inserts any that are genuinely new. Identity (id) is never re-created.
      const { error: vErr } = await admin
        .from('vehicles')
        .upsert(snapshotVehicles, { onConflict: 'id' })
      if (vErr) throw new Error(`upsert vehicles: ${vErr.message}`)

      // Insert remaining tables in FK dependency order:
      //   bookings → vehicle_blocks, vehicle_compliance
      //   → checklist_instances → vehicle_issues → checklist_instance_items
      //   → guest_feedback
      await insertChunked('bookings', snapshotBookings, admin)
      await insertChunked('vehicle_blocks', snapshotVehicleBlocks, admin)
      await insertChunked('vehicle_compliance', snapshotVehicleCompliance, admin)

      // The DB has an out-of-band AFTER INSERT trigger on bookings that
      // auto-provisions 4 checklist_instances per non-cancelled booking
      // (paired with the out-of-band checklist_instances_booking_template_uidx
      // constraint).  Delete those trigger-created rows before inserting the
      // snapshot's instances, which carry the canonical IDs and state.
      r = await admin.from('checklist_instances').delete().eq('company_id', cid)
      if (r.error) throw new Error(`delete checklist_instances (post-booking-insert): ${r.error.message}`)

      await insertChunked('checklist_instances', snapshotChecklistInstances, admin)
      await insertChunked('vehicle_issues', snapshotVehicleIssues, admin)

      // Inserting checklist_instances fires an out-of-band AFTER INSERT trigger
      // that auto-provisions checklist_instance_items (same pattern as the booking
      // trigger above).  Delete those placeholder items — scoped to snapshot
      // instance IDs — before restoring the canonical snapshot items.
      const snapshotInstanceIds = (snapshotChecklistInstances as { id: string }[]).map(i => i.id)
      r = await admin.from('checklist_instance_items').delete().in('instance_id', snapshotInstanceIds)
      if (r.error) throw new Error(`delete checklist_instance_items (post-instance-insert): ${r.error.message}`)

      await insertChunked('checklist_instance_items', snapshotChecklistInstanceItems, admin)
      if (snapshotGuestFeedback.length > 0) {
        await insertChunked('guest_feedback', snapshotGuestFeedback, admin)
      }

      // company_settings: upsert — restores snapshot column values, preserves row.
      const { error: csErr } = await admin
        .from('company_settings')
        .upsert(snapshotCompanySettings, { onConflict: 'id' })
      if (csErr) throw new Error(`upsert company_settings: ${csErr.message}`)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Restore failed' },
        { status: 500 },
      )
    }

    return NextResponse.json({ restored: true })
  }

  // ── STEP 1: DRY-RUN ───────────────────────────────────────────────────────
  // Phase 1: tables with a direct company_id column
  const [bookingsRes, instancesRes, blocksRes, feedbackRes, vehiclesRes] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('company_id', cid),
    supabase.from('checklist_instances').select('id').eq('company_id', cid),
    supabase.from('vehicle_blocks').select('id', { count: 'exact', head: true }).eq('company_id', cid),
    supabase.from('guest_feedback').select('id', { count: 'exact', head: true }).eq('company_id', cid),
    supabase.from('vehicles').select('id').eq('company_id', cid),
  ])

  const instanceIds = (instancesRes.data ?? []).map((r: { id: string }) => r.id)
  const vehicleIds  = (vehiclesRes.data ?? []).map((r: { id: string }) => r.id)

  // Phase 2: tables joined via parent IDs (no direct company_id column)
  const zero = { count: 0 as number | null }
  const [itemsRes, complianceRes, issuesRes] = await Promise.all([
    instanceIds.length > 0
      ? supabase.from('checklist_instance_items').select('id', { count: 'exact', head: true }).in('instance_id', instanceIds)
      : Promise.resolve(zero),
    vehicleIds.length > 0
      ? supabase.from('vehicle_compliance').select('id', { count: 'exact', head: true }).in('vehicle_id', vehicleIds)
      : Promise.resolve(zero),
    vehicleIds.length > 0
      ? supabase.from('vehicle_issues').select('id', { count: 'exact', head: true }).in('vehicle_id', vehicleIds)
      : Promise.resolve(zero),
  ])

  const counts = {
    bookings:                 { current: bookingsRes.count   ?? 0, snapshot: snapshotBookings.length },
    checklist_instances:      { current: instanceIds.length,       snapshot: snapshotChecklistInstances.length },
    checklist_instance_items: { current: itemsRes.count     ?? 0, snapshot: snapshotChecklistInstanceItems.length },
    vehicle_blocks:           { current: blocksRes.count    ?? 0, snapshot: snapshotVehicleBlocks.length },
    vehicle_compliance:       { current: complianceRes.count ?? 0, snapshot: snapshotVehicleCompliance.length },
    vehicle_issues:           { current: issuesRes.count    ?? 0, snapshot: snapshotVehicleIssues.length },
    guest_feedback:           { current: feedbackRes.count  ?? 0, snapshot: snapshotGuestFeedback.length },
    vehicles:                 { current: vehicleIds.length,        snapshot: snapshotVehicles.length },
  }

  const needsConfirmation = Object.values(counts).some(
    ({ current, snapshot }) => current !== snapshot,
  )

  return NextResponse.json({
    dryRun: true,
    snapshotCapturedAt: SNAPSHOT_CAPTURED_AT,
    needsConfirmation,
    counts,
  })
}
