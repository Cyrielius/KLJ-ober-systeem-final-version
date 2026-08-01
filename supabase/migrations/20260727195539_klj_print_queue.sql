/*
# KLJ Bestelsysteem: print-queue (keuken -> host PC)

De keuken heeft geen printer; de printer hangt aan de host-PC.
Keuken voegt een rij toe aan klj_print_queue, host abonneert zich via realtime
en drukt automatisch af, daarna verwijdert de host de rij.
*/
CREATE TABLE IF NOT EXISTS klj_print_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES klj_orders(id) ON DELETE CASCADE,
  order_num integer NOT NULL,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_klj_print_queue_session ON klj_print_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_klj_print_queue_created ON klj_print_queue(created_at);

ALTER TABLE klj_print_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_print_queue" ON klj_print_queue;
CREATE POLICY "anon_select_print_queue" ON klj_print_queue FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_print_queue" ON klj_print_queue;
CREATE POLICY "anon_insert_print_queue" ON klj_print_queue FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_print_queue" ON klj_print_queue;
CREATE POLICY "anon_delete_print_queue" ON klj_print_queue FOR DELETE
  TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE klj_print_queue;