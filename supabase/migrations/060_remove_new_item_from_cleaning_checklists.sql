-- Migration 060: Remove accidental "New item" placeholder from cleaning checklists
--
-- The provision_default_checklist_templates function previously seeded a row
-- with label = 'New item' (sort_order 70, position 7) into every company's
-- cleaning checklist template. This was a placeholder that slipped into the
-- canonical list. Migration 044 has been corrected; this migration removes the
-- rows that were already written to existing companies.

DELETE FROM public.checklist_template_items cti
USING  public.checklist_templates ct
WHERE  cti.template_id = ct.id
  AND  ct.type         = 'cleaning'
  AND  ct.is_system    = TRUE
  AND  cti.label       = 'New item';
