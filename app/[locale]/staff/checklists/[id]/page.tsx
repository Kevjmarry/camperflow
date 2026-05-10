import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ChecklistDetailClient from './ChecklistDetailClient';

export const dynamic = 'force-dynamic';

export default async function ChecklistDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/staff/login`);
  }

  // Fetch instance
  const { data: instance, error } = await supabase
    .from('checklist_instances')
    .select(
      `
      id,
      booking_id,
      vehicle_id,
      checklist_type,
      status,
      started_at,
      started_by,
      completed_at,
      completed_by,
      created_at,
      office_contract_signed,
      office_id_verified,
      office_deposit_collected,
      handover_documents_given,
      handover_keys_given,
      return_keys_received,
      return_documents_received,
      return_contract_closed,
      return_deposit_status,
      booking:bookings (
        id,
        booking_number,
        customer_name,
        status,
        company_id,
        staff_metadata,
        vehicle_id
      ),
      vehicle:vehicles (
        id,
        name
      )
    `
    )
    .eq('id', id)
    .single();

  if (error || !instance) {
    notFound();
  }

  // Fetch items
  const { data: itemsRaw, error: itemsError } = await supabase
    .from('checklist_instance_items')
    .select(
      `
      id,
      template_item_id,
      checked,
      notes,
      checked_at,
      checked_by,
      created_at,
      issue_flag,
      issue_title,
      issue_description,
      issue_severity,
      issue_blocking,
      linked_vehicle_issue_id,
      template:checklist_template_items!template_item_id (
        label,
        sort_order,
        section,
        ui_section,
        options
      )
    `
    )
    .eq('instance_id', id)
    .order('created_at', { ascending: true });

  // Normalize booking (array -> single object)
  const bk = Array.isArray(instance.booking) ? instance.booking[0] : instance.booking;

  // Fetch company_settings for return checklists (needed for extras_catalog)
  let extrasCatalog: { id: string; name: string }[] | null = null;
  const companyId = (bk as any)?.company_id ?? null;
  if ((instance.checklist_type === 'return' || instance.checklist_type === 'pickup' || instance.checklist_type === 'handover') && companyId) {
    const { data: cs } = await supabase
      .from('company_settings')
      .select('extras_catalog')
      .eq('id', companyId)
      .maybeSingle();
    extrasCatalog = (cs as any)?.extras_catalog ?? null;
  }

  // Normalize vehicle (array -> single object)
  const veh = Array.isArray((instance as any).vehicle) ? (instance as any).vehicle[0] : (instance as any).vehicle;
  const normalizedInstance = {
    ...instance,
    bookings: bk
      ? {
          ...bk,
          company_settings: extrasCatalog !== null ? { extras_catalog: extrasCatalog } : null,
        }
      : null,
    vehicles: veh ? { id: veh.id, name: veh.name } : null,
  };

  // Normalize template (array -> single object)
  const normalizedItems =
    itemsRaw?.map((item: any) => {
      const tpl = Array.isArray(item.template) ? item.template[0] : item.template;
      return {
        id: item.id,
        template_item_id: item.template_item_id,
        checked: item.checked,
        notes: item.notes,
        checked_at: item.checked_at,
        checked_by: item.checked_by,
        created_at: item.created_at,
        issue_flag: item.issue_flag,
        issue_title: item.issue_title,
        issue_description: item.issue_description,
        issue_severity: item.issue_severity,
        issue_blocking: item.issue_blocking,
        linked_vehicle_issue_id: item.linked_vehicle_issue_id,
        template: {
          label: tpl?.label ?? 'Untitled item',
          sort_order: tpl?.sort_order ?? 0,
          section: tpl?.section ?? null,
          ui_section: tpl?.ui_section ?? null,
          options: tpl?.options ?? null,
        },
      };
    }) ?? [];

  return (
    <ChecklistDetailClient
      instance={normalizedInstance}
      items={normalizedItems}
      locale={locale}
    />
  );
}