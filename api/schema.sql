-- ============================================================
-- LOST DIARY — production schema (Cloudflare D1 / SQLite)
-- Apply with:  npx wrangler d1 execute lostdiary --remote --file=./schema.sql
-- ============================================================
PRAGMA foreign_keys = ON;

-- ---------- catalogue ----------
CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  sku                 TEXT,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT 'Other',
  price_pence         INTEGER NOT NULL CHECK (price_pence >= 0),
  images              TEXT NOT NULL DEFAULT '[]',        -- JSON array of URLs
  type                TEXT NOT NULL DEFAULT 'in_stock'
                        CHECK (type IN ('in_stock','preorder','coming_soon','sold_out')),
  active              INTEGER NOT NULL DEFAULT 1,
  -- pre-order window. Dates are ISO-8601 (UTC).
  preorder_opens_at   TEXT,
  preorder_closes_at  TEXT,
  preorder_eta        TEXT,                              -- free text, e.g. "1–10 October"
  preorder_max        INTEGER,                           -- total cap across all variants, NULL = uncapped
  preorder_max_per_order INTEGER NOT NULL DEFAULT 5,
  supplier_cost_pence INTEGER NOT NULL DEFAULT 0,        -- internal only, never shown to customers
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, type);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS variants (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size            TEXT NOT NULL,
  colour          TEXT NOT NULL DEFAULT '',
  sku             TEXT UNIQUE,
  stock           INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  preorder_taken  INTEGER NOT NULL DEFAULT 0 CHECK (preorder_taken >= 0),
  preorder_cap    INTEGER,                               -- per-variant cap, NULL = use product cap
  active          INTEGER NOT NULL DEFAULT 1,
  UNIQUE (product_id, size, colour)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id, active);

-- ---------- people ----------
CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  phone      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- orders ----------
CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,                  -- LD-XXXXXX, shown to customers
  customer_id         TEXT REFERENCES customers(id),
  email               TEXT NOT NULL,
  name                TEXT,
  phone               TEXT,
  ship_line1          TEXT, ship_line2 TEXT, ship_city TEXT,
  ship_postcode       TEXT, ship_country TEXT,
  currency            TEXT NOT NULL DEFAULT 'GBP',
  subtotal_pence      INTEGER NOT NULL,
  shipping_pence      INTEGER NOT NULL,
  total_pence         INTEGER NOT NULL,
  shipping_method     TEXT NOT NULL DEFAULT 'standard',
  provider            TEXT NOT NULL CHECK (provider IN ('stripe','paypal')),
  provider_session_id TEXT,                              -- Stripe session / PayPal order id
  provider_payment_id TEXT,                              -- charge / capture id
  payment_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending','paid','failed','cancelled','refunded','partially_refunded')),
  fulfilment_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (fulfilment_status IN ('pending','processing','supplier_order_required',
                               'ordered_from_supplier','supplier_shipped','received','ready_to_ship',
                               'shipped','delivered','cancelled')),
  is_preorder         INTEGER NOT NULL DEFAULT 0,
  fee_pence           INTEGER NOT NULL DEFAULT 0,        -- provider fee, as reported by the provider
  net_pence           INTEGER NOT NULL DEFAULT 0,
  stock_released      INTEGER NOT NULL DEFAULT 0,       -- makes stock restoration idempotent
  tracking_carrier    TEXT, tracking_number TEXT,
  shipped_at          TEXT, delivered_at TEXT, paid_at TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_fulfil  ON orders(fulfilment_status);
CREATE INDEX IF NOT EXISTS idx_orders_email   ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(provider_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_pre     ON orders(is_preorder, payment_status);

CREATE TABLE IF NOT EXISTS order_items (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        TEXT NOT NULL,
  variant_id        TEXT NOT NULL,
  name              TEXT NOT NULL,                       -- snapshot at time of purchase
  size              TEXT NOT NULL,
  colour            TEXT NOT NULL DEFAULT '',
  sku               TEXT,
  unit_price_pence  INTEGER NOT NULL,                    -- snapshot: price paid, not current price
  qty               INTEGER NOT NULL CHECK (qty > 0),
  line_total_pence  INTEGER NOT NULL,
  is_preorder       INTEGER NOT NULL DEFAULT 0,
  supplier_order_id TEXT REFERENCES supplier_orders(id),
  supplier_status   TEXT NOT NULL DEFAULT 'not_required'
                      CHECK (supplier_status IN ('not_required','required','ordered','shipped','received'))
);
CREATE INDEX IF NOT EXISTS idx_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_supplier ON order_items(supplier_status, product_id, colour, size);
CREATE INDEX IF NOT EXISTS idx_items_variant  ON order_items(variant_id);

-- ---------- supplier ----------
CREATE TABLE IF NOT EXISTS supplier_orders (
  id         TEXT PRIMARY KEY,
  reference  TEXT,
  status     TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','placed','shipped','received','cancelled')),
  cost_pence INTEGER NOT NULL DEFAULT 0,
  notes      TEXT,
  placed_at  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- money out ----------
CREATE TABLE IF NOT EXISTS refunds (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id),
  amount_pence       INTEGER NOT NULL CHECK (amount_pence > 0),
  reason             TEXT,
  provider           TEXT NOT NULL,
  provider_refund_id TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','succeeded','failed')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);

-- ---------- idempotency: every webhook we have already handled ----------
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,                          -- provider's own event id
  provider    TEXT NOT NULL,
  type        TEXT NOT NULL,
  order_id    TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- admin ----------
CREATE TABLE IF NOT EXISTS admin_users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  pw_hash    TEXT NOT NULL,
  pw_salt    TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id);

-- rate limiting for login + lookup endpoints
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket   TEXT PRIMARY KEY,
  hits     INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);

-- ---------- configuration (no hard-coded shipping or fees) ----------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('currency',              'GBP'),
  ('shipping_standard',     '{"label":"UK Standard Delivery","pence":495,"eta":"2–5 working days"}'),
  ('shipping_express',      '{"label":"UK Express Delivery","pence":995,"eta":"1–2 working days"}'),
  ('free_shipping_over',    '12000'),
  ('ship_to',               '["GB","IE"]'),
  ('dispatch_days',         'three working days'),
  ('stripe_fee_percent',    '1.5'),
  ('stripe_fee_fixed_pence','20'),
  ('paypal_fee_percent',    '2.9'),
  ('paypal_fee_fixed_pence','30'),
  ('returns_policy',        'Configure your returns policy in the admin settings tab.'),
  ('preorder_terms',        'Configure your pre-order terms in the admin settings tab.');
