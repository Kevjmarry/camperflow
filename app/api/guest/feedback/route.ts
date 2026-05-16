import { createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let code: string | undefined;
  let message: string | undefined;

  try {
    const body = await req.json();
    code = typeof body.code === 'string' ? body.code.trim() : undefined;
    message = typeof body.message === 'string' ? body.message.trim() : undefined;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!code || !message) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  if (message.length > 5000) {
    return NextResponse.json({ error: 'message_too_long' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify booking exists and get company_id + fields needed for the email
  const { data: booking, error: bookingErr } = await supabase
    .rpc('get_guest_booking_by_code', { p_code: code })
    .maybeSingle<{ company_id: string | null; customer_name: string | null; vehicle_id: string | null }>();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { error: insertErr } = await supabase
    .from('guest_feedback')
    .insert({
      booking_code: code,
      company_id: booking.company_id ?? null,
      message,
    });

  if (insertErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Fire-and-forget — email failure must not affect the guest response
  sendFeedbackEmail(supabase, booking, code, message).catch((err) => {
    console.error('[feedback] email notification failed', err);
  });

  return NextResponse.json({ ok: true });
}

async function sendFeedbackEmail(
  supabase: ReturnType<typeof createServiceClient>,
  booking: { company_id: string | null; customer_name: string | null; vehicle_id: string | null },
  code: string,
  message: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  if (!apiKey || !fromEmail || !booking.company_id) return;

  const { data: company } = await supabase
    .from('companies')
    .select('email')
    .eq('id', booking.company_id)
    .maybeSingle();

  const toEmail = company?.email;
  if (!toEmail) return;

  let vehicleName: string | null = null;
  if (booking.vehicle_id) {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('name')
      .eq('id', booking.vehicle_id)
      .maybeSingle();
    vehicleName = vehicle?.name ?? null;
  }

  const lines = [
    `Booking: ${code}`,
    booking.customer_name ? `Customer: ${booking.customer_name}` : null,
    vehicleName ? `Vehicle: ${vehicleName}` : null,
    '',
    'Message:',
    message,
    '',
    `Received: ${new Date().toISOString()}`,
  ]
    .filter((l) => l !== null)
    .join('\n');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: 'New guest feedback received',
      text: lines,
    }),
  });
}
