-- Add sync interval and last-sync tracking fields to vehicle_calendar_sources.
-- These fields support the "Sync now" button and persisted auto-sync interval
-- on the vehicle edit page. Background scheduling is NOT implemented yet —
-- sync_interval is stored for future use.

ALTER TABLE vehicle_calendar_sources
  ADD COLUMN IF NOT EXISTS sync_interval  text        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,      -- 'success' | 'error'
  ADD COLUMN IF NOT EXISTS last_sync_error text;
