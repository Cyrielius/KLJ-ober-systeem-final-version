/*
# KLJ Bestelsysteem: 3-status flow (ontvangen → klaar → afgerond)

## Wijzigingen
1. `klj_orders`:
   - Nieuwe kolom `picked_up_at` (timestamptz, nullable) — tijdstip waarop ober de bestelling afhaalt (status → completed).
2. Status flow: pending (ontvangen) → done (klaar in keuken) → completed (afgerond/afgehaald).
   - 'preparing' status wordt niet meer gebruikt; bestaande 'preparing' orders teruggezet naar 'pending'.
3. Geen RLS-wijzigingen.
*/

ALTER TABLE klj_orders ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;

-- Migrate any 'preparing' orders back to 'pending'.
UPDATE klj_orders SET status = 'pending' WHERE status = 'preparing';
