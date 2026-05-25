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

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await resolveProfile(supabase, user.id)
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, name')
    .eq('company_id', profile.company_id)
    .order('name')

  return NextResponse.json({ vehicles: vehicles ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await resolveProfile(supabase, user.id)
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  if (!profile.can_manage && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { vehicleId, blockType, label, startAt, endAt } = body

  if (!vehicleId || !blockType || !startAt || !endAt) {
    return NextResponse.json({ error: 'vehicleId, blockType, startAt, endAt are required' }, { status: 400 })
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 })
  }

  const sourceBookingId = `manual_${crypto.randomUUID()}`

  const { data: block, error } = await supabase
    .from('vehicle_blocks')
    .insert({
      company_id: profile.company_id,
      vehicle_id: vehicleId,
      source_type: 'manual',
      source_booking_id: sourceBookingId,
      source_reference: null,
      label: label || null,
      block_type: blockType,
      start_at: startAt,
      end_at: endAt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(block, { status: 201 })
}
