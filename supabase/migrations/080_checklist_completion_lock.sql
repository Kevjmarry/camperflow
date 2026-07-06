-- Migration 080: Checklist completion locking (immutable answers, append-only evidence)
--
-- Problem: completing a checklist (any type) makes the whole thing read-only
-- in the frontend, but nothing enforces this server-side — a direct API/DB
-- call can freely edit a "completed" checklist_instances/checklist_instance_items
-- row, or delete evidence photos from bookings.staff_metadata.
--
-- Fix: three BEFORE UPDATE triggers freeze the "original evidence" once a
-- checklist_instances row is completed, plus a new append-only table for
-- "supplementary evidence" (notes/photos added after completion). The lock
-- is generic across all checklist_type values — the frontend already treats
-- every type as read-only once its own status hits 'completed'
-- (ChecklistDetailClient.tsx isReadOnly), so this closes the enforcement gap
-- for existing behaviour and requires no extra migration to extend to future
-- checklist types.
--
-- Reopening (useChecklistReopen.ts) flips checklist_instances.status away
-- from 'completed' on the instance row BEFORE resetting item rows, so by the
-- time item rows are touched the parent is no longer 'completed' and the
-- triggers below allow the reset to proceed.

-- ── 1. checklist_completion_activity — append-only post-completion log ───────

CREATE TABLE IF NOT EXISTS public.checklist_completion_activity (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_instance_id  UUID        NOT NULL REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  item_id                UUID        REFERENCES public.checklist_instance_items(id) ON DELETE CASCADE,
  company_id             UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind                   TEXT        NOT NULL CHECK (kind IN ('note', 'photo')),
  note_text              TEXT,
  photo_path             TEXT,
  photo_group            TEXT        CHECK (photo_group IN ('general', 'damage', 'id')),
  created_by             UUID        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'note'  AND note_text  IS NOT NULL AND photo_path IS NULL) OR
    (kind = 'photo' AND photo_path IS NOT NULL AND photo_group IS NOT NULL AND note_text IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_checklist_completion_activity_instance_id
  ON public.checklist_completion_activity(checklist_instance_id);
CREATE INDEX IF NOT EXISTS idx_checklist_completion_activity_item_id
  ON public.checklist_completion_activity(item_id)
  WHERE item_id IS NOT NULL;

ALTER TABLE public.checklist_completion_activity ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT only — no UPDATE or DELETE policy exists, so RLS default-denies
-- both. Rows are immutable the moment they're inserted.

DROP POLICY IF EXISTS "Staff can view checklist completion activity" ON public.checklist_completion_activity;
CREATE POLICY "Staff can view checklist completion activity"
  ON public.checklist_completion_activity
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_staff_company_id());

DROP POLICY IF EXISTS "Staff can insert checklist completion activity" ON public.checklist_completion_activity;
CREATE POLICY "Staff can insert checklist completion activity"
  ON public.checklist_completion_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.current_staff_company_id()
    AND created_by = auth.uid()
    AND checklist_instance_id IN (
      SELECT id FROM public.checklist_instances
      WHERE status = 'completed' AND company_id = public.current_staff_company_id()
    )
  );

-- ── 2. Freeze checklist_instances "answer" columns once completed ────────────

CREATE OR REPLACE FUNCTION public.enforce_checklist_instance_completion_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status = 'completed' AND (
    NEW.office_contract_signed    IS DISTINCT FROM OLD.office_contract_signed    OR
    NEW.office_id_verified        IS DISTINCT FROM OLD.office_id_verified        OR
    NEW.office_deposit_collected  IS DISTINCT FROM OLD.office_deposit_collected  OR
    NEW.handover_documents_given  IS DISTINCT FROM OLD.handover_documents_given  OR
    NEW.handover_keys_given       IS DISTINCT FROM OLD.handover_keys_given       OR
    NEW.return_keys_received      IS DISTINCT FROM OLD.return_keys_received      OR
    NEW.return_documents_received IS DISTINCT FROM OLD.return_documents_received OR
    NEW.return_contract_closed    IS DISTINCT FROM OLD.return_contract_closed    OR
    NEW.return_deposit_status     IS DISTINCT FROM OLD.return_deposit_status     OR
    NEW.started_at                IS DISTINCT FROM OLD.started_at                OR
    NEW.started_by                IS DISTINCT FROM OLD.started_by                OR
    NEW.completed_at              IS DISTINCT FROM OLD.completed_at              OR
    NEW.completed_by              IS DISTINCT FROM OLD.completed_by
  ) THEN
    RAISE EXCEPTION 'Cannot modify checklist after completion. Reopen the checklist to make changes.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_checklist_instance_completion_lock ON public.checklist_instances;
