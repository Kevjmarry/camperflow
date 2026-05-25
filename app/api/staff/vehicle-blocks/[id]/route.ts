import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function resolveProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id, can_manage, role')
    .eq('auth_user_id', userId)
    .single()
  return profile
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await resolveProfile(supabase, user.id)
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  if (!profile.can_manage && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: existing } = await supabase
    .from('vehicle_blocks')
    .select('id, source_type, sync_locked')
    .eq('id', id)
    .eq('company_id', profile.company_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

  const body = await request.json()
  const { vehicleId, blockType, label, startAt, endAt } = body

  if (!vehicleId || !blockType || !startAt || !endAt) {
    return NextResponse.json({ error: 'vehicleId, blockType, startAt, endAt are required' }, { status: 400 })
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 })
  }

  const { data: block, error } = await supabase
    .from('vehicle_blocks')
    .update({
      vehicle_id: vehicleId,
      block_type: blockType,
      label: label || null,
      start_at: startAt,
      end_at: endAt,
      sync_locked: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(block)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await resolveProfile(supabase, user.id)
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  if (!profile.can_manage && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: existing } = await supabase
    .from('vehicle_blocks')
    .select('id, source_type, sync_locked')
    .eq('id', id)
    .eq('company_id', profile.company_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Block not found' }, { status: 404 })
  if (existing.source_type !== 'manual' && !existing.sync_locked) {
    return NextResponse.json({ error: 'Cannot delete untouched imported blocks' }, { status: 403 })
  }

  const { error } = await supabase
    .from('vehicle_blocks')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
