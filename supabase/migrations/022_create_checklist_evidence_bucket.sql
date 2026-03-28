-- Create storage bucket for checklist evidence photos (public read, staff write/delete)
INSERT INTO storage.buckets (id, name, public)
VALUES ('checklist-evidence', 'checklist-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Anyone authenticated can read evidence photos (needed for <img> tags)
CREATE POLICY "Anyone can view checklist evidence"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'checklist-evidence');

-- Storage policy: Only staff can upload evidence photos
CREATE POLICY "Staff can upload checklist evidence"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'checklist-evidence' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Storage policy: Only staff can update evidence photos
CREATE POLICY "Staff can update checklist evidence"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'checklist-evidence' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );

-- Storage policy: Only staff can delete evidence photos
CREATE POLICY "Staff can delete checklist evidence"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'checklist-evidence' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
  );
