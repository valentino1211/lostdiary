/* ============================================================
   Order lifecycle. Nothing here trusts the browser: an order only
   becomes 'paid' from a signature-verified webhook or a
   server-to-server confirmation with the payment provider.
   ============================================================ */

import { orderId, uid, nowISO } from './lib.js';
import { estimateFee, release, settings } from './pricing.js';

/* Create the pending order + its item snapshot. Stock is already reserved. */
export async function createPending(db, { id, provider, sessionId, quote, customer }) {
  const oid = id || orderId();
  const t = quote.totals;
  await db.prepare(
    `INSERT INTO orders (id, email, name, phone, currency, subtotal_pence, shipping_pence,
        total_pence, shipping_method, provider, provider_session_id, payment_status,
        fulfilment_status, is_preorder, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', 'pending', ?, ?, ?)`
  ).bind(oid, customer.email, customer.name || null, customer.phone || null, t.currency,
         t.subtotalPence, t.shippingPence, t.totalPence, t.shippingMethod,
         provider, sessionId || null, quote.isPreorder ? 1 : 0, nowISO(), nowISO()).run();

  for (const l of quote.lines) {
    await db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, variant_id, name, size, colour, sku,
          unit_price_pence, qty, line_total_pence, is_preorder, supplier_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(uid('itm_'), oid, l.productId, l.variantId, l.name, l.size, l.colour, l.sku,
           l.unitPence, l.qty, l.linePence, l.isPreorder ? 1 : 0,
           l.isPreorder ? 'required' : 'not_required').run();
  }
  return oid;
}

/* Attach shipping details once the provider gives them to us. */
export async function setShipping(db, oid, sh) {
  if (!sh) return;
  await db.prepare(
    `UPDATE orders SET name = COALESCE(?,name), phone = COALESCE(?,phone),
        ship_line1 = ?, ship_line2 = ?, ship_city = ?, ship_postcode = ?, ship_country = ?,
        updated_at = ? WHERE id = ?`
  ).bind(sh.name || null, sh.phone || null, sh.line1 || null, sh.line2 || null,
         sh.city || null, sh.postcode || null, sh.country || null, nowISO(), oid).run();
}

/* ---------- the only path to 'paid' ---------- */
export async function markPaid(db, oid, { paymentId, feePence, netPence }) {
  const s = await settings(db);
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(oid).first();
  if (!o) return { ok: false, error: 'unknown order' };
  if (o.payment_status === 'paid') return { ok: true, already: true, order: o };  // idempotent

  const fee = feePence ?? estimateFee(s, o.provider, o.total_pence);
  const net = netPence ?? (o.total_pence - fee);

  const res = await db.prepare(
    `UPDATE orders SET payment_status = 'paid', provider_payment_id = ?, paid_at = ?,
        fee_pence = ?, net_pence = ?, updated_at = ?,
        fulfilment_status = CASE WHEN is_preorder = 1 THEN 'supplier_order_required' ELSE 'processing' END
      WHERE id = ? AND payment_status IN ('pending','failed')`
  ).bind(paymentId || null, nowISO(), fee, net, nowISO(), oid).run();

  if (!res.meta || res.meta.changes !== 1) {
    const again = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(oid).first();
    return { ok: again?.payment_status === 'paid', already: true, order: again };
  }
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(oid).first();
  return { ok: true, order };
}

/* Failed / cancelled / expired: give the inventory back, exactly once. */
export async function markUnpaid(db, oid, status = 'cancelled') {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(oid).first();
  if (!o || o.payment_status === 'paid' || o.payment_status === 'refunded') return { ok: false };
  const res = await db.prepare(
    `UPDATE orders SET payment_status = ?, fulfilment_status = 'cancelled',
        stock_released = 1, updated_at = ? WHERE id = ? AND stock_released = 0`
  ).bind(status, nowISO(), oid).run();
  if (res.meta?.changes === 1) await release(db, await itemsFor(db, oid));
  return { ok: true };
}

export async function itemsFor(db, oid) {
  const r = await db.prepare(
    `SELECT variant_id AS variantId, qty, is_preorder AS isPreorder, name, size
       FROM order_items WHERE order_id = ?`).bind(oid).all();
  return r.results.map(x => ({ ...x, isPreorder: !!x.isPreorder }));
}

export async function fullOrder(db, oid) {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(oid).first();
  if (!o) return null;
  const items   = (await db.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(oid).all()).results;
  const refunds = (await db.prepare('SELECT * FROM refunds WHERE order_id = ?').bind(oid).all()).results;
  return { ...o, items, refunds };
}

/* ---------- idempotency: has this exact provider event been handled? ---------- */
export async function firstSeen(db, provider, eventId, type, oid) {
  if (!eventId) return true;                    // no id to dedupe on: process, handlers are idempotent anyway
  try {
    await db.prepare(
      'INSERT INTO webhook_events (id, provider, type, order_id) VALUES (?,?,?,?)'
    ).bind(`${provider}:${eventId}`, provider, type || '', oid || null).run();
    return true;
  } catch {
    return false;                               // primary-key clash = replay, ignore it
  }
}

/* Sweep abandoned checkouts so reserved stock does not leak.
   Wired to a Cloudflare Cron Trigger (see wrangler.toml). */
export async function sweepStale(db, minutes = 45) {
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
  const stale = await db.prepare(
    `SELECT id FROM orders WHERE payment_status = 'pending' AND stock_released = 0 AND created_at < ?`
  ).bind(cutoff).all();
  for (const row of stale.results) await markUnpaid(db, row.id, 'cancelled');
  return stale.results.length;
}
