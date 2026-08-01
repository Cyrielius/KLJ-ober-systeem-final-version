/*
# KLJ Bestelsysteem: keuken claim-systeem

## Doel
Keukenmedewerkers kunnen een bestelling claimen zodat alle keukenschermen zien
wie waarmee bezig is. Een keukenmedewerker kan slechts 1 bestelling tegelijk
openen. Claims verdwijnen automatisch bij afronden, openen van een andere
bestelling, sluiten, of verlaten van het scherm (heartbeat-timeout => geen
spookclaims).

## Wijzigingen
1. Nieuwe tabel `klj_kitchen_sessions`:
   - session_id (klj_sessions FK), worker_session_id (unieke uuid per keukenscherm)
   - name (naam van de keukenmedewerker)
   - current_order_id (uuid, nullable - welke bestelling deze medewerker nu open heeft)
   - last_heartbeat_at (timestamptz - elke 5s geupdate zolang scherm open is)
   - RLS: anon+authenticated CRUD (no-auth app, session code is credential)
2. `klj_orders` nieuwe kolommen:
   - kitchen_claimed_by (text, nullable - naam voor weergave op alle schermen)
   - kitchen_claimed_session_id (uuid, nullable - link naar klj_kitchen_sessions.worker_session_id)
   - kitchen_claimed_at (timestamptz, nullable)
3. Nieuwe RPC `klj_cleanup_stale_kitchen_claims(max_age_seconds int DEFAULT 15)`:
   - SECURITY DEFINER, verwijdert claims van orders wiens keukensessie heartbeat
     ouder is dan max_age_seconds, en verwijdert verlopen sessies.
   - Voorkomt spookclaims als een keukenscherm crasht of de verbinding verliest.
4. Realtime op klj_kitchen_sessions ingeschakeld.
5. Beveiliging: geen auth, zelfde patroon als bestaande tabellen (TO anon, authenticated).

## Notities
- Alle nieuwe kolommen zijn nullable, dus bestaande orders/sessions worden niet aangeraakt.
- claim-kolommen op klj_orders worden gewist bij status -> completed (in app-code).
*/

-- ============================================================
-- klj_kitchen_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS klj_kitchen_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  worker_session_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  current_order_id uuid,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_klj_kitchen_sessions_session ON klj_kitchen_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_klj_kitchen_sessions_heartbeat ON klj_kitchen_sessions(last_heartbeat_at);

ALTER TABLE klj_kitchen_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_kitchen_sessions" ON klj_kitchen_sessions;
CREATE POLICY "anon_select_kitchen_sessions" ON klj_kitchen_sessions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_kitchen_sessions" ON klj_kitchen_sessions;
CREATE POLICY "anon_insert_kitchen_sessions" ON klj_kitchen_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_kitchen_sessions" ON klj_kitchen_sessions;
CREATE POLICY "anon_update_kitchen_sessions" ON klj_kitchen_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_kitchen_sessions" ON klj_kitchen_sessions;
CREATE POLICY "anon_delete_kitchen_sessions" ON klj_kitchen_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- claim kolommen op klj_orders
-- ============================================================
ALTER TABLE klj_orders ADD COLUMN IF NOT EXISTS kitchen_claimed_by text;
ALTER TABLE klj_orders ADD COLUMN IF NOT EXISTS kitchen_claimed_session_id uuid;
ALTER TABLE klj_orders ADD COLUMN IF NOT EXISTS kitchen_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_klj_orders_claim_session ON klj_orders(kitchen_claimed_session_id);

-- ============================================================
-- RPC: klj_cleanup_stale_kitchen_claims
-- ============================================================
CREATE OR REPLACE FUNCTION klj_cleanup_stale_kitchen_claims(max_age_seconds int DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Vrijgeven van claims op orders van keukensessies met verlopen heartbeat
  UPDATE klj_orders
    SET kitchen_claimed_by = NULL,
        kitchen_claimed_session_id = NULL,
        kitchen_claimed_at = NULL,
        updated_at = now()
    WHERE kitchen_claimed_session_id IS NOT NULL
      AND kitchen_claimed_session_id IN (
        SELECT worker_session_id FROM klj_kitchen_sessions
          WHERE last_heartbeat_at < now() - (max_age_seconds || ' seconds')::interval
      );
  -- Verwijderen van verlopen keukensessies
  DELETE FROM klj_kitchen_sessions
    WHERE last_heartbeat_at < now() - (max_age_seconds || ' seconds')::interval;
END;
$$;

GRANT EXECUTE ON FUNCTION klj_cleanup_stale_kitchen_claims(int) TO anon, authenticated;

-- Realtime op keukensessies
ALTER PUBLICATION supabase_realtime ADD TABLE klj_kitchen_sessions;