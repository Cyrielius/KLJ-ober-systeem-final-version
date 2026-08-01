/*
# KLJ Ober Systeem - volledige schema

## Doel
Volledige database voor het KLJ Ober/Keuken systeem met:
- Producten (menu) met categorien en prijzen
- Bestellingen (orders) met status-flow en keuken-claim-systeem
- Bestelregels (order_items) met markeringen/aantekeningen
- Keukensessies (kitchen_sessions) voor realtime claim + aanwezigheid (heartbeat)
- App-instellingen (mode + volgend bestelnummer)

## Tabellen
1. products - menu-items (naam, categorie, prijs, actief, sort_order)
2. orders - bestellingen met status (verzonden/klaar/afgerond), mode (1 of 2),
   keuken-claim velden (claimed_by, claimed_session_id, claimed_at), ober_naam
3. order_items - regels per bestelling (product snapshot, qty, markings, notes)
4. kitchen_sessions - actieve keukenmedewerkers met heartbeat + current_order_id
5. app_settings - globale mode + next_order_number (singleton rij id=1)

## Status flow
- MODE 1: verzonden -> (keuken bevestigt klaar) -> afgerond (+ print bon)
- MODE 2: verzonden -> (keuken bevestigt klaar) -> klaar (+ print bon) -> (ober bevestigt afgehaald) -> afgerond

## Claim-systeem
- Een keukenmedewerker kan slechts 1 bestelling tegelijk openen (current_order_id op sessie)
- Claim opgeslagen op order (kitchen_claimed_by/session_id/at) -> realtime zichtbaar op alle schermen
- Claim vrijgeven bij: afronden, andere bestelling openen, sluiten, scherm verlaten (heartbeat timeout)
- cleanup_stale_claims() verwijdert claims van sessies met verlopen heartbeat

## Beveiliging (RLS)
- Geen login-scherm => single-tenant, alle data publiek/gedeeld voor anon + authenticated
- Alle tabellen: TO anon, authenticated met USING (true) / WITH CHECK (true)
- increment_order_number() en cleanup_stale_claims() zijn SECURITY DEFINER (uitvoerbaar door anon)

## Belangrijke opmerkingen
1. RPC increment_order_number() atomair volgend bestelnummer ophalen (veilig bij gelijktijdige obers)
2. RPC cleanup_stale_claims() ruimt claims op vanOffline/verlopen sessies (geen spookclaims)
3. Seed: standaard KLJ menu (bier, fris, warm, snacks) + app_settings rij
*/

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number int NOT NULL,
  table_number text NOT NULL,
  mode int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'verzonden',
  ober_name text NOT NULL,
  kitchen_claimed_by text,
  kitchen_claimed_session_id uuid,
  kitchen_claimed_at timestamptz,
  kitchen_ready_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_claim_session ON orders(kitchen_claimed_session_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- ORDER_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  markings text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
CREATE POLICY "anon_select_order_items" ON order_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
CREATE POLICY "anon_update_order_items" ON order_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;
CREATE POLICY "anon_delete_order_items" ON order_items FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- KITCHEN_SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS kitchen_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  current_order_id uuid,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_sessions_heartbeat ON kitchen_sessions(last_heartbeat_at);

ALTER TABLE kitchen_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_kitchen_sessions" ON kitchen_sessions;
CREATE POLICY "anon_select_kitchen_sessions" ON kitchen_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_kitchen_sessions" ON kitchen_sessions;
CREATE POLICY "anon_insert_kitchen_sessions" ON kitchen_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_kitchen_sessions" ON kitchen_sessions;
CREATE POLICY "anon_update_kitchen_sessions" ON kitchen_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_kitchen_sessions" ON kitchen_sessions;
CREATE POLICY "anon_delete_kitchen_sessions" ON kitchen_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- APP_SETTINGS (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id int PRIMARY KEY DEFAULT 1,
  current_mode int NOT NULL DEFAULT 1,
  next_order_number int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_app_settings" ON app_settings;
CREATE POLICY "anon_insert_app_settings" ON app_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_app_settings" ON app_settings;
CREATE POLICY "anon_update_app_settings" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: increment_order_number (atomic)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_order_number()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num int;
BEGIN
  UPDATE app_settings
    SET next_order_number = next_order_number + 1, updated_at = now()
    WHERE id = 1
    RETURNING next_order_number - 1 INTO next_num;
  IF next_num IS NULL THEN
    INSERT INTO app_settings (id, current_mode, next_order_number)
      VALUES (1, 1, 2)
      ON CONFLICT (id) DO UPDATE
        SET next_order_number = app_settings.next_order_number + 1, updated_at = now()
      RETURNING next_order_number - 1 INTO next_num;
  END IF;
  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_order_number() TO anon, authenticated;

-- ============================================================
-- RPC: cleanup_stale_claims
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_stale_claims(max_age_seconds int DEFAULT 20)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders
    SET kitchen_claimed_by = NULL,
        kitchen_claimed_session_id = NULL,
        kitchen_claimed_at = NULL,
        updated_at = now()
    WHERE kitchen_claimed_session_id IS NOT NULL
      AND kitchen_claimed_session_id IN (
        SELECT session_id FROM kitchen_sessions
          WHERE last_heartbeat_at < now() - (max_age_seconds || ' seconds')::interval
      );
  DELETE FROM kitchen_sessions
    WHERE last_heartbeat_at < now() - (max_age_seconds || ' seconds')::interval;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_stale_claims(int) TO anon, authenticated;

-- ============================================================
-- SEED: app_settings
-- ============================================================
INSERT INTO app_settings (id, current_mode, next_order_number)
  VALUES (1, 1, 1)
  ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEED: default KLJ menu
-- ============================================================
INSERT INTO products (name, category, price, active, sort_order) VALUES
  ('Pils', 'Bier', 2.00, true, 1),
  ('Speciale Pils', 'Bier', 2.50, true, 2),
  ('Trappist', 'Bier', 3.50, true, 3),
  ('Witte Wijn', 'Wijn', 3.00, true, 1),
  ('Rode Wijn', 'Wijn', 3.00, true, 2),
  ('Cola', 'Fris', 2.00, true, 1),
  ('Cola Zero', 'Fris', 2.00, true, 2),
  ('Sprite', 'Fris', 2.00, true, 3),
  ('Fanta', 'Fris', 2.00, true, 4),
  ('Spa Blauw', 'Fris', 1.80, true, 5),
  ('Spa Rood', 'Fris', 1.80, true, 6),
  ('Tonic', 'Fris', 2.20, true, 7),
  ('Koffie', 'Warme Drank', 2.00, true, 1),
  ('Espresso', 'Warme Drank', 2.00, true, 2),
  ('Cappuccino', 'Warme Drank', 2.50, true, 3),
  ('Warme Chocolade', 'Warme Drank', 2.50, true, 4),
  ('Thee', 'Warme Drank', 1.80, true, 5),
  ('Frikandel', 'Snacks', 2.50, true, 1),
  ('Frikandel Speciaal', 'Snacks', 3.00, true, 2),
  ('Boulette', 'Snacks', 2.50, true, 3),
  ('Croque Monsieur', 'Snacks', 4.00, true, 4),
  ('Croque Hawaii', 'Snacks', 4.50, true, 5),
  ('Kaasblokjes', 'Snacks', 3.50, true, 6),
  ('Salami', 'Snacks', 2.00, true, 7),
  ('Pistolet', 'Snacks', 1.50, true, 8),
  ('IJsje', 'Dessert', 2.00, true, 1),
  ('Pannenkoek', 'Dessert', 3.50, true, 2)
ON CONFLICT DO NOTHING;
