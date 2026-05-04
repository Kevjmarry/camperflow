-- Targeted checklist backfill for company 6816cbbb-ca41-4bac-844f-342d8536cd03
--
-- Scope:
--   • Bookings: status IN ('confirmed','on_rent') AND return_at >= now()
--   • Templates: active=true, scope='booking', type IN ('cleaning','mechanical','handover','return')
--
-- Safety:
--   • Step 1 uses NOT EXISTS on (booking_id, template_id) — never duplicates an instance.
--   • Step 2 uses NOT EXISTS on (instance_id, template_item_id) — never duplicates items.
--   • Existing handover (or any other type) instances are left untouched.
--   • vehicle_id is populated automatically by trg_checklist_instance_inherit_vehicle (migration 023).
--   • Fully idempotent — safe to run more than once.
--
-- ── DRY RUN: review before executing ─────────────────────────────────────────
-- Run this SELECT first to see what instances would be created:
--
-- SELECT
--   b.id            AS booking_id,
--   b.status        AS booking_status,
--   b.return_at,
--   t.id            AS template_id,
--   t.type          AS checklist_type
-- FROM   public.bookings            b
-- JOIN   public.checklist_templates t
--        ON  t.company_id = b.company_id
--        AND t.scope      = 'booking'
--        AND t.active     = TRUE
--        AND t.type       IN ('cleaning', 'mechanical', 'handover', 'return')
-- WHERE  b.company_id = '6816cbbb-ca41-4bac-844f-342d8536cd03'
--   AND  b.status    IN ('confirmed', 'on_rent')
--   AND  b.return_at >= now()
--   AND  NOT EXISTS (
--          SELECT 1
--          FROM   public.checklist_instances ci
--          WHERE  ci.booking_id  = b.id
--            AND  ci.template_id = t.id
--        )
-- ORDER  BY b.return_at, t.type;

BEGIN;

-- ── Step 1: Insert missing checklist instances ────────────────────────────────

INSERT INTO public.checklist_instances
  (company_id, booking_id, template_id, checklist_type, status)
SELECT
  b.company_id,
  b.id       AS booking_id,
  t.id       AS template_id,
  t.type     AS checklist_type,
  'pending'  AS status
FROM   public.bookings            b
JOIN   public.checklist_templates t
       ON  t.company_id = b.company_id
       AND t.scope      = 'booking'
       AND t.active     = TRUE
       AND t.type       IN ('cleaning', 'mechanical', 'handover', 'return')
WHERE  b.company_id = '6816cbbb-ca41-4bac-844f-342d8536cd03'
  AND  b.status    IN ('confirmed', 'on_rent')
  AND  b.return_at >= now()
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.checklist_instances ci
         WHERE  ci.booking_id  = b.id
           AND  ci.template_id = t.id
       );

-- ── Step 2: Insert missing checklist instance items ───────────────────────────

INSERT INTO public.checklist_instance_items
  (instance_id, template_item_id, checked)
SELECT
  ci.id  AS instance_id,
  ti.id  AS template_item_id,
  FALSE  AS checked
FROM   public.checklist_instances      ci
JOIN   public.bookings                 b
       ON  b.id = ci.booking_id
JOIN   public.checklist_template_items ti
       ON  ti.template_id = ci.template_id
WHERE  b.company_id = '6816cbbb-ca41-4bac-844f-342d8536cd03'
  AND  b.status    IN ('confirmed', 'on_rent')
  AND  b.return_at >= now()
  AND  ci.checklist_type IN ('cleaning', 'mechanical', 'handover', 'return')
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.checklist_instance_items cii
         WHERE  cii.instance_id      = ci.id
           AND  cii.template_item_id = ti.id
       );

COMMIT;

-- ── Post-run verification ─────────────────────────────────────────────────────
-- Check instance counts per booking and type after the backfill:
--
-- SELECT
--   b.id         AS booking_id,
--   b.return_at,
--   b.status,
--   ci.checklist_type,
--   ci.status    AS ci_status,
--   COUNT(cii.id) AS item_count
-- FROM   public.bookings              b
-- JOIN   public.checklist_instances   ci  ON ci.booking_id = b.id
-- LEFT JOIN public.checklist_instance_items cii ON cii.instance_id = ci.id
-- WHERE  b.company_id = '6816cbbb-ca41-4bac-844f-342d8536cd03'
--   AND  b.status    IN ('confirmed', 'on_rent')
--   AND  b.return_at >= now()
--   AND  ci.checklist_type IN ('cleaning', 'mechanical', 'handover', 'return')
-- GROUP  BY b.id, b.return_at, b.status, ci.checklist_type, ci.status
-- ORDER  BY b.return_at, ci.checklist_type;
