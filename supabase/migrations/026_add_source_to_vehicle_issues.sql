-- Migration 026: Add durable source references to vehicle_issues
--
-- Problem: vehicle_issues has no direct pointer to the checklist that created
-- it. Resolution code must do a two-query reverse lookup:
--   vehicle_issues → checklist_instance_items.linked_vehicle_issue_id → instance_id
-- This lookup breaks when a checklist item is later updated/deleted.
--
-- Fix: Add source_checklist_instance_id and source_checklist_item_id directly
-- on vehicle_issues so the source can always be resolved in one query.
-- Old linked_vehicle_issue_id on checklist_instance_items is kept for backward
-- compatibility; resolution code will prefer the new columns and fall back.

ALTER TABLE public.vehicle_issues
  ADD COLUMN IF NOT EXISTS source_checklist_instance_id UUID
    REFERENCES public.checklist_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_checklist_item_id UUID
    REFERENCES public.checklist_instance_items(id) ON DELETE SET NULL;

-- Index to allow fast lookup of all issues originating from a given checklist
-- instance (e.g. "show all issues raised during this handover").
CREATE INDEX IF NOT EXISTS idx_vehicle_issues_source_instance
  ON public.vehicle_issues (source_checklist_instance_id)
  WHERE source_checklist_instance_id IS NOT NULL;
