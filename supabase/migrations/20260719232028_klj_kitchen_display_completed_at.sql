/*
# KLJ Bestelsysteem: keuken-display status + completed_at

## Wijzigingen
1. `klj_orders`:
   - Nieuwe kolom `completed_at` (timestamptz, nullable) — tijdstip waarop de keuken de bestelling als klaar markt. Wordt gebruikt om de wachttimer te bevriezen op voltooide bestellingen.
2. Status flow wordt: pending → preparing → done (of cancelled).
   - `preparing` = keuken is bezig met de bestelling.
   - `done` = keuken is klaar, ober kan ophalen.
   - `completed_at` wordt gezet wanneer status → 'done'.
3. Geen RLS-wijzigingen; nieuwe kolom erft bestaande policies.
*/

ALTER TABLE klj_orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill completed_at voor bestaande done orders (gebruik updated_at als benadering).
UPDATE klj_orders SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL;
