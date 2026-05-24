import { createClient } from '@/lib/supabase/server'
import { getDemoToday } from '@/lib/helpers/demoDate'

export interface OpsVehicleBlock {
  id: string
  vehicleId: string
  vehicleName: string
  label: string | null
  blockType: string | null
  startAt: string
  endAt: string
  isActive: boolean
  daysUntilStart: number
}

export async function getOpsVehicleBlocks(): Promise<OpsVehicleBlock[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user?.id)
    .maybeSingle()
  const companyId = profile?.company_id

  if (!companyId) return []

  const now = getDemoToday(companyId)
  // Show blocks ending in the future (includes currently active + upcoming)
  // Cap to next 30 days so the list stays actionable
  const windowEnd = new Date(now)
  windowEnd.setDate(windowEnd.getDate() + 30)

  const { data: blocks, error } = await supabase
    .from('vehicle_blocks')
    .select('id, vehicle_id, label, block_type, start_at, end_at')
    .eq('company_id', companyId)
    .gt('end_at', now.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .order('start_at', { ascending: true })
    .limit(20)

  if (error) throw error
  if (!blocks || blocks.length === 0) return []

  // Fetch vehicle names in one query
  const vehicleIds = [...new Set(blocks.map((b) => b.vehicle_id))]
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, name')
    .in('id', vehicleIds)

  const vehicleNameById = new Map(
    (vehicles ?? []).map((v) => [v.id, v.name ?? ''])
  )

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  return blocks.map((b) => {
    const startDate = new Date(b.start_at)
    startDate.setHours(0, 0, 0, 0)
    const daysUntilStart = Math.round(
      (startDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    )
    const isActive = new Date(b.start_at) <= now && new Date(b.end_at) > now

    return {
      id: b.id,
      vehicleId: b.vehicle_id,
      vehicleName: vehicleNameById.get(b.vehicle_id) ?? '',
      label: b.label ?? null,
      blockType: b.block_type ?? null,
      startAt: b.start_at,
      endAt: b.end_at,
      isActive,
      daysUntilStart,
    }
  })
}
