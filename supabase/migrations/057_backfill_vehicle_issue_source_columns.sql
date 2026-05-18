-- Migration 057: Backfill source columns on vehicle_issues for pre-026 rows
--
-- Migration 026 added source_checklist_instance_id and source_checklist_item_id
-- to vehicle_issues but did not backfill rows that existed before the migration
-- ran. Those legacy rows have source_checklist_instance_id IS NULL while
-- checklist_instance_items.linked_vehicle_issue_id still points back to them.
--
-- This UPDATE resolves the join in one pass so the reverse-lookup shim in
-- application code (vehicles/[id]/page.tsx and the four ops query files) can
-- subsequently be removed once this migration is confirmed on all environments.
--
-- Safe to run multiple times: the WHERE clause restricts to rows still NULL.

UPDATE public.vehicle_issues vi
SET
  source_checklist_instance_id = cii.instance_id,
  source_checklist_item_id     = cii.id
FROM public.checklist_instance_items cii
WHERE cii.linked_vehicle_issue_id = vi.id
  AND vi.source_checklist_instance_id IS NULL;
