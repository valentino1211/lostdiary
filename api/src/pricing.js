/* ============================================================
   THE SECURITY CORE.

   The browser sends only: variant id + quantity + shipping method.
   Never a price, never a name, never a total. Everything monetary
   is read from the database here, server-side, on every request.
   ============================================================ */

import { intIn } from './lib.js';

export async function settings(db) {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of rows.results) s[r.key] = r.value;
  return s;
}

export function shippingOptions(s) {
  return {
    standard: JSON.parse(s.shipping_standard || '{"label":"Standard","pence":0,"eta":""}'),
    express:  JSON.parse(s.shipping_express  || '{"label":"Express","pence":0,"eta":""}')
  };
}

/* Is this product buyable right now, and as what? */
export function saleState(p, now = new Date()) {
  if (!p.active) return { sellable: false, reason: 'This piece is not available.' };
  if (p.type === 'sold_out')    return { sellable: false, reason: 'This piece is sold out.' };
  if (p.type === 'coming_soon') return { sellable: false, reason: 'Not released yet.' };
  if (p.type === 'in_stock') return { sellable: true, preorder: false };

  // pre-order: the window must be open
  const opens  = p.preorder_opens_at  ? new Date(p.preorder_opens_at)  : null;
  const closes = p.preorder_closes_at ? new Date(p.preorder_closes_at) : null;
  if (opens && now < opens)  return { sellable: false, reason: 'Pre-orders have not opened yet.' };
  if (closes && now > closes) return { sellable: false, reason: 'Pre-orders for this piece have closed.' };
  return { sellable: true, preorder: true };
}

/* Remaining pre-order headroom for a variant. */
export function preorderRemaining(product, variant) {
  const cap = variant.preorder_cap ?? product.preorder_max ?? null;
  if (cap === null) return Infinity;
  return Math.max(0, cap - variant.preorder_taken);
}

/* ------------------------------------------------------------
   Build an authoritative quote. Returns { ok, lines, totals } or
   { ok:false, error } — and never trusts a single client number.
   ------------------------------------------------------------ */
