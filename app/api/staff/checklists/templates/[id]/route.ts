import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: templateId } = await params;

  if (!templateId) {
    return NextResponse.json({ error: 'Missing template id' }, { status: 400 });
  }

  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('company_id, role, can_manage')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !profile?.company_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const canManage = profile.role === 'admin' || profile.can_manage === true;
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: template, error: tmplError } = await supabase
    .from('checklist_templates')
    .select('id, company_id, is_system, active')
    .eq('id', templateId)
    .eq('company_id', profile.company_id)
    .single();

  if (tmplError || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (template.is_system) {
    return NextResponse.json({ error: 'System templates cannot be deleted' }, { status: 403 });
  }

  if (template.active === true) {
    return NextResponse.json({ error: 'Deactivate this template before deleting it.' }, { status: 409 });
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // (a) Delete checklist_instance_items for instances of this template
  const { data: instances } = await serviceClient
    .from('checklist_instances')
    .select('id')
    .eq('template_id', templateId)
    .eq('company_id', profile.company_id);

  if (instances && instances.length > 0) {
    const instanceIds = instances.map((i: { id: string }) => i.id);
    const { error: iiError } = await serviceClient
      .from('checklist_instance_items')
      .delete()
      .in('instance_id', instanceIds);
    if (iiError) {
      return NextResponse.json({ error: iiError.message }, { status: 500 });
    }
  }

  // (b) Delete checklist_instances
  const { error: ciError } = await serviceClient
    .from('checklist_instances')
    .delete()
    .eq('template_id', templateId)
    .eq('company_id', profile.company_id);
  if (ciError) {
    return NextResponse.json({ error: ciError.message }, { status: 500 });
  }

  // (c) Delete checklist_template_items
  const { error: ctiError } = await serviceClient
    .from('checklist_template_items')
    .delete()
    .eq('template_id', templateId);
  if (ctiError) {
    return NextResponse.json({ error: ctiError.message }, { status: 500 });
  }

  // (d) Delete checklist_templates
  const { error: ctError } = await serviceClient
    .from('checklist_templates')
    .delete()
    .eq('id', templateId)
    .eq('company_id', profile.company_id);
  if (ctError) {
    return NextResponse.json({ error: ctError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}