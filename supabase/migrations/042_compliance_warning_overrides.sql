-- Migration 042: Add per-row compliance warning threshold overrides.
--
--   warning_days_before_override  – overrides compliance_types.warning_days_before for this row
--   warning_km_before_override    – overrides compliance_types.warning_km_before for this row
--
--   NULL means "use the type-level default".

ALTER TABLE public.vehicle_compliance
  ADD COLUMN IF NOT EXISTS warning_days_before_override INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS warning_km_before_override   INTEGER DEFAULT NULL;
