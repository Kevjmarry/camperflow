import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

const ALPINE_DEMO_COMPANY_ID = 'aa8c5a35-8c06-4dee-8c13-7b3523f549d2'

export async function POST() {
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

  if (profile.company_id !== ALPINE_DEMO_COMPANY_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse new anchor from env var (handles both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm:ssZ').
  const envDate = process.env.DEMO_FROZEN_DATE
  if (!envDate) {
    return NextResponse.json({ error: 'DEMO_FROZEN_DATE not configured' }, { status: 500 })
  }
  const newAnchor = new Date(`${envDate.slice(0, 10)}T12:00:00.000Z`)
  if (isNaN(newAnchor.getTime())) {
    return NextResponse.json({ error: 'Invalid DEMO_FROZEN_DATE' }, { status: 500 })
  }

  // Read current DB frozen date to compute how far to shift existing records.
  // If NULL (first reset ever), delta is 0 — we just lock in the reference date.
  const { data: settings } = await supabase
    .from('company_settings')
    .select('demo_frozen_date')
    .eq('id', ALPINE_DEMO_COMPANY_ID)
    .single()

  const oldAnchor = settings?.demo_frozen_date ? new Date(settings.demo_frozen_date) : null
  const deltaMs = oldAnchor ? newAnchor.getTime() - oldAnchor.getTime() : 0
  const deltaDays = Math.round(deltaMs / 86_400_000)

  if (deltaMs !== 0) {
    // ── Shift booking dates ──────────────────────────────────────────────────
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, pickup_at, return_at')
      .eq('company_id', ALPINE_DEMO_COMPANY_ID)

    for (const b of bookings ?? []) {
      const updates: Record<string, string> = {}
      if (b.pickup_at) updates.pickup_at = new Date(new Date(b.pickup_at).getTime() + deltaMs).toISOString()
      if (b.return_at) updates.return_at = new Date(new Date(b.return_at).getTime() + deltaMs).toISOString()
      if (Object.keys(updates).length) {
        await supabase.from('bookings').update(updates).eq('id', b.id)
      }
    }

    // ── Shift vehicle compliance dates ────────────────────────────────────────
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id')
      .eq('company_id', ALPINE_DEMO_COMPANY_ID)

    const vehicleIds = (vehicles ?? []).map(v => v.id as string).filter(Boolean)

    if (vehicleIds.length) {
      const { data: compliance } = await supabase
        .from('vehicle_compliance')
        .select('id, expiry_date, last_completed_at')
        .in('vehicle_id', vehicleIds)

      for (const c of compliance ?? []) {
        const updates: Record<string, string> = {}
        if (c.expiry_date) {
          // expiry_date is DATE — shift by whole days to preserve the date value.
          const shifted = new Date(new Date(c.expiry_date + 'T12:00:00.000Z').getTime() + deltaDays * 86_400_000)
          updates.expiry_date = shifted.toISOString().slice(0, 10)
        }
        if (c.last_completed_at) {
          updates.last_completed_at = new Date(new Date(c.last_completed_at).getTime() + deltaMs).toISOString()
        }
        if (Object.keys(updates).length) {
          await supabase.from('vehicle_compliance').update(updates).eq('id', c.id)
        }
      }

      // ── Shift vehicle block dates ──────────────────────────────────────────
      const { data: blocks } = await supabase
        .from('vehicle_blocks')
        .select('id, start_at, end_at')
        .in('vehicle_id', vehicleIds)

      for (const bl of blocks ?? []) {
        const updates: Record<string, string> = {}
        if (bl.start_at) updates.start_at = new Date(new Date(bl.start_at).getTime() + deltaMs).toISOString()
        if (bl.end_at)   updates.end_at   = new Date(new Date(bl.end_at).getTime()   + deltaMs).toISOString()
        if (Object.keys(updates).length) {
          await supabase.from('vehicle_blocks').update(updates).eq('id', bl.id)
        }
      }
    }
  }

  // Sync DB frozen date so get_company_now() (ops_bookings view) matches getDemoToday().
  const { error: syncError } = await supabase
    .from('company_settings')
    .update({ demo_frozen_date: newAnchor.toISOString() })
    .eq('id', ALPINE_DEMO_COMPANY_ID)

  if (syncError) throw syncError

  return NextResponse.json({ ok: true, anchor: envDate.slice(0, 10), shiftedDays: deltaDays })
}
