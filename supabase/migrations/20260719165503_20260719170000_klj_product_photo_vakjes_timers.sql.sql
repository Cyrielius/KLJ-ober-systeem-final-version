/*
# KLJ Bestelsysteem: productfoto, handmatige vakjes, timer-drempels

## Wijzigingen
1. `klj_products`:
   - Nieuwe kolom `photo_url` (text, nullable) — optionele URL naar een productfoto.
   - Nieuwe kolom `vakjes_override` (integer, nullable) — wanneer ingevuld wordt dit aantal vakjes gebruikt i.p.v. de automatische berekening (price / vakje_value).
2. `klj_sessions`:
   - Nieuwe kolommen `timer_yellow` (int, default 5), `timer_orange` (int, default 8), `timer_red` (int, default 10), `timer_critical` (int, default 15) — configureerbare drempels voor vergeten-bestelling waarschuwingen (in minuten).
3. Beveiliging
   - Geen RLS- of policy-wijzigingen; nieuwe kolommen erven de bestaande per-tabel policies.
## Notities
- Alle nieuwe kolommen zijn nullable of hebben een default, dus bestaande rijen worden niet aangeraakt en er gaat geen gegevens verloren.
*/

ALTER TABLE klj_products ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE klj_products ADD COLUMN IF NOT EXISTS vakjes_override integer;

ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_yellow integer NOT NULL DEFAULT 5;
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_orange integer NOT NULL DEFAULT 8;
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_red integer NOT NULL DEFAULT 10;
ALTER TABLE klj_sessions ADD COLUMN IF NOT EXISTS timer_critical integer NOT NULL DEFAULT 15;
