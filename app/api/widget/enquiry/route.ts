import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    companyId,
    vehicleName,
    pickupDate,
    returnDate,
    name,
    email,
    phone,
    message,
  } = body as Record<string, string>

  // Validate required fields
  if (!companyId || !UUID_RE.test(companyId)) {
    return NextResponse.json({ error: 'Invalid company' }, { status: 400 })
  }
  if (!name?.trim() || !email?.trim() || !pickupDate || !returnDate) {
    return NextResponse.json({ error: 'Name, email, pickup date and return date are required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }
  if (returnDate <= pickupDate) {
    return NextResponse.json({ error: 'Return date must be after pickup date' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch company name, widget config + contact email in parallel
  const [{ data: settings }, { data: company }] = await Promise.all([
    supabase.from('company_settings').select('name, widget_public_enabled, widget_request_email').eq('id', companyId).maybeSingle(),
    supabase.from('companies').select('email').eq('id', companyId).maybeSingle(),
  ])

  if (!settings?.widget_public_enabled) {
    return NextResponse.json({ error: 'Widget not available' }, { status: 403 })
  }

  const companyName = (settings as { name: string }).name
  const toEmail = (settings as { widget_request_email?: string | null }).widget_request_email?.trim() || company?.email
  if (!toEmail) {
    return NextResponse.json({ error: 'Company contact email not configured' }, { status: 422 })
  }

  // Determine source for the email (origin header or referer)
  const source =
    request.headers.get('origin') ||
    request.headers.get('referer') ||
    'direct'

  const lines: string[] = [
    `New vehicle enquiry received via ${companyName} availability widget`,
    '',
    '── Customer details ──────────────────────────',
    `Name:    ${name.trim()}`,
    `Email:   ${email.trim()}`,
    phone?.trim() ? `Phone:   ${phone.trim()}` : '',
    '',
    '── Enquiry details ───────────────────────────',
    vehicleName?.trim() ? `Vehicle: ${vehicleName.trim()}` : 'Vehicle: (any available)',
    `Pickup:  ${pickupDate}`,
    `Return:  ${returnDate}`,
    message?.trim() ? `\nMessage:\n${message.trim()}` : '',
    '',
    '── Source ────────────────────────────────────',
    `Company: ${companyName}`,
    `Widget:  ${source}`,
  ].filter(l => l !== undefined)

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const senderEmail = process.env.EMAIL_FROM ?? 'noreply@camperflow.io'
    // DEBUG — remove before merging
    console.log('[widget/enquiry][DEBUG] RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY)
    console.log('[widget/enquiry][DEBUG] sender email:', senderEmail)
    console.log('[widget/enquiry][DEBUG] recipient email:', toEmail)
    const resendResult = await resend.emails.send({
      from: senderEmail,
      to: toEmail,
      replyTo: email.trim(),
      subject: `New enquiry from ${name.trim()} – ${companyName}`,
      text: lines.join('\n'),
    })
    // DEBUG — remove before merging
    console.log('[widget/enquiry][DEBUG] full Resend response:', JSON.stringify(resendResult, null, 2))
    if (resendResult.error) throw resendResult.error
  } catch (err: unknown) {
    // DEBUG — remove before merging
    console.error('[widget/enquiry][DEBUG] full caught error:', JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2))
    console.error('[widget/enquiry] email send failed', err)
    return NextResponse.json({ error: 'Failed to send enquiry email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
