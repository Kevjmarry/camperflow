import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerProfile, error: callerError } = await supabase
      .from('staff_profiles')
      .select('company_id, role, can_manage')
      .eq('auth_user_id', user.id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    if (callerProfile.role !== 'admin' && !callerProfile.can_manage) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('over_limit, included_vehicles, purchased_extra_vehicles')
      .eq('id', callerProfile.company_id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 403 })
    }

    if (company.over_limit) {
      return NextResponse.json({ error: 'over_limit' }, { status: 402 })
    }

    const vehicleLimit = (company.included_vehicles ?? 0) + (company.purchased_extra_vehicles ?? 0)
    if (vehicleLimit > 0) {
      const { count: vehicleCount } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', callerProfile.company_id)

      if ((vehicleCount ?? 0) >= vehicleLimit) {
        return NextResponse.json({ error: 'vehicle_limit_reached' }, { status: 402 })
      }
    }

    const body = await request.json()
    const {
      name, registration_plate, make, model, year,
      vin, length_m, width_m, height_m, notes,
      operational_hold, hold_reason,
    } = body

    const { data: vehicle, error: insertError } = await supabase
      .from('vehicles')
      .insert({
        company_id: callerProfile.company_id,
        name,
        registration_plate,
        make,
        model,
        year,
        vin: vin ?? null,
        length_m: length_m ?? null,
        width_m: width_m ?? null,
        height_m: height_m ?? null,
        notes: notes ?? null,
        operational_hold: operational_hold ?? false,
        hold_reason: hold_reason ?? null,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json(vehicle, { status: 201 })
  } catch (err) {
    console.error('[vehicles POST] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
