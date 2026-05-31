ALTER TABLE checklist_instance_items
  ADD COLUMN IF NOT EXISTS issue_photo_paths text[];
