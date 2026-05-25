import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function resolveProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('can_manage, role, company_id')
    .eq('auth_user_id', userId)
    .single()
  return {
    canManage: profileError ? true : (profile?.can_manage ?? false),
    isAdmin: profileError ? false : profile?.role === 'admin',
    companyId: profile?.company_id ?? null,
  }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { canManage, isAdmin, companyId } = await resolveProfile(supabase, user.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawBookings: any[] = []

  if (canManage) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, vehicles(id, name, status)')
      .order('pickup_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rawBookings = data ?? []
  } else {
    const { data, error } = await supabase.rpc('list_staff_bookings_redacted')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const filtered = (data ?? []) as any[]
    const vehicleIds = [...new Set(filtered.map((b) => b.vehicle_id).filter(Boolean))] as string[]

    if (vehicleIds.length > 0) {
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('id, name, status')
        .in('id', vehicleIds)

      const vehicleMap = new Map(vehicles?.map((v) => [v.id, { name: v.name, status: v.status }]) ?? [])
      rawBookings = filtered.map((b) => ({
        ...b,
        vehicle_name: b.vehicle_id ? (vehicleMap.get(b.vehicle_id)?.name ?? null) : null,
        vehicle_status: b.vehicle_id ? (vehicleMap.get(b.vehicle_id)?.status ?? null) : null,
      }))
    } else {
      rawBookings = filtered
    }
  }

  const bookingIds = rawBookings.map((b) => b.id as string)
  const checklistsByBooking: Record<string, any[]> = {}

  if (bookingIds.length > 0) {
    const { data: instances } = await supabase
      .from('checklist_instances')
      .select('id, booking_id, status, checklist_instance_items(checked)')
      .in('booking_id', bookingIds)

    for (const inst of instances ?? []) {
      const bid = inst.booking_id as string
      if (!checklistsByBooking[bid]) checklistsByBooking[bid] = []
      checklistsByBooking[bid].push(inst)
    }
  }

  const bookings = rawBookings.map((b) => ({
    ...b,
    checklists: checklistsByBooking[b.id] ?? [],
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vehicleBlocks: any[] = []
  if (companyId) {
    const now = new Date().toISOString()
    const { data: blocks, error: blocksError } = await supabase
      .from('vehicle_blocks')
      .select('id, vehicle_id, label, block_type, start_at, end_at, source_type, source_reference, sync_locked, vehicles(name)')
      .eq('company_id', companyId)
      .gte('end_at', now)
      .order('start_at', { ascending: true })

    // If sync_locked column is missing (migration 065 not yet applied), retry
    // without it so blocks still appear in the UI.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawBlocks: any[] | null = blocks
    if (blocksError) {
      const { data: fallback } = await supabase
        .from('vehicle_blocks')
        .select('id, vehicle_id, label, block_type, start_at, end_at, source_type, source_reference, vehicles(name)')
        .eq('company_id', companyId)
        .gte('end_at', now)
        .order('start_at', { ascending: true })
      rawBlocks = fallback
    }

    vehicleBlocks = (rawBlocks ?? []).map((bl) => ({
      id: bl.id,
      vehicleId: bl.vehicle_id,
      vehicleName: (bl.vehicles as any)?.name ?? null,
      label: bl.label ?? null,
      blockType: bl.block_type ?? null,
      startAt: bl.start_at,
      endAt: bl.end_at,
      sourceType: bl.source_type ?? null,
      sourceReference: bl.source_reference ?? null,
      syncLocked: (bl as any).sync_locked ?? false,
    }))
  }

  return NextResponse.json(
    { canManage, isAdmin, bookings, vehicleBlocks },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
