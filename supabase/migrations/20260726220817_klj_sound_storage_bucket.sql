INSERT INTO storage.buckets (id, name, public) VALUES ('klj-sounds', 'klj-sounds', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_read_sounds" ON storage.objects;
CREATE POLICY "anon_read_sounds" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'klj-sounds');

DROP POLICY IF EXISTS "anon_upload_sounds" ON storage.objects;
CREATE POLICY "anon_upload_sounds" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'klj-sounds');

DROP POLICY IF EXISTS "anon_update_sounds" ON storage.objects;
CREATE POLICY "anon_update_sounds" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'klj-sounds') WITH CHECK (bucket_id = 'klj-sounds');