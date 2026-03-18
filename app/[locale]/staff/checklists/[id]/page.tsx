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
      booking:bookings (
        id,
        booking_number,
        customer_name,
        status
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
  const { data: itemsRaw } = await supabase
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
      template:checklist_template_items (
        label,
        sort_order,
        section
      )
    `
    )
    .eq('instance_id', id)
    .order('created_at', { ascending: true });

  // Normalize booking (array -> single object)
  const bk = Array.isArray(instance.booking) ? instance.booking[0] : instance.booking;
  // Normalize vehicle (array -> single object)
  const veh = Array.isArray((instance as any).vehicle) ? (instance as any).vehicle[0] : (instance as any).vehicle;
  const normalizedInstance = {
    ...instance,
    bookings: bk ?? null,
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
        template: {
          label: tpl?.label ?? 'Untitled item',
          sort_order: tpl?.sort_order ?? 0,
          section: tpl?.section ?? null,
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