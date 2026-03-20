import { createClient } from '@/lib/supabase/server';
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

    // Verify booking belongs to this company and is on_rent
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('id', bookingId)
      .eq('company_id', companyId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.status !== 'on_rent') {
      return NextResponse.json(
        { error: `Booking cannot be reverted: current status is '${booking.status}', expected 'on_rent'` },
        { status: 409 },
      );
    }

    // Revert
    const { data: updated, error: updateError } = await supabase
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

    return NextResponse.json({ booking: updated });
  } catch (err) {
    console.error('[revert booking] unexpected', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
