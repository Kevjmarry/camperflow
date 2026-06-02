import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { translateGuestContent, type I18nFields } from '@/lib/translateGuestContent';

const VALID_LANGS = ['EN', 'DE', 'SK', 'PL', 'CS'] as const;
type Lang = typeof VALID_LANGS[number];

function isValidLang(v: unknown): v is Lang {
  return typeof v === 'string' && (VALID_LANGS as readonly string[]).includes(v);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Staff profile — only admins / managers may call this
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
    let body: { sourceLang?: unknown; targetLang?: unknown; content?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { sourceLang, targetLang, content } = body;

    if (!isValidLang(sourceLang) || !isValidLang(targetLang)) {
      return NextResponse.json({ error: 'sourceLang and targetLang must be one of EN, DE, SK, PL, CS' }, { status: 400 });
    }

    if (sourceLang === targetLang) {
      return NextResponse.json({ error: 'sourceLang and targetLang must be different' }, { status: 400 });
    }

    // Load company settings to validate sourceLang == default_guest_language
    // and targetLang is in the enabled guest_languages_order
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('default_guest_language, guest_languages_order')
      .eq('id', companyId)
      .single();

    if (settingsError || !settings) {
      return NextResponse.json({ error: 'Failed to load company settings' }, { status: 500 });
    }

    const configuredOriginalLang = ((settings as any).default_guest_language ?? '').toUpperCase() as string;
    if (configuredOriginalLang !== sourceLang) {
      return NextResponse.json(
        { error: `sourceLang must match the company's original language (${configuredOriginalLang})` },
        { status: 400 },
      );
    }

    const enabledLocales: string[] = (settings as any).guest_languages_order ?? [];
    const targetLocale = targetLang.toLowerCase();
    if (enabledLocales.length > 0 && !enabledLocales.includes(targetLocale)) {
      return NextResponse.json(
        { error: `Target language ${targetLang} is not enabled in guest languages` },
        { status: 400 },
      );
    }

    // Validate content shape
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return NextResponse.json({ error: 'content must be an object' }, { status: 400 });
    }

    const i18nContent = content as I18nFields;

    // Translate
    const translated = await translateGuestContent(i18nContent, sourceLang, targetLang);

    return NextResponse.json({ translated });
  } catch (err: any) {
    console.error('[translate-guest-content]', err);
    const message = err?.message || 'Internal server error';
    // Surface OpenAI-specific errors with a clearer status
    if (message.includes('OPENAI_API_KEY')) {
      return NextResponse.json({ error: 'AI translation is not configured' }, { status: 503 });
    }
    if (message.includes('unexpected structure')) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
