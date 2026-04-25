import { createServiceClient } from '@/lib/supabase/server'

export interface ProvisionResult {
  created: number
}

export async function provisionBookingChecklists(bookingId: string): Promise<ProvisionResult> {
  const supabase = createServiceClient()

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('company_id')
    .eq('id', bookingId)
    .single()
  if (bErr || !booking) throw bErr ?? new Error('Booking not found')

  const { company_id } = booking

  const { data: templates, error: tErr } = await supabase
    .from('checklist_templates')
    .select('id, type')
    .eq('company_id', company_id)
    .eq('scope', 'booking')
    .eq('active', true)
  if (tErr) throw tErr
  if (!templates?.length) return { created: 0 }

  const { data: existing, error: eErr } = await supabase
    .from('checklist_instances')
    .select('template_id')
    .eq('booking_id', bookingId)
  if (eErr) throw eErr

  const existingTemplateIds = new Set((existing ?? []).map((ci) => ci.template_id))
  const missing = templates.filter((t) => !existingTemplateIds.has(t.id))
  if (!missing.length) return { created: 0 }

  const { data: newInstances, error: iErr } = await supabase
    .from('checklist_instances')
    .insert(
      missing.map((t) => ({
        company_id,
        booking_id: bookingId,
        template_id: t.id,
        checklist_type: t.type,
        status: 'pending',
      }))
    )
    .select('id, template_id')
  if (iErr) throw iErr
  if (!newInstances?.length) return { created: 0 }

  const { data: templateItems, error: tiErr } = await supabase
    .from('checklist_template_items')
    .select('id, template_id')
    .in('template_id', newInstances.map((ci) => ci.template_id))
  if (tiErr) throw tiErr

  const itemsByTemplate = new Map<string, string[]>()
  for (const item of (templateItems ?? [])) {
    const list = itemsByTemplate.get(item.template_id) ?? []
    list.push(item.id)
    itemsByTemplate.set(item.template_id, list)
  }

  const instanceItems = newInstances.flatMap((ci) =>
    (itemsByTemplate.get(ci.template_id) ?? []).map((templateItemId) => ({
      instance_id: ci.id,
      template_item_id: templateItemId,
      checked: false,
    }))
  )

  if (instanceItems.length) {
    const { error: iiErr } = await supabase
      .from('checklist_instance_items')
      .insert(instanceItems)
    if (iiErr) throw iiErr
  }

  return { created: newInstances.length }
}
