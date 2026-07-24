/*
# KLJ Bestelsysteem: storage bucket for custom sounds

## Wijzigingen
1. Maakt een public storage bucket 'klj-sounds' aan voor het opslaan van eigen MP3-geluiden.
2. RLS policies: anyone can read (public bucket), anyone can upload (no-auth app, session code is credential).
*/

INSERT INTO storage.buckets (id, name, public) VALUES ('klj-sounds', 'klj-sounds', true) ON CONFLICT (id) DO NOTHING;

-- Public read access
DROP POLICY IF EXISTS "anon_read_sounds" ON storage.objects;
CREATE POLICY "anon_read_sounds" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'klj-sounds');

-- Public upload access
DROP POLICY IF EXISTS "anon_upload_sounds" ON storage.objects;
CREATE POLICY "anon_upload_sounds" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'klj-sounds');

-- Public update (for upsert)
DROP POLICY IF EXISTS "anon_update_sounds" ON storage.objects;
CREATE POLICY "anon_update_sounds" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'klj-sounds') WITH CHECK (bucket_id = 'klj-sounds');
