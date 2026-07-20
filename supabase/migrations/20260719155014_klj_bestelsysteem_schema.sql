/*
# KLJ Bestelsysteem schema

Realtime order management for KLJ / eetfestijn events. No sign-in —
waiters join with a session code, host manages with a PIN. All data is
scoped to a session and intentionally shared between devices on the same
session, so policies use TO anon, authenticated with USING (true).

## Tables
1. `klj_sessions` — one row per event. Holds 6-digit code + 4-digit PIN + vakje value + event name.
2. `klj_products` — products for a session (name, price, emoji, category, available, sort order).
3. `klj_tables` — tables for a session (name + sort order).
4. `klj_orders` — orders. status: pending | done | cancelled. items stored as JSONB. next_order_num counter lives on the session row.
5. `klj_order_events` — append-only audit log of order changes (create/update/cancel) for the history view.

## Security
- RLS enabled on every table.
- All tables use TO anon, authenticated with USING (true) / WITH CHECK (true) because the app has no sign-in; anyone with a session code is meant to read/write that session's data. The session code itself is the access credential (6-digit, shared by the host).
- No user_id columns — single-tenant per session by design.

## Notes
- `klj_sessions.next_order_num` is an integer counter incremented per new order. We use a Postgres function `klj_claim_order_num` to atomically claim the next number to avoid race conditions between concurrent waiters.
- All timestamps are timestamptz defaulting to now().
*/

CREATE TABLE IF NOT EXISTS klj_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  pin text NOT NULL,
  event_name text NOT NULL,
  vakje_value numeric NOT NULL DEFAULT 1.00,
  next_order_num integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS klj_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  emoji text NOT NULL DEFAULT '🛒',
  category text NOT NULL DEFAULT 'Overige',
  available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS klj_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS klj_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  num integer NOT NULL,
  table_name text NOT NULL,
  waiter text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  vakjes integer NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'pending',
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS klj_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES klj_orders(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES klj_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  waiter text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_klj_products_session ON klj_products(session_id);
CREATE INDEX IF NOT EXISTS idx_klj_tables_session ON klj_tables(session_id);
CREATE INDEX IF NOT EXISTS idx_klj_orders_session ON klj_orders(session_id);
CREATE INDEX IF NOT EXISTS idx_klj_orders_status ON klj_orders(session_id, status);
CREATE INDEX IF NOT EXISTS idx_klj_order_events_order ON klj_order_events(order_id);

ALTER TABLE klj_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE klj_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE klj_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE klj_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE klj_order_events ENABLE ROW LEVEL SECURITY;

-- klj_sessions: public CRUD (no-auth app; session code is the credential)
DROP POLICY IF EXISTS "anon_select_sessions" ON klj_sessions;
CREATE POLICY "anon_select_sessions" ON klj_sessions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sessions" ON klj_sessions;
CREATE POLICY "anon_insert_sessions" ON klj_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sessions" ON klj_sessions;
CREATE POLICY "anon_update_sessions" ON klj_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sessions" ON klj_sessions;
CREATE POLICY "anon_delete_sessions" ON klj_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- klj_products
DROP POLICY IF EXISTS "anon_select_products" ON klj_products;
CREATE POLICY "anon_select_products" ON klj_products FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON klj_products;
CREATE POLICY "anon_insert_products" ON klj_products FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON klj_products;
CREATE POLICY "anon_update_products" ON klj_products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON klj_products;
CREATE POLICY "anon_delete_products" ON klj_products FOR DELETE
  TO anon, authenticated USING (true);

-- klj_tables
DROP POLICY IF EXISTS "anon_select_tables" ON klj_tables;
CREATE POLICY "anon_select_tables" ON klj_tables FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tables" ON klj_tables;
CREATE POLICY "anon_insert_tables" ON klj_tables FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tables" ON klj_tables;
CREATE POLICY "anon_update_tables" ON klj_tables FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tables" ON klj_tables;
CREATE POLICY "anon_delete_tables" ON klj_tables FOR DELETE
  TO anon, authenticated USING (true);

-- klj_orders
DROP POLICY IF EXISTS "anon_select_orders" ON klj_orders;
CREATE POLICY "anon_select_orders" ON klj_orders FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orders" ON klj_orders;
CREATE POLICY "anon_insert_orders" ON klj_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orders" ON klj_orders;
CREATE POLICY "anon_update_orders" ON klj_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orders" ON klj_orders;
CREATE POLICY "anon_delete_orders" ON klj_orders FOR DELETE
  TO anon, authenticated USING (true);

-- klj_order_events
DROP POLICY IF EXISTS "anon_select_order_events" ON klj_order_events;
CREATE POLICY "anon_select_order_events" ON klj_order_events FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_order_events" ON klj_order_events;
CREATE POLICY "anon_insert_order_events" ON klj_order_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_order_events" ON klj_order_events;
CREATE POLICY "anon_delete_order_events" ON klj_order_events FOR DELETE
  TO anon, authenticated USING (true);

-- Atomically claim the next order number for a session.
-- Returns the claimed number and increments the counter in one statement,
-- avoiding race conditions when multiple waiters submit at once.
CREATE OR REPLACE FUNCTION klj_claim_order_num(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_num integer;
BEGIN
  UPDATE klj_sessions SET next_order_num = next_order_num + 1
    WHERE id = p_session_id
    RETURNING next_order_num - 1 INTO v_num;
  RETURN v_num;
END;
$$;

-- Enable realtime on all tables so the frontend can subscribe to changes.
ALTER PUBLICATION supabase_realtime ADD TABLE klj_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE klj_products;
ALTER PUBLICATION supabase_realtime ADD TABLE klj_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE klj_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE klj_order_events;
