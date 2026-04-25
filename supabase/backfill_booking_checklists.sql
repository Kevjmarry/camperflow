-- Backfill: create missing checklist_instances + checklist_instance_items
-- for all non-cancelled bookings that have a vehicle assigned.
--
-- Safe to run multiple times (fully idempotent):
--   • Instances:  skips any (booking_id, template_id) pair that already exists.
--   • Items:      skips any (instance_id, template_item_id) pair that already exists.
--
-- Scope: active, booking-scoped templates only.
-- vehicle_id on new instances is filled automatically by
-- trg_checklist_instance_inherit_vehicle (migration 023).

BEGIN;

-- ── 1. Create missing checklist instances ─────────────────────────────────────

INSERT INTO public.checklist_instances
  (company_id, booking_id, template_id, checklist_type, status)
SELECT
  b.company_id,
  b.id            AS booking_id,
  t.id            AS template_id,
  t.type          AS checklist_type,
  'pending'       AS status
FROM   public.bookings             b
JOIN   public.checklist_templates  t
       ON  t.company_id = b.company_id
       AND t.scope      = 'booking'
       AND t.active     = TRUE
WHERE  b.status    != 'cancelled'
  AND  b.vehicle_id IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.checklist_instances ci
         WHERE  ci.booking_id  = b.id
           AND  ci.template_id = t.id
       );

-- ── 2. Create missing checklist instance items ────────────────────────────────

INSERT INTO public.checklist_instance_items
  (instance_id, template_item_id, checked)
SELECT
  ci.id   AS instance_id,
  ti.id   AS template_item_id,
  FALSE   AS checked
FROM   public.checklist_instances      ci
JOIN   public.bookings                 b
       ON  b.id = ci.booking_id
JOIN   public.checklist_template_items ti
       ON  ti.template_id = ci.template_id
WHERE  ci.booking_id IS NOT NULL
  AND  b.status    != 'cancelled'
  AND  b.vehicle_id IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.checklist_instance_items cii
         WHERE  cii.instance_id      = ci.id
           AND  cii.template_item_id = ti.id
       );

COMMIT;
