-- Migration 077: All-4-immediate checklist provisioning
--
-- Switches from a progressive creation model (handover → return → cleaning/mechanical)
-- to: every non-cancelled, non-completed booking always has all 4 booking-scoped
-- checklist instances from the moment it is created or confirmed.
--
-- Changes:
--   0. Deduplication
--      Remove duplicate (booking_id, template_id) rows so the UNIQUE constraint
--      in step 1 can be applied. checklist_instance_items cascade-delete via FK.
--      The row with the most progress (completed > in_progress > pending) and the
--      oldest id is kept; all others are removed.
--
--   1. UNIQUE constraint (booking_id, template_id)
--      NULL booking_id rows (vehicle-scoped) are unaffected — PostgreSQL treats
--      NULLs as distinct in UNIQUE constraints.
--
--   2. Drop progressive lifecycle triggers (exact production names from audit)
--      Provisioning triggers on bookings (replaced by trg_provision_booking_checklists):
--        trg_bookings_ensure_handover_return_insert
--        trg_bookings_ensure_handover_return_update
--        trg_bookings_ensure_cleaning_checklist
--      Blocking trigger on checklist_instances:
--        trg_prevent_return_before_handover
--      Blocking trigger on checklist_instance_items:
--        trg_prevent_return_item_updates_before_handover
--      Lifecycle trigger (table uncertain — dropped defensively from all candidates):
--        trg_checklist_lifecycle
--
--   2b. Drop related backing functions (CASCADE removes any remaining dependents)
--
--   3. Authoritative AFTER INSERT OR UPDATE OF status trigger on bookings
--      Covers new inserts and status transitions (e.g. draft → confirmed).
--      Replaces the split insert/update pair above.
--
--   4. AFTER INSERT trigger on checklist_instances → provision items
--      INSERT only — firing on UPDATE would re-provision on every status change.
--
--   5. Backfill confirmed + on_rent bookings

-- ── 0. Deduplication ─────────────────────────────────────────────────────────────

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY booking_id, template_id
           ORDER BY
             CASE status
               WHEN 'completed'   THEN 0
               WHEN 'in_progress' THEN 1
               ELSE                    2
             END ASC,
             id ASC
         ) AS rn
  FROM   public.checklist_instances
  WHERE  booking_id  IS NOT NULL
    AND  template_id IS NOT NULL
)
DELETE FROM public.checklist_instances
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 1. UNIQUE constraint ──────────────────────────────────────────────────────────
-- ADD CONSTRAINT has no IF NOT EXISTS variant; guard with a DO block so the
-- migration is safe to re-run after a partial execution.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname   = 'checklist_instances_booking_template_uidx'
      AND  conrelid  = 'public.checklist_instances'::regclass
  ) THEN
    ALTER TABLE public.checklist_instances
      ADD CONSTRAINT checklist_instances_booking_template_uidx
      UNIQUE (booking_id, template_id);
  END IF;
END;
$$;

-- ── 2. Drop progressive lifecycle triggers (exact production names) ───────────────

-- Provisioning triggers on bookings
DROP TRIGGER IF EXISTS trg_bookings_ensure_handover_return_insert ON public.bookings;
DROP TRIGGER IF EXISTS trg_bookings_ensure_handover_return_update ON public.bookings;
DROP TRIGGER IF EXISTS trg_bookings_ensure_cleaning_checklist     ON public.bookings;

-- Blocking trigger on checklist_instances
DROP TRIGGER IF EXISTS trg_prevent_return_before_handover         ON public.checklist_instances;

-- Blocking trigger on checklist_instance_items
DROP TRIGGER IF EXISTS trg_prevent_return_item_updates_before_handover
  ON public.checklist_instance_items;

-- Lifecycle trigger — table not confirmed; dropped from all candidate tables
DROP TRIGGER IF EXISTS trg_checklist_lifecycle ON public.checklist_instances;
DROP TRIGGER IF EXISTS trg_checklist_lifecycle ON public.bookings;
DROP TRIGGER IF EXISTS trg_checklist_lifecycle ON public.checklist_instance_items;

-- ── 2b. Drop backing functions ────────────────────────────────────────────────────
-- CASCADE removes any dependent trigger not named above.

DROP FUNCTION IF EXISTS public.fn_checklist_lifecycle()                      CASCADE;
DROP FUNCTION IF EXISTS public.check_handover_completed_before_return()      CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_lock_return_items_before_handover()    CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_lock_checklist_item_before_handover()  CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_prevent_checklist_item_edit()          CASCADE;

-- ── 3. Authoritative provisioning function and trigger on bookings ─────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_provision_booking_checklists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('cancelled', 'completed') THEN
    INSERT INTO public.checklist_instances
      (company_id, booking_id, template_id, checklist_type, status)
    SELECT
      NEW.company_id,
      NEW.id,
      t.id,
      t.type,
      'pending'
    FROM public.checklist_templates t
    WHERE t.company_id = NEW.company_id
      AND t.scope      = 'booking'
      AND t.active     = TRUE
    ON CONFLICT (booking_id, template_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_booking_checklists ON public.bookings;

CREATE TRIGGER trg_provision_booking_checklists
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_provision_booking_checklists();

-- ── 4. AFTER INSERT trigger on checklist_instances → provision items ──────────────

CREATE OR REPLACE FUNCTION public.trg_fn_provision_checklist_instance_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.template_id IS NOT NULL THEN
    INSERT INTO public.checklist_instance_items
      (instance_id, template_item_id, checked)
    SELECT
      NEW.id,
      ti.id,
      FALSE
    FROM public.checklist_template_items ti
    WHERE ti.template_id = NEW.template_id
    ON CONFLICT (instance_id, template_item_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_checklist_instance_items ON public.checklist_instances;

CREATE TRIGGER trg_provision_checklist_instance_items
  AFTER INSERT ON public.checklist_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_provision_checklist_instance_items();

-- ── 5. Backfill: provision missing instances for existing active bookings ─────────
-- confirmed + on_rent only; completed/cancelled excluded intentionally.

INSERT INTO public.checklist_instances
  (company_id, booking_id, template_id, checklist_type, status)
SELECT
  b.company_id,
  b.id,
  t.id,
  t.type,
  'pending'
FROM public.bookings b
JOIN public.checklist_templates t
  ON  t.company_id = b.company_id
  AND t.scope      = 'booking'
  AND t.active     = TRUE
WHERE b.status IN ('confirmed', 'on_rent')
ON CONFLICT (booking_id, template_id) DO NOTHING;

-- Backfill items for instances that have no items yet.
INSERT INTO public.checklist_instance_items
  (instance_id, template_item_id, checked)
SELECT
  ci.id,
  ti.id,
  FALSE
FROM public.checklist_instances ci
JOIN public.checklist_template_items ti
  ON ti.template_id = ci.template_id
WHERE ci.booking_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM   public.checklist_instance_items cii
    WHERE  cii.instance_id = ci.id
  )
ON CONFLICT (instance_id, template_item_id) DO NOTHING;
