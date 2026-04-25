import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { provisionBookingChecklists } from '@/lib/checklists/provisionBookingChecklists';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('staff_profiles')
      .select('role, can_manage')
      .eq('auth_user_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 });
    }
    if (profile.role !== 'admin' && !profile.can_manage) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
    }

    const result = await provisionBookingChecklists(bookingId);
    return NextResponse.json(result);
  } catch (err) {
    const e = err as Record<string, unknown>;
    console.error('[provision-booking-checklists POST] message:', e?.message ?? err);
    console.error('[provision-booking-checklists POST] code:', e?.code);
    console.error('[provision-booking-checklists POST] details:', e?.details);
    console.error('[provision-booking-checklists POST] hint:', e?.hint);
    console.error('[provision-booking-checklists POST] full:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
