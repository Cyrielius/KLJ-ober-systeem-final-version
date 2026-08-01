/*
# Logo-opslag voor KLJ bestelsysteem

1. Nieuwe kolom
- `klj_sessions.logo_url` (text, nullable) — publieke URL van het KLJ-logo
  dat op geprinte bonnetjes en QR-prints verschijnt. Wordt gevuld via de
  upload-knop in het instellingen-scherm.

2. Storage bucket
- `klj-logos` (public) — openbare bucket voor logo-afbeeldingen (PNG/JPG).
  Hetzelfde patroon als de bestaande `klj-sounds` bucket.

3. Beveiliging
- Geen nieuwe RLS policies nodig (klj_sessions heeft reeds policies).
- De storage bucket is public (alleen-lezen voor iedereen); schrijven
  gebeurt via de anon-key frontend, net zoals klj-sounds.
*/

ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public)
SELECT 'klj-logos', 'klj-logos', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'klj-logos');