export async function quote(db, cart, shippingMethod) {
  if (!Array.isArray(cart) || cart.length === 0)  return { ok: false, error: 'Your bag is empty.' };
  if (cart.length > 20)                            return { ok: false, error: 'Too many lines in one order.' };

  const s   = await settings(db);
  const now = new Date();
  const ship = shippingOptions(s);
  const method = shippingMethod === 'express' ? 'express' : 'standard';

  // Collapse duplicates so nobody can split one variant across several lines to
  // dodge a cap. Over the limit is refused outright — never silently reduced,
  // because a customer must never be charged for a quantity they did not choose.
  const MAX_PER_VARIANT = 10;
  const wanted = new Map();
  for (const raw of cart) {
    const vid = typeof raw?.variantId === 'string' ? raw.variantId.slice(0, 64) : null;
    const qty = intIn(raw?.qty, 1, MAX_PER_VARIANT);
    if (!vid || qty === null) return { ok: false, error: 'That bag could not be read.' };
    const total = (wanted.get(vid) || 0) + qty;
    if (total > MAX_PER_VARIANT)
      return { ok: false, error: `Maximum ${MAX_PER_VARIANT} of any one size per order.` };
    wanted.set(vid, total);
  }

  const ids = [...wanted.keys()];
  const rows = await db.prepare(
    `SELECT v.id AS vid, v.size, v.colour, v.sku, v.stock, v.preorder_taken, v.preorder_cap,
            v.active AS v_active, p.id AS pid, p.name, p.slug, p.price_pence, p.type, p.active AS p_active,
            p.preorder_opens_at, p.preorder_closes_at, p.preorder_eta, p.preorder_max,
            p.preorder_max_per_order, p.supplier_cost_pence
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all();

  const byId = new Map(rows.results.map(r => [r.vid, r]));
  const lines = [];
  let subtotal = 0, anyPreorder = false;

  for (const [vid, qty] of wanted) {
    const r = byId.get(vid);
    if (!r) return { ok: false, error: 'One of those items no longer exists.' };
    if (!r.v_active) return { ok: false, error: `${r.name} — that size is unavailable.` };

    const state = saleState({ active: r.p_active, type: r.type,
      preorder_opens_at: r.preorder_opens_at, preorder_closes_at: r.preorder_closes_at }, now);
    if (!state.sellable) return { ok: false, error: `${r.name} — ${state.reason}` };

    if (state.preorder) {
      const perOrder = r.preorder_max_per_order || 5;
      if (qty > perOrder) return { ok: false, error: `${r.name} — maximum ${perOrder} per order on pre-order.` };
      const left = preorderRemaining(
        { preorder_max: r.preorder_max }, { preorder_cap: r.preorder_cap, preorder_taken: r.preorder_taken });
      if (qty > left) return { ok: false, error: left === 0
        ? `${r.name} — the pre-order allocation for size ${r.size} is full.`
        : `${r.name} — only ${left} left in the pre-order allocation for size ${r.size}.` };
      anyPreorder = true;
    } else {
      if (qty > r.stock) return { ok: false, error: r.stock === 0
        ? `${r.name} — size ${r.size} has sold out.`
        : `${r.name} — only ${r.stock} left in size ${r.size}.` };
    }

    const unit = r.price_pence;                       // <- from the database, always
    lines.push({
      variantId: r.vid, productId: r.pid, name: r.name, slug: r.slug,
      size: r.size, colour: r.colour, sku: r.sku,
      unitPence: unit, qty, linePence: unit * qty,
      isPreorder: !!state.preorder, eta: r.preorder_eta || null,
      supplierCostPence: r.supplier_cost_pence
    });
    subtotal += unit * qty;
  }

  const freeOver     = Number.parseInt(s.free_shipping_over || '0', 10);
  const shippingPence = (freeOver && subtotal >= freeOver) ? 0 : (ship[method].pence || 0);

  return {
    ok: true,
    lines,
    isPreorder: anyPreorder,
    shipTo: JSON.parse(s.ship_to || '["GB"]'),
    totals: {
      currency: s.currency || 'GBP',
      subtotalPence: subtotal,
      shippingPence,
      totalPence: subtotal + shippingPence,
      shippingMethod: method,
      shippingLabel: shippingPence === 0 ? 'Free delivery' : ship[method].label,
      shippingEta: ship[method].eta
    }
  };
}

/* ------------------------------------------------------------
   Reserve inventory. Conditional UPDATEs mean two shoppers can
   never both take the last unit: the second one changes 0 rows.
   D1 has no BEGIN/COMMIT, so anything already applied is undone
   explicitly if a later line fails.
   ------------------------------------------------------------ */
export async function reserve(db, lines) {
  const applied = [];
  for (const l of lines) {
    const stmt = l.isPreorder
      ? db.prepare(`UPDATE variants SET preorder_taken = preorder_taken + ?1
                     WHERE id = ?2 AND (
                       COALESCE(preorder_cap,
                         (SELECT preorder_max FROM products WHERE id = variants.product_id)) IS NULL
                       OR preorder_taken + ?1 <= COALESCE(preorder_cap,
                         (SELECT preorder_max FROM products WHERE id = variants.product_id)))`)
          .bind(l.qty, l.variantId)
      : db.prepare('UPDATE variants SET stock = stock - ?1 WHERE id = ?2 AND stock >= ?1')
          .bind(l.qty, l.variantId);

    const res = await stmt.run();
    if (!res.meta || res.meta.changes !== 1) {
      await release(db, applied);                      // undo what we took
      return { ok: false, error: `${l.name} — size ${l.size} just went while you were checking out.` };
    }
    applied.push(l);
  }
  return { ok: true };
}

export async function release(db, lines) {
  for (const l of lines) {
    await (l.isPreorder
      ? db.prepare('UPDATE variants SET preorder_taken = MAX(0, preorder_taken - ?) WHERE id = ?')
      : db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?')
    ).bind(l.qty, l.variantId).run();
  }
}

/* provider fees, from settings — used for the admin margin view only.
   These never touch what the customer is charged. */
export function estimateFee(s, provider, totalPence) {
  const pct   = Number.parseFloat(s[`${provider}_fee_percent`] || '0');
  const fixed = Number.parseInt(s[`${provider}_fee_fixed_pence`] || '0', 10);
  return Math.round(totalPence * pct / 100) + fixed;
}
