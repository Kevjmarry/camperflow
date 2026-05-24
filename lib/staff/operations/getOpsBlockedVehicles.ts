import { createClient } from '@/lib/supabase/server'
import { getDemoToday } from '@/lib/helpers/demoDate'

export interface OpsBlockedVehicle {
  id: string
  name: string
  hasOperationalHold: boolean
  hasExpiredCompliance: boolean
  hasWarningCompliance: boolean
  hasOpenVehicleIssue: boolean
  openVehicleIssueChecklistInstanceId: string | null
  expiredComplianceNames: string[]
  warningComplianceNames: string[]
  openVehicleIssues: { title: string | null; blocking: boolean; isChecklistFlag: boolean }[]
}

/**
 * Returns all company vehicles that have at least one blocking signal
 * (expired readiness-blocking compliance or an unresolved vehicle issue)
 * regardless of whether they have an active booking.
 *
 * Used by the Operations page Attention needed strip to surface vehicles that
 * would otherwise be invisible because they have no ops_bookings row.
 */

// Matches only the canonical 8-4-4-4-12 hex UUID format.
// Rejects null, undefined, '', 'null', 'undefined', whitespace, and any
// non-UUID string before it reaches a Postgres UUID column → prevents 22P02.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export async function getOpsBlockedVehicles(): Promise<OpsBlockedVehicle[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Guard: user.id must be a valid UUID before using it in a UUID-typed filter.
  if (!user?.id || !isUUID(user.id)) return []

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const companyId = profile?.company_id

  // Guard: company_id must be a valid UUID before using it in a UUID-typed filter.
  if (!companyId || !isUUID(companyId)) {
    console.error('[BLOCKED] invalid companyId:', companyId)
    return []
  }

  const { data: vehicles, error: vError } = await supabase
    .from('vehicles')
    .select('id, name, operational_hold')
    .eq('company_id', companyId as string)

  if (vError) throw vError

  // Strict UUID-safe filter on vehicle ids from the DB result.
  const vehicleIds = (vehicles ?? [])
    .map((v) => v.id)
    .filter(isUUID)

  if (!vehicleIds.length) return []

  const today = getDemoToday(companyId)
  const todayStr = today.toISOString().slice(0, 10)

  const { data: expiredCompliance, error: ecError } = await supabase
    .from('vehicle_compliance')
    .select('vehicle_id, compliance_types(name)')
    .in('vehicle_id', vehicleIds)
    .not('expiry_date', 'is', null)
    .lt('expiry_date', todayStr)

  if (ecError) throw ecError

  const vehiclesWithExpiredCompliance = new Set(
    (expiredCompliance ?? []).filter((c) => isUUID(c.vehicle_id)).map((c) => c.vehicle_id)
  )

  const vehicleExpiredComplianceNames = new Map<string, string[]>()
  for (const c of (expiredCompliance ?? [])) {
    if (!isUUID(c.vehicle_id)) continue
    const ct = Array.isArray(c.compliance_types) ? c.compliance_types[0] : c.compliance_types as { name?: string } | null
    if (!ct?.name) continue
    const arr = vehicleExpiredComplianceNames.get(c.vehicle_id) ?? []
    arr.push(ct.name)
    vehicleExpiredComplianceNames.set(c.vehicle_id, arr)
  }

  // Warning-soon: blocks_readiness compliance not yet expired/overdue but within threshold
  const { data: warningCandidates, error: wcError } = await supabase
    .from('vehicle_compliance')
    .select('vehicle_id, expiry_date, service_due_odometer_km, warning_days_before_override, warning_km_before_override, compliance_types(warning_days_before, warning_km_before, blocks_readiness, name), vehicles(latest_odometer)')
    .in('vehicle_id', vehicleIds)

  if (wcError) throw wcError

  const vehiclesWithWarningCompliance = new Set<string>()
  const vehicleWarningComplianceNames = new Map<string, string[]>()
  for (const c of (warningCandidates ?? [])) {
    if (!isUUID(c.vehicle_id)) continue
    const ct = Array.isArray(c.compliance_types) ? c.compliance_types[0] : c.compliance_types as { warning_days_before: number | null; warning_km_before: number | null; blocks_readiness: boolean; name?: string } | null
    if (!ct?.blocks_readiness) continue

    // Odometer already at/past service point → classify as expired (mirrors DB trigger logic)
    if (c.service_due_odometer_km != null) {
      const veh = Array.isArray(c.vehicles) ? c.vehicles[0] : c.vehicles as { latest_odometer: number | null } | null
      const odo = veh?.latest_odometer
      if (odo != null && odo >= c.service_due_odometer_km) {
        vehiclesWithExpiredCompliance.add(c.vehicle_id)
        if (ct?.name) {
          const arr = vehicleExpiredComplianceNames.get(c.vehicle_id) ?? []
          arr.push(ct.name)
          vehicleExpiredComplianceNames.set(c.vehicle_id, arr)
        }
        continue
      }
    }

    const warnDays = c.warning_days_before_override ?? ct.warning_days_before
    const warnKm = c.warning_km_before_override ?? ct.warning_km_before

    let inWindow = false

    if (c.expiry_date && warnDays != null && c.expiry_date >= todayStr) {
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() + warnDays)
      if (c.expiry_date <= cutoff.toISOString().slice(0, 10)) inWindow = true
    }

    if (!inWindow && c.service_due_odometer_km != null && warnKm != null) {
      const veh = Array.isArray(c.vehicles) ? c.vehicles[0] : c.vehicles as { latest_odometer: number | null } | null
      const odo = veh?.latest_odometer
      if (odo != null && odo < c.service_due_odometer_km && odo >= c.service_due_odometer_km - warnKm) inWindow = true
    }

    if (inWindow) {
      vehiclesWithWarningCompliance.add(c.vehicle_id)
      if (ct?.name) {
        const arr = vehicleWarningComplianceNames.get(c.vehicle_id) ?? []
        arr.push(ct.name)
        vehicleWarningComplianceNames.set(c.vehicle_id, arr)
      }
    }
  }

  const { data: openIssues, error: oiError } = await supabase
    .from('vehicle_issues')
    .select('id, vehicle_id, title, blocking, checklist_instance_id, source_checklist_instance_id, source_checklist_item_id')
    .in('vehicle_id', vehicleIds)
    .eq('resolved', false)

  if (oiError) throw oiError

  const vehiclesWithOpenIssues = new Set(
    (openIssues ?? []).filter((i) => isUUID(i.vehicle_id)).map((i) => i.vehicle_id)
  )

  const vehicleIssuesMap = new Map<string, { title: string | null; blocking: boolean; isChecklistFlag: boolean }[]>()
  for (const issue of (openIssues ?? [])) {
    if (!isUUID(issue.vehicle_id)) continue
    const isChecklistFlag =
      isUUID((issue as { checklist_instance_id?: string | null }).checklist_instance_id) ||
      isUUID(issue.source_checklist_instance_id) ||
      isUUID((issue as { source_checklist_item_id?: string | null }).source_checklist_item_id)
    const title = (issue as { title?: string | null }).title ?? null
    const blocking = !!(issue as { blocking?: boolean | null }).blocking
    const arr = vehicleIssuesMap.get(issue.vehicle_id) ?? []
    arr.push({ title, blocking, isChecklistFlag })
    vehicleIssuesMap.set(issue.vehicle_id, arr)
  }

  // Prefer the direct checklist_instance_id; fall back to source column, then reverse lookup.
  const issueChecklistMap = new Map<string, string>()
  for (const issue of (openIssues ?? [])) {
    const directId = (issue as { checklist_instance_id?: string | null }).checklist_instance_id
    const sourceId = issue.source_checklist_instance_id
    const resolved = isUUID(directId) ? directId : isUUID(sourceId) ? sourceId : null
    if (resolved) issueChecklistMap.set(issue.id, resolved)
  }
  const vehicleIssueChecklistMap = new Map<string, string>()
  for (const issue of (openIssues ?? [])) {
    if (!isUUID(issue.id) || !isUUID(issue.vehicle_id)) continue
    const checklistId = issueChecklistMap.get(issue.id)
    if (checklistId && !vehicleIssueChecklistMap.has(issue.vehicle_id)) {
      vehicleIssueChecklistMap.set(issue.vehicle_id, checklistId)
    }
  }

  const result = (vehicles ?? [])
    .filter((v) => isUUID(v.id) && (
      v.operational_hold === true ||
      vehiclesWithExpiredCompliance.has(v.id) ||
      vehiclesWithWarningCompliance.has(v.id) ||
      vehiclesWithOpenIssues.has(v.id)
    ))
    .map((v) => ({
      id: v.id as string,
      name: v.name ?? '',
      hasOperationalHold: v.operational_hold === true,
      hasExpiredCompliance: vehiclesWithExpiredCompliance.has(v.id),
      hasWarningCompliance: vehiclesWithWarningCompliance.has(v.id),
      hasOpenVehicleIssue: vehiclesWithOpenIssues.has(v.id),
      openVehicleIssueChecklistInstanceId: vehicleIssueChecklistMap.get(v.id as string) ?? null,
      expiredComplianceNames: vehicleExpiredComplianceNames.get(v.id as string) ?? [],
      warningComplianceNames: vehicleWarningComplianceNames.get(v.id as string) ?? [],
      openVehicleIssues: vehicleIssuesMap.get(v.id as string) ?? [],
    }))

  return result
}