CREATE TRIGGER trg_enforce_checklist_instance_completion_lock
  BEFORE UPDATE ON public.checklist_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_checklist_instance_completion_lock();

-- ── 3. Freeze checklist_instance_items once the parent instance is completed ─

CREATE OR REPLACE FUNCTION public.enforce_checklist_item_completion_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
  FROM public.checklist_instances
  WHERE id = NEW.instance_id;

  IF parent_status = 'completed' THEN
    RAISE EXCEPTION 'Cannot modify checklist item after completion. Add a supplementary note or reopen the checklist.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_checklist_item_completion_lock ON public.checklist_instance_items;
CREATE TRIGGER trg_enforce_checklist_item_completion_lock
  BEFORE UPDATE ON public.checklist_instance_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_checklist_item_completion_lock();

-- ── 4. Append-only enforcement for evidence photos in bookings.staff_metadata ─
-- handover_evidence_photos / return_evidence_photos are JSON arrays whose
-- elements are either {path, rotation} objects or (for older rows) bare path
-- strings — the frontend already reads both forms (ChecklistDetailClient.tsx
-- pathToStored). Once the related checklist is completed, previously-stored
-- paths must still be present in the new value for each group — entries can
-- only be appended, never removed or swapped. Rotation edits to existing
-- entries are allowed (not a deletion of evidence). No-ops entirely for
-- bookings with no completed handover/return checklist, so unrelated
-- staff_metadata writes are unaffected.

CREATE OR REPLACE FUNCTION public.assert_evidence_group_append_only(
  old_group JSONB,
  new_group JSONB
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  old_paths TEXT[];
  new_paths TEXT[];
BEGIN
  SELECT COALESCE(array_agg(
      CASE WHEN jsonb_typeof(elem) = 'string' THEN elem #>> '{}' ELSE elem ->> 'path' END
    ), ARRAY[]::TEXT[])
    INTO old_paths
    FROM jsonb_array_elements(COALESCE(old_group, '[]'::jsonb)) elem;

  SELECT COALESCE(array_agg(
      CASE WHEN jsonb_typeof(elem) = 'string' THEN elem #>> '{}' ELSE elem ->> 'path' END
    ), ARRAY[]::TEXT[])
    INTO new_paths
    FROM jsonb_array_elements(COALESCE(new_group, '[]'::jsonb)) elem;

  IF EXISTS (
    SELECT 1 FROM unnest(old_paths) p WHERE p <> ALL(new_paths)
  ) THEN
    RAISE EXCEPTION 'Cannot remove existing evidence photos after checklist completion.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_evidence_photos_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed_types TEXT[];
  old_meta JSONB;
  new_meta JSONB;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT checklist_type), ARRAY[]::TEXT[])
    INTO completed_types
    FROM public.checklist_instances
    WHERE booking_id = NEW.id
      AND status = 'completed'
      AND checklist_type IN ('handover', 'return');

  IF array_length(completed_types, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  old_meta := COALESCE(OLD.staff_metadata, '{}'::jsonb);
  new_meta := COALESCE(NEW.staff_metadata, '{}'::jsonb);

  IF 'handover' = ANY(completed_types) THEN
    PERFORM public.assert_evidence_group_append_only(old_meta -> 'handover_evidence_photos' -> 'general', new_meta -> 'handover_evidence_photos' -> 'general');
    PERFORM public.assert_evidence_group_append_only(old_meta -> 'handover_evidence_photos' -> 'damage',  new_meta -> 'handover_evidence_photos' -> 'damage');
    PERFORM public.assert_evidence_group_append_only(old_meta -> 'handover_evidence_photos' -> 'id',      new_meta -> 'handover_evidence_photos' -> 'id');
  END IF;

  IF 'return' = ANY(completed_types) THEN
    PERFORM public.assert_evidence_group_append_only(old_meta -> 'return_evidence_photos' -> 'general', new_meta -> 'return_evidence_photos' -> 'general');
    PERFORM public.assert_evidence_group_append_only(old_meta -> 'return_evidence_photos' -> 'damage',  new_meta -> 'return_evidence_photos' -> 'damage');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_evidence_photos_append_only ON public.bookings;
CREATE TRIGGER trg_enforce_evidence_photos_append_only
  BEFORE UPDATE OF staff_metadata ON public.bookings
  FOR EACH ROW
  WHEN (OLD.staff_metadata IS DISTINCT FROM NEW.staff_metadata)
  EXECUTE FUNCTION public.enforce_evidence_photos_append_only();
