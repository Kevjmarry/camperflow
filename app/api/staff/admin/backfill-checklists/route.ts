import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { provisionBookingChecklists } from '@/lib/checklists/provisionBookingChecklists';

async function resolveAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized', status: 401 as const };

  const { data: staffProfile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('company_id, role')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !staffProfile) return { error: 'Staff profile not found', status: 403 as const };
  if (staffProfile.role !== 'admin') return { error: 'Insufficient permissions', status: 403 as const };

  return { companyId: staffProfile.company_id as string, supabase };
}

// POST /api/staff/admin/backfill-checklists
// Idempotent: provisions missing booking-scope checklist instances for all
// non-cancelled bookings that have a vehicle assigned.
export async function POST() {
  try {
    const auth = await resolveAdmin();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId, supabase } = auth;

    const { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('company_id', companyId)
      .not('status', 'in', '("completed","cancelled")')
      .not('vehicle_id', 'is', null);

    if (bErr) throw bErr;
    if (!bookings?.length) {
      return NextResponse.json({ processed: 0, created: 0, errors: 0 });
    }

    let totalCreated = 0;
    let errors = 0;

    for (const booking of bookings) {
      try {
        const result = await provisionBookingChecklists(booking.id);
        totalCreated += result.created;
      } catch (err) {
        console.error('[backfill-checklists] booking', booking.id, err);
        errors++;
      }
    }

    return NextResponse.json({
      processed: bookings.length,
      created: totalCreated,
      errors,
    });
  } catch (err) {
    console.error('[backfill-checklists POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
