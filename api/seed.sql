-- Seed data. Safe to re-run: every row upserts by id.
PRAGMA foreign_keys = ON;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('tee-chain', 'tee-chain', 'LD-TEE-CHAIN', 'Tethered Tee', 'Washed until the black went grey at the seams. The script runs into a broken chain, drawn once and left exactly as it fell.', 'T-Shirts', 3999,
  '["img/tee-chain.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 1400)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-chain-s', 'tee-chain', 'S', 'Acid Black', 'LD-TEE-CHAIN-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-chain-m', 'tee-chain', 'M', 'Acid Black', 'LD-TEE-CHAIN-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-chain-l', 'tee-chain', 'L', 'Acid Black', 'LD-TEE-CHAIN-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-chain-xl', 'tee-chain', 'XL', 'Acid Black', 'LD-TEE-CHAIN-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-chain-xxl', 'tee-chain', 'XXL', 'Acid Black', 'LD-TEE-CHAIN-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('jersey-camo', 'jersey-camo', 'LD-JERSEY-CAMO', 'Camo Phantom Jersey', 'A football shirt for a club that does not exist. Camo through the sleeve and flank, block type at the chest, numbered on neither side.', 'Jerseys', 4999,
  '["img/jersey-camo.png"]', 'in_stock', 1, NULL, NULL, NULL, NULL, 3, 1900)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('jersey-camo-s', 'jersey-camo', 'S', 'Black / Camo', 'LD-JERSEY-CAMO-S', 8, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('jersey-camo-m', 'jersey-camo', 'M', 'Black / Camo', 'LD-JERSEY-CAMO-M', 12, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('jersey-camo-l', 'jersey-camo', 'L', 'Black / Camo', 'LD-JERSEY-CAMO-L', 12, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('jersey-camo-xl', 'jersey-camo', 'XL', 'Black / Camo', 'LD-JERSEY-CAMO-XL', 8, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('jersey-camo-xxl', 'jersey-camo', 'XXL', 'Black / Camo', 'LD-JERSEY-CAMO-XXL', 4, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('set-cobalt', 'set-cobalt', 'LD-SET-COBALT', 'Hybrid', 'The only saturated colour in the archive. Hood and trouser bleached in the same run, so the blue clouds differently on every set.', 'Tracksuits', 12000,
  '["img/set-cobalt.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 4800)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-cobalt-s', 'set-cobalt', 'S', 'Cobalt', 'LD-SET-COBALT-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-cobalt-m', 'set-cobalt', 'M', 'Cobalt', 'LD-SET-COBALT-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-cobalt-l', 'set-cobalt', 'L', 'Cobalt', 'LD-SET-COBALT-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-cobalt-xl', 'set-cobalt', 'XL', 'Cobalt', 'LD-SET-COBALT-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-cobalt-xxl', 'set-cobalt', 'XXL', 'Cobalt', 'LD-SET-COBALT-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('tee-veil', 'tee-veil', 'LD-TEE-VEIL', 'Veil', 'A face wrapped and made anonymous, printed at the scale of a poster. The band reads I AM MORE THAN THEY SEE.', 'T-Shirts', 3999,
  '["img/tee-veil.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 1400)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-veil-s', 'tee-veil', 'S', 'Washed White', 'LD-TEE-VEIL-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-veil-m', 'tee-veil', 'M', 'Washed White', 'LD-TEE-VEIL-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-veil-l', 'tee-veil', 'L', 'Washed White', 'LD-TEE-VEIL-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-veil-xl', 'tee-veil', 'XL', 'Washed White', 'LD-TEE-VEIL-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-veil-xxl', 'tee-veil', 'XXL', 'Washed White', 'LD-TEE-VEIL-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('raglan-dove', 'raglan-dove', 'LD-RAGLAN-DOVE', 'True Story', 'A dove caught mid-turn, drawn in pencil and enlarged until the grain shows. Walnut sleeves against a bleached body.', 'Long Sleeves', 5499,
  '["img/raglan-dove.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 2100)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('raglan-dove-s', 'raglan-dove', 'S', 'Bleached White / Walnut', 'LD-RAGLAN-DOVE-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('raglan-dove-m', 'raglan-dove', 'M', 'Bleached White / Walnut', 'LD-RAGLAN-DOVE-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('raglan-dove-l', 'raglan-dove', 'L', 'Bleached White / Walnut', 'LD-RAGLAN-DOVE-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('raglan-dove-xl', 'raglan-dove', 'XL', 'Bleached White / Walnut', 'LD-RAGLAN-DOVE-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('raglan-dove-xxl', 'raglan-dove', 'XXL', 'Bleached White / Walnut', 'LD-RAGLAN-DOVE-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('ls-leopard', 'ls-leopard', 'LD-LS-LEOPARD', 'Forgotten Roses Longsleeve', 'Rose leopard, tonal on tonal, with the script laid across the back at full width. The pattern only reads up close.', 'Long Sleeves', 5499,
  '["img/ls-leopard.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 2100)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('ls-leopard-s', 'ls-leopard', 'S', 'Rose', 'LD-LS-LEOPARD-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('ls-leopard-m', 'ls-leopard', 'M', 'Rose', 'LD-LS-LEOPARD-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('ls-leopard-l', 'ls-leopard', 'L', 'Rose', 'LD-LS-LEOPARD-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('ls-leopard-xl', 'ls-leopard', 'XL', 'Rose', 'LD-LS-LEOPARD-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('ls-leopard-xxl', 'ls-leopard', 'XXL', 'Rose', 'LD-LS-LEOPARD-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('tee-greatest', 'tee-greatest', 'LD-TEE-GREATEST', 'Tha Greatest', 'Six repetitions stacked and printed low, so the last line runs off the hem. Faded before it left the studio.', 'T-Shirts', 3999,
  '["img/tee-greatest.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 1400)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-greatest-s', 'tee-greatest', 'S', 'Sun Orange', 'LD-TEE-GREATEST-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-greatest-m', 'tee-greatest', 'M', 'Sun Orange', 'LD-TEE-GREATEST-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-greatest-l', 'tee-greatest', 'L', 'Sun Orange', 'LD-TEE-GREATEST-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-greatest-xl', 'tee-greatest', 'XL', 'Sun Orange', 'LD-TEE-GREATEST-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('tee-greatest-xxl', 'tee-greatest', 'XXL', 'Sun Orange', 'LD-TEE-GREATEST-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('set-bone', 'set-bone', 'LD-SET-BONE', 'The Tracksuit', 'Bone fleece, hood and trouser, catalogued together and never split. The monogram sits high on the thigh in gloss black.', 'Tracksuits', 12000,
  '["img/set-bone.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 4800)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-bone-s', 'set-bone', 'S', 'Bone', 'LD-SET-BONE-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-bone-m', 'set-bone', 'M', 'Bone', 'LD-SET-BONE-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-bone-l', 'set-bone', 'L', 'Bone', 'LD-SET-BONE-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-bone-xl', 'set-bone', 'XL', 'Bone', 'LD-SET-BONE-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('set-bone-xxl', 'set-bone', 'XXL', 'Bone', 'LD-SET-BONE-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;

INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
  preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order, supplier_cost_pence)
VALUES ('shorts-leopard', 'shorts-leopard', 'LD-SHORTS-LEOPARD', 'Forgotten Roses Shorts', 'Split down the middle. Grey marl on one leg, rose leopard on the other. Made as a pair with the long sleeve and sold apart.', 'Shorts', 4499,
  '["img/shorts-leopard.png"]', 'coming_soon', 1, NULL, NULL, NULL, NULL, 3, 1700)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category,
  price_pence=excluded.price_pence, images=excluded.images, type=excluded.type,
  preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
  preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
  supplier_cost_pence=excluded.supplier_cost_pence, updated_at=datetime('now');
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('shorts-leopard-s', 'shorts-leopard', 'S', 'Grey Marl / Rose', 'LD-SHORTS-LEOPARD-S', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('shorts-leopard-m', 'shorts-leopard', 'M', 'Grey Marl / Rose', 'LD-SHORTS-LEOPARD-M', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('shorts-leopard-l', 'shorts-leopard', 'L', 'Grey Marl / Rose', 'LD-SHORTS-LEOPARD-L', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('shorts-leopard-xl', 'shorts-leopard', 'XL', 'Grey Marl / Rose', 'LD-SHORTS-LEOPARD-XL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
VALUES ('shorts-leopard-xxl', 'shorts-leopard', 'XXL', 'Grey Marl / Rose', 'LD-SHORTS-LEOPARD-XXL', 0, NULL, 1)
ON CONFLICT(product_id, size, colour) DO UPDATE SET stock=excluded.stock, preorder_cap=excluded.preorder_cap;
