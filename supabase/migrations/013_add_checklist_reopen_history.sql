-- History table for checklist reopen events.
-- Each row captures a point-in-time snapshot of the checklist before it was reset.
CREATE TABLE IF NOT EXISTS public.checklist_reopen_history (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_instance_id  uuid        NOT NULL REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  snapshot               jsonb       NOT NULL,
  reopened_by            uuid        NOT NULL,
  reason                 text,
  reopened_at            timestamptz NOT NULL DEFAULT now()
);

-- Allow staff to insert and read their own reopen history rows.
ALTER TABLE public.checklist_reopen_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert reopen history"
  ON public.checklist_reopen_history
  FOR INSERT
  TO authenticated
  WITH CHECK (reopened_by = auth.uid());

CREATE POLICY "Staff can read reopen history"
  ON public.checklist_reopen_history
  FOR SELECT
  TO authenticated
  USING (true);
