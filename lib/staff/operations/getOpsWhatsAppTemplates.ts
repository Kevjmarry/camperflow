import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface OpsWhatsAppTemplates {
  pre_arrival: string | null
  return_prep: string | null
  review_request: string | null
  company_phone: string
  map_link: string
  google_review_url: string | null
}

const EMPTY: OpsWhatsAppTemplates = {
  pre_arrival: null,
  return_prep: null,
  review_request: null,
  company_phone: '',
  map_link: '',
  google_review_url: null,
}

export async function getOpsWhatsAppTemplates(): Promise<OpsWhatsAppTemplates> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id || !UUID_RE.test(user.id)) return EMPTY

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const companyId = profile?.company_id
  if (!companyId || !UUID_RE.test(companyId)) return EMPTY

  const { data } = await supabase
    .from('company_settings')
    .select('pre_arrival_whatsapp_template, return_prep_whatsapp_template, review_request_whatsapp_template, contact_phone, map_link, google_review_url')
    .eq('id', companyId)
    .maybeSingle()

  return {
    pre_arrival: (data as any)?.pre_arrival_whatsapp_template ?? null,
    return_prep: (data as any)?.return_prep_whatsapp_template ?? null,
    review_request: (data as any)?.review_request_whatsapp_template ?? null,
    company_phone: (data as any)?.contact_phone ?? '',
    map_link: (data as any)?.map_link ?? '',
    google_review_url: (data as any)?.google_review_url ?? null,
  }
}
