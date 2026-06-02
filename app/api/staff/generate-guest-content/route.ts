import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateGuestContent, type CompanyContext } from '@/lib/generateGuestContent';
import type { I18nFields } from '@/lib/translateGuestContent';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Body is optional — if provided, existing content is used as the base to improve
    let existing: I18nFields | null = null;
    try {
      const body = await request.json() as { existing?: unknown };
      if (body.existing && typeof body.existing === 'object' && !Array.isArray(body.existing)) {
        existing = body.existing as I18nFields;
      }
    } catch {
      // No body or invalid JSON — generate from scratch
    }

    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('name, contact_phone, contact_whatsapp, map_link, default_guest_language')
      .eq('id', companyId)
      .single();

    if (settingsError || !settings) {
      return NextResponse.json({ error: 'Failed to load company settings' }, { status: 500 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('address, email')
      .eq('id', companyId)
      .maybeSingle();

    const defaultLang = ((settings as any).default_guest_language ?? '').toUpperCase();
    if (!defaultLang) {
      return NextResponse.json(
        { error: 'No default guest language configured. Set it in Company Info first.' },
        { status: 400 },
      );
    }

    const context: CompanyContext = {
      companyName: (settings as any).name ?? 'Our company',
      address: (company as any)?.address,
      email: (company as any)?.email,
      contactPhone: (settings as any).contact_phone,
      contactWhatsapp: (settings as any).contact_whatsapp,
      mapLink: (settings as any).map_link,
    };

    const generated = await generateGuestContent(context, defaultLang, existing);

    return NextResponse.json({ generated });
  } catch (err: any) {
    console.error('[generate-guest-content]', err);
    const message = err?.message || 'Internal server error';
    if (message.includes('OPENAI_API_KEY')) {
      return NextResponse.json({ error: 'AI generation is not configured' }, { status: 503 });
    }
    if (message.includes('unexpected structure')) {
      return NextResponse.json({ error: message, diagnostic: (err as any).diagnostic ?? null }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
