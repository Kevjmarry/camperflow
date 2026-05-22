export interface PlanConfig {
  plan: string
  included_vehicles: number
  included_staff: number
  max_extra_vehicles: number
  max_extra_staff: number
}

export const PRICE_PLAN_MAP: Record<string, PlanConfig> = {
  price_1TZXTPIhm4YI8m30XpwGR05g: { plan: 'starter', included_vehicles: 3,  included_staff: 3,  max_extra_vehicles: 0, max_extra_staff: 0 },
  price_1TZXVCIhm4YI8m306ZWJWBfu: { plan: 'core',    included_vehicles: 5,  included_staff: 5,  max_extra_vehicles: 0, max_extra_staff: 0 },
  price_1TZXXpIhm4YI8m308GZATyhu: { plan: 'growth',  included_vehicles: 15, included_staff: 15, max_extra_vehicles: 0, max_extra_staff: 0 },
  price_1TZXZRIhm4YI8m308YOwthl4: { plan: 'pro',     included_vehicles: 30, included_staff: 30, max_extra_vehicles: 0, max_extra_staff: 0 },
}

export const FALLBACK_LIMITS: Omit<PlanConfig, 'plan'> = {
  included_vehicles: 0,
  included_staff: 0,
  max_extra_vehicles: 0,
  max_extra_staff: 0,
}
