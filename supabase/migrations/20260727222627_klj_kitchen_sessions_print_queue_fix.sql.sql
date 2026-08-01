-- Keuken-sessies (per medewerker: heartbeat, huidige bestelling)
CREATE TABLE IF NOT EXISTS klj_kitchen_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  worker_session_id text NOT NULL UNIQUE,
  name text NOT NULL,
  current_order_id uuid,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_klj_kitchen_sessions_session ON klj_kitchen_sessions(session_id);

ALTER TABLE klj_kitchen_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_kitchen_sessions" ON klj_kitchen_sessions FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_kitchen_sessions" ON klj_kitchen_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_kitchen_sessions" ON klj_kitchen_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_kitchen_sessions" ON klj_kitchen_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- Print-wachtrij (keuken vraagt host-PC om af te drukken)
CREATE TABLE IF NOT EXISTS klj_print_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES klj_orders(id) ON DELETE CASCADE,
  order_num integer NOT NULL,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_klj_print_queue_session ON klj_print_queue(session_id);

ALTER TABLE klj_print_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_print_queue" ON klj_print_queue FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_print_queue" ON klj_print_queue FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_print_queue" ON klj_print_queue FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_print_queue" ON klj_print_queue FOR DELETE
  TO anon, authenticated USING (true);

-- Cleanup-functie voor verlopen kitchen claims (spookclaims)
CREATE OR REPLACE FUNCTION klj_cleanup_stale_kitchen_claims(max_age_seconds integer DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE klj_orders
    SET kitchen_claimed_by = NULL,
        kitchen_claimed_session_id = NULL,
        kitchen_claimed_at = NULL,
        updated_at = now()
    WHERE kitchen_claimed_session_id IS NOT NULL
      AND kitchen_claimed_session_id NOT IN (
        SELECT worker_session_id FROM klj_kitchen_sessions
        WHERE last_heartbeat_at > now() - (max_age_seconds || ' seconds')::interval
      );
END;
$$;

-- Voeg kitchen-claim kolommen toe aan orders indien ontbrekend
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'klj_orders' AND column_name = 'kitchen_claimed_by') THEN
    ALTER TABLE klj_orders ADD COLUMN kitchen_claimed_by text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'klj_orders' AND column_name = 'kitchen_claimed_session_id') THEN
    ALTER TABLE klj_orders ADD COLUMN kitchen_claimed_session_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'klj_orders' AND column_name = 'kitchen_claimed_at') THEN
    ALTER TABLE klj_orders ADD COLUMN kitchen_claimed_at timestamptz;
  END IF;
END $$;

-- Realtime publicatie voor de nieuwe tabellen
ALTER PUBLICATION supabase_realtime ADD TABLE klj_kitchen_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE klj_print_queue;
