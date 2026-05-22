-- Migration 061: Fix ui_section for return-template items misclassified as checklist_actions
--
-- Root cause: migration 015 set DEFAULT 'checklist_actions' for all pre-existing rows.
-- Migration 040 reclassified only items with "deposit" in the label, leaving three
-- deposit-radio labels and three close-out labels still in 'checklist_actions'.
--
-- Impact on return checklists:
--   • Items with ui_section='checklist_actions' are rendered in Phase 2 Audit and are
--     required by handleReturnCompleteButton (hasUncheckedAudit check).
--   • Deposit-radio items ("Returned to customer", "Pending admin return",
--     "Held for damage") are phantom rows — their checked state is never written by the
--     UI (the actual deposit selection lives in checklist_instances.return_deposit_status).
--     When wrongly in 'checklist_actions' they appear in the audit AND block completion.
--   • Close-out items ("Keys received", "Documents received", "Contract closed") are
--     similarly managed via checklist_instances columns, not item.checked.
--     getReturnAuditDisplayLabel already hides them by label match, so they don't
--     currently block completion — but reclassifying them is correct for data integrity.
--
-- Since ui_section is fetched via JOIN to checklist_template_items (not stored on
-- checklist_instance_items), this migration fixes all existing return instances
-- immediately with no instance-level row updates needed.

BEGIN;

-- ── 1. Deposit-radio options → deposit_status ────────────────────────────────

UPDATE public.checklist_template_items ti
SET    ui_section = 'deposit_status'
FROM   public.checklist_templates t
WHERE  t.id          = ti.template_id
  AND  t.type        = 'return'
  AND  ti.ui_section = 'checklist_actions'
  AND  lower(ti.label) IN (
    'returned to customer',
    'pending admin return',
    'held for damage'
  );

-- ── 2. Close-out confirmations → return_close_out ────────────────────────────

UPDATE public.checklist_template_items ti
SET    ui_section = 'return_close_out'
FROM   public.checklist_templates t
WHERE  t.id          = ti.template_id
  AND  t.type        = 'return'
  AND  ti.ui_section = 'checklist_actions'
  AND  lower(ti.label) IN (
    'keys received',
    'documents received',
    'contract closed'
  );

-- ── 3. Vehicle-data items → vehicle_data ─────────────────────────────────────
-- These are already hidden by getReturnAuditDisplayLabel label-matching, but
-- reclassifying them makes the data model consistent with newly-provisioned templates.

UPDATE public.checklist_template_items ti
SET    ui_section = 'vehicle_data'
FROM   public.checklist_templates t
WHERE  t.id          = ti.template_id
  AND  t.type        = 'return'
  AND  ti.ui_section = 'checklist_actions'
  AND  lower(ti.label) IN (
    'kilometers',
    'fuel level',
    'adblue level'
  );

COMMIT;
