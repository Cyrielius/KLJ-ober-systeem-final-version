/*
# KLJ Bestelsysteem: workflow modus, 3-state beschikbaarheid, geluidskosten

## Wijzigingen
1. `klj_sessions`:
   - Nieuwe kolom `workflow_mode` (text, default '2-step'): '1-step' of '2-step'.
   - Nieuwe kolom `sound_type` (text, default 'beep'): type geluid bij nieuwe bestelling.
   - Nieuwe kolom `sound_url` (text, nullable): URL naar eigen MP3-bestand (opgeslagen in Supabase Storage).
2. `klj_products`:
   - Nieuwe kolom `availability` (text, default 'available'): 'available', 'unavailable', 'hidden'.
   - Bestaande `available` boolean blijft behouden voor backwards compat; nieuwe kolom is leidend.
   - Backfill: available=true → 'available', available=false → 'unavailable'.
3. `klj_orders`:
   - Nieuwe kolom `made_at` (timestamptz, nullable): tijdstip waarop keuken "Bestelling gemaakt" klikt (1-step modus).
4. Beveiliging
   - Geen RLS-wijzigingen; nieuwe kolommen erven bestaande per-tabel policies.
5. Notities
   - Alle nieuwe kolommen zijn nullable of hebben een default, dus bestaande rijen worden niet aangeraakt.
   - `klj_tables` tabel blijft bestaan maar wordt niet meer actief gebruikt (ober vult tafelnummer zelf in).
*/

-- Workflow modus op sessie
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS workflow_mode text NOT NULL DEFAULT '2-step';
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS sound_type text NOT NULL DEFAULT 'beep';
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS sound_url text;

-- 3-state beschikbaarheid op producten
ALTER TABLE klj_products ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'available';

-- Backfill availability op basis van bestaande available boolean
UPDATE klj_products SET availability = 'unavailable' WHERE available = false AND availability = 'available';

-- made_at tijdstip voor 1-step modus
ALTER TABLE klj_orders ADD COLUMN IF NOT EXISTS made_at timestamptz;
