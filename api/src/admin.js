/* ============================================================
   Admin — served from the Worker's own origin (never GitHub Pages),
   behind a real login. Cookie is HttpOnly + Secure + SameSite=Lax
   and carries an HMAC signature over an opaque session id.
   ============================================================ */
import { json, bad, uid, money, nowISO, clean, intIn, isEmail, hashPassword, verifyPassword,
         signSession, readSession, cookie, readCookie, rateLimit, clientIP } from './lib.js';
import { settings, estimateFee } from './pricing.js';
import { fullOrder } from './orders.js';
import * as stripe from './stripe.js';
import * as paypal from './paypal.js';
import * as mail from './email.js';
import { dashboardHTML } from './admin-ui.js';

export const CARRIERS = {
  'royal-mail':  { name: 'Royal Mail',  url: 'https://www.royalmail.com/track-your-item#/tracking-results/{n}' },
  'evri':        { name: 'Evri',        url: 'https://www.evri.com/track/parcel/{n}' },
  'dpd':         { name: 'DPD',         url: 'https://track.dpd.co.uk/search?reference={n}' },
  'yodel':       { name: 'Yodel',       url: 'https://www.yodel.co.uk/tracking/{n}' },
  'parcelforce': { name: 'Parcelforce', url: 'https://www.parcelforce.com/track-trace?trackNumber={n}' },
  'ups':         { name: 'UPS',         url: 'https://www.ups.com/track?tracknum={n}' },
  'dhl':         { name: 'DHL',         url: 'https://www.dhl.com/gb-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}' },
  'fedex':       { name: 'FedEx',       url: 'https://www.fedex.com/fedextrack/?trknbr={n}' },
  'other':       { name: 'Courier',     url: '' }
};
export const trackUrl = (c, n) => (CARRIERS[c]?.url || '').replace('{n}', encodeURIComponent(n || ''));

const FULFILMENT = ['pending','processing','supplier_order_required','ordered_from_supplier',
  'supplier_shipped','received','ready_to_ship','shipped','delivered','cancelled'];

/* ---------- session ---------- */
async function currentAdmin(req, env) {
  const raw = readCookie(req, 'ld_admin');
  if (!raw || !env.SESSION_SECRET) return null;
  const sid = await readSession(decodeURIComponent(raw), env.SESSION_SECRET);
  if (!sid) return null;
  const s = await env.DB.prepare(
    `SELECT s.id, s.expires_at, a.id AS admin_id, a.email, a.role
       FROM sessions s JOIN admin_users a ON a.id = s.admin_id WHERE s.id = ?`).bind(sid).first();
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
    return null;
  }
  return s;
}

/* ============================================================ */
export async function adminRoutes(req, env, url, path) {
  const method = req.method;

  if (path === '/admin' && method === 'GET')
    return new Response(dashboardHTML(), { headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:",
      'X-Robots-Tag': 'noindex, nofollow'
    }});

  /* ---- first-run: create the owner account ---- */
  if (path === '/admin/api/bootstrap' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (!env.ADMIN_SETUP_TOKEN || clean(b.token, 200) !== env.ADMIN_SETUP_TOKEN)
      return bad(401, 'Bad setup token.');
    const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
    if (existing.n > 0) return bad(409, 'An admin account already exists.');
    const email = clean(b.email, 254).toLowerCase();
    const pw = String(b.password || '');
    if (!isEmail(email)) return bad(400, 'Valid email required.');
    if (pw.length < 12)  return bad(400, 'Use a password of at least 12 characters.');
    const { hash, salt } = await hashPassword(pw);
    await env.DB.prepare(
      'INSERT INTO admin_users (id, email, pw_hash, pw_salt, role) VALUES (?,?,?,?,?)'
    ).bind(uid('adm_'), email, hash, salt, 'owner').run();
    return json(201, { ok: true });
  }

  /* ---- login ---- */
  if (path === '/admin/api/login' && method === 'POST') {
    const rl = await rateLimit(env.DB, `login:${clientIP(req)}`, 8, 900);
    if (!rl.ok) return bad(429, 'Too many attempts. Wait 15 minutes.');
    const b = await req.json().catch(() => ({}));
    const email = clean(b.email, 254).toLowerCase();
    const a = await env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first();
    // constant-ish work either way so a missing account is not detectable by timing
    const ok = a ? await verifyPassword(String(b.password || ''), a.pw_hash, a.pw_salt)
                 : await verifyPassword('x', 'y'.repeat(88), 'AAAAAAAAAAAAAAAAAAAAAA==').catch(() => false);
    if (!a || !ok) return bad(401, 'Email or password is wrong.');

    const sid = uid('ses_');
    const exp = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (id, admin_id, expires_at) VALUES (?,?,?)')
      .bind(sid, a.id, exp).run();
    await env.DB.prepare('UPDATE admin_users SET last_login = ? WHERE id = ?').bind(nowISO(), a.id).run();
    const signed = await signSession(sid, env.SESSION_SECRET);
    return new Response(JSON.stringify({ ok: true, email: a.email }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie('ld_admin', encodeURIComponent(signed)) }
    });
  }

  /* ---- everything below needs a session ---- */
  const me = await currentAdmin(req, env);

  if (path === '/admin/api/me')
    return me ? json(200, { email: me.email, role: me.role }) : bad(401, 'Not signed in.');

  if (path === '/admin/api/logout' && method === 'POST') {
    if (me) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(me.id).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie('ld_admin', '', { clear: true }) } });
  }

  if (!me) return bad(401, 'Not signed in.');

  const seg = path.split('/').filter(Boolean);            // ['admin','api', ...]
  const r2 = seg[2], r3 = seg[3], r4 = seg[4];

  /* ---------- overview ---------- */
  if (r2 === 'overview') {
    const s = await settings(env.DB);
    const q = async sql => (await env.DB.prepare(sql).first()) || {};
    const paid = await q(`SELECT COUNT(*) n, COALESCE(SUM(total_pence),0) gross,
        COALESCE(SUM(fee_pence),0) fees, COALESCE(SUM(net_pence),0) net
        FROM orders WHERE payment_status IN ('paid','partially_refunded')`);
    const pre = await q(`SELECT COUNT(*) n, COALESCE(SUM(total_pence),0) gross
        FROM orders WHERE is_preorder = 1 AND payment_status = 'paid'`);
    const refunded = await q(`SELECT COALESCE(SUM(amount_pence),0) v FROM refunds WHERE status = 'succeeded'`);
    const cost = await q(`SELECT COALESCE(SUM(oi.qty * p.supplier_cost_pence),0) v
        FROM order_items oi JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id WHERE o.payment_status = 'paid'`);
    const counts = await env.DB.prepare(
      `SELECT fulfilment_status f, COUNT(*) n FROM orders WHERE payment_status = 'paid' GROUP BY f`).all();
    const byStage = Object.fromEntries(counts.results.map(r => [r.f, r.n]));
    const margin = paid.net - refunded.v - cost.v;
    return json(200, {
      orders: paid.n, preorders: pre.n,
      grossPence: paid.gross, feesPence: paid.fees, netPence: paid.net,
      refundedPence: refunded.v, supplierCostPence: cost.v, grossMarginPence: margin,
      money: {
        gross: money(paid.gross), fees: money(paid.fees), net: money(paid.net),
        refunded: money(refunded.v), supplierCost: money(cost.v), margin: money(margin),
        preorderGross: money(pre.gross)
      },
      stages: {
        awaitingSupplierOrder: byStage.supplier_order_required || 0,
        orderedFromSupplier:   byStage.ordered_from_supplier || 0,
        received:              byStage.received || 0,
        readyToShip:           byStage.ready_to_ship || 0,
        shipped:               byStage.shipped || 0,
        delivered:             byStage.delivered || 0
      },
      settlementNote: 'Gross is what customers paid. Net is after provider fees. Neither is necessarily '
        + 'available to withdraw yet — Stripe and PayPal hold funds on their own payout schedules.'
    });
  }

  /* ---------- orders ---------- */
  if (r2 === 'orders' && !r3 && method === 'GET') {
    const status = clean(url.searchParams.get('status'), 40);
    const pre    = url.searchParams.get('preorder');
    const qs     = clean(url.searchParams.get('q'), 80);
    const limit  = intIn(url.searchParams.get('limit'), 1, 200) || 50;
    const offset = intIn(url.searchParams.get('offset'), 0, 100000) || 0;
    const where = [], binds = [];
    if (status) { where.push('payment_status = ?'); binds.push(status); }
    if (pre === '1') where.push('is_preorder = 1');
    if (qs) { where.push('(id LIKE ? OR email LIKE ? OR name LIKE ?)'); binds.push(`%${qs}%`, `%${qs}%`, `%${qs}%`); }
    const sql = `SELECT id, email, name, total_pence, payment_status, fulfilment_status, is_preorder,
        provider, created_at, tracking_number FROM orders
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rows = await env.DB.prepare(sql).bind(...binds, limit, offset).all();
    return json(200, { orders: rows.results.map(o => ({ ...o, total: money(o.total_pence) })) });
  }

  if (r2 === 'orders' && r3 && !r4 && method === 'GET') {
    const o = await fullOrder(env.DB, r3.toUpperCase());
    if (!o) return bad(404, 'Order not found.');
    return json(200, { order: { ...o, total: money(o.total_pence), fee: money(o.fee_pence),
      net: money(o.net_pence), items: o.items.map(i => ({ ...i, line: money(i.line_total_pence) })) },
      fulfilmentOptions: FULFILMENT, carriers: CARRIERS });
  }

  if (r2 === 'orders' && r3 && !r4 && method === 'PATCH') {
    const oid = r3.toUpperCase();
    const b = await req.json().catch(() => ({}));
    const o = await fullOrder(env.DB, oid);
    if (!o) return bad(404, 'Order not found.');

    const next = clean(b.fulfilment_status, 40);
    if (next && !FULFILMENT.includes(next)) return bad(400, 'Unknown fulfilment status.');
    const carrier = clean(b.tracking_carrier, 40);
    const number  = clean(b.tracking_number, 80);
    if (carrier && !CARRIERS[carrier]) return bad(400, 'Unknown carrier.');

    const sets = [], binds = [];
    if (next)    { sets.push('fulfilment_status = ?'); binds.push(next); }
    if (carrier) { sets.push('tracking_carrier = ?');  binds.push(carrier); }
    if (number)  { sets.push('tracking_number = ?');   binds.push(number); }
    if (b.notes !== undefined) { sets.push('notes = ?'); binds.push(clean(b.notes, 2000)); }
    if (next === 'shipped')   { sets.push('shipped_at = ?');   binds.push(nowISO()); }
    if (next === 'delivered') { sets.push('delivered_at = ?'); binds.push(nowISO()); }
    if (!sets.length) return bad(400, 'Nothing to change.');
    sets.push('updated_at = ?'); binds.push(nowISO());
    await env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, oid).run();

    const updated = await fullOrder(env.DB, oid);
    if (b.notify !== false && next && next !== o.fulfilment_status) {
      const eta = updated.items.find(i => i.is_preorder)?.eta;
      if (next === 'ordered_from_supplier') await mail.supplierPlaced(env, updated, eta);
      if (next === 'received')              await mail.stockReceived(env, updated);
      if (next === 'shipped')               await mail.dispatched(env, updated, updated.items,
                                                CARRIERS[updated.tracking_carrier]?.name,
                                                trackUrl(updated.tracking_carrier, updated.tracking_number));
      if (next === 'delivered')             await mail.delivered(env, updated);
    }
    return json(200, { ok: true, order: oid, status: next || o.fulfilment_status });
  }

  /* ---------- refunds: real, through the provider ---------- */
  if (r2 === 'orders' && r3 && r4 === 'refund' && method === 'POST') {
    const oid = r3.toUpperCase();
    const b = await req.json().catch(() => ({}));
    const o = await fullOrder(env.DB, oid);
    if (!o) return bad(404, 'Order not found.');
    if (o.payment_status !== 'paid' && o.payment_status !== 'partially_refunded')
      return bad(409, 'This order is not in a refundable state.');
    if (!o.provider_payment_id) return bad(409, 'No payment id recorded against this order.');

    const already = o.refunds.filter(r => r.status === 'succeeded').reduce((n, r) => n + r.amount_pence, 0);
    const amount = intIn(b.amountPence, 1, o.total_pence - already);
    if (amount === null) return bad(400, `Refund must be between 1p and ${money(o.total_pence - already)}.`);

    const rid = uid('ref_');
    await env.DB.prepare(
      'INSERT INTO refunds (id, order_id, amount_pence, reason, provider, status) VALUES (?,?,?,?,?,?)'
    ).bind(rid, oid, amount, clean(b.reason, 200), o.provider, 'pending').run();

    try {
      const out = o.provider === 'stripe'
        ? await stripe.refund(env, { paymentId: o.provider_payment_id, amountPence: amount,
                                     reason: clean(b.reason, 40), key: rid })
        : await paypal.refund(env, { captureId: o.provider_payment_id, amountPence: amount,
                                     currency: o.currency, note: clean(b.reason, 200), key: rid });
      const good = ['succeeded','COMPLETED','PENDING','pending'].includes(out.status);
      await env.DB.prepare('UPDATE refunds SET status = ?, provider_refund_id = ? WHERE id = ?')
        .bind(good ? 'succeeded' : 'failed', out.id || null, rid).run();
      if (good) {
        const total = already + amount;
        await env.DB.prepare(
          `UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?`
        ).bind(total >= o.total_pence ? 'refunded' : 'partially_refunded', nowISO(), oid).run();
        await mail.refunded(env, o, amount);
      }
      return json(200, { ok: good, refund: rid, providerStatus: out.status, amount: money(amount) });
    } catch (e) {
      await env.DB.prepare("UPDATE refunds SET status = 'failed' WHERE id = ?").bind(rid).run();
      return bad(502, 'The payment provider refused the refund: ' + e.message);
    }
  }

  /* ---------- supplier order summary: what to buy, aggregated ---------- */
  if (r2 === 'supplier' && !r3 && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT oi.product_id, oi.name, oi.colour, oi.size, SUM(oi.qty) qty,
              SUM(oi.line_total_pence) paid, p.supplier_cost_pence cost, oi.supplier_status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE o.payment_status = 'paid' AND oi.supplier_status = 'required'
        GROUP BY oi.product_id, oi.colour, oi.size
        ORDER BY oi.name, oi.colour,
          CASE oi.size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
                       WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 ELSE 7 END`).all();
    const groups = new Map();
    for (const r of rows.results) {
      const key = r.product_id + '|' + r.colour;
      if (!groups.has(key)) groups.set(key, {
        productId: r.product_id, name: r.name, colour: r.colour,
        sizes: [], totalQty: 0, customerPaidPence: 0, supplierCostPence: 0 });
      const g = groups.get(key);
      g.sizes.push({ size: r.size, qty: r.qty });
      g.totalQty += r.qty;
      g.customerPaidPence += r.paid;
      g.supplierCostPence += r.qty * (r.cost || 0);
    }
    const list = [...groups.values()].map(g => ({ ...g,
      customerPaid: money(g.customerPaidPence), supplierCost: money(g.supplierCostPence),
      marginPence: g.customerPaidPence - g.supplierCostPence,
      margin: money(g.customerPaidPence - g.supplierCostPence) }));
    return json(200, { groups: list,
      totalUnits: list.reduce((n, g) => n + g.totalQty, 0),
      totalPaid: money(list.reduce((n, g) => n + g.customerPaidPence, 0)) });
  }

  /* mark a group as ordered from the supplier and link the customer lines to it */
  if (r2 === 'supplier' && r3 === 'place' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const pid = clean(b.productId, 64), colour = clean(b.colour, 60);
    if (!pid) return bad(400, 'productId required.');
    const sid = uid('sup_');
    await env.DB.prepare(
      'INSERT INTO supplier_orders (id, reference, status, cost_pence, notes, placed_at) VALUES (?,?,?,?,?,?)'
    ).bind(sid, clean(b.reference, 80), 'placed', intIn(b.costPence, 0, 1e9) || 0, clean(b.notes, 1000), nowISO()).run();
    const upd = await env.DB.prepare(
      `UPDATE order_items SET supplier_status = 'ordered', supplier_order_id = ?
        WHERE supplier_status = 'required' AND product_id = ? AND colour = ?
          AND order_id IN (SELECT id FROM orders WHERE payment_status = 'paid')`
    ).bind(sid, pid, colour).run();
    await env.DB.prepare(
      `UPDATE orders SET fulfilment_status = 'ordered_from_supplier', updated_at = ?
        WHERE payment_status = 'paid' AND fulfilment_status = 'supplier_order_required'
          AND id IN (SELECT order_id FROM order_items WHERE supplier_order_id = ?)`
    ).bind(nowISO(), sid).run();
    return json(200, { ok: true, supplierOrder: sid, linesUpdated: upd.meta?.changes ?? 0 });
  }

  /* ---------- products ---------- */
  if (r2 === 'products' && !r3 && method === 'GET') {
    const p = await env.DB.prepare('SELECT * FROM products ORDER BY rowid').all();
    const v = await env.DB.prepare('SELECT * FROM variants ORDER BY product_id, size').all();
    return json(200, { products: p.results.map(x => ({ ...x, images: JSON.parse(x.images || '[]'),
      variants: v.results.filter(y => y.product_id === x.id) })) });
  }

  if (r2 === 'products' && method === 'POST' && !r3) {
    const b = await req.json().catch(() => ({}));
    const id   = clean(b.id, 64) || uid('prd_');
    const name = clean(b.name, 160);
    const slug = (clean(b.slug, 80) || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const price = intIn(b.pricePence, 0, 10_000_00);
    if (!name || price === null) return bad(400, 'Name and pricePence are required.');
    const type = ['in_stock','preorder','sold_out'].includes(b.type) ? b.type : 'in_stock';
    await env.DB.prepare(
      `INSERT INTO products (id, slug, sku, name, description, category, price_pence, images, type, active,
          preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order,
          supplier_cost_pence, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, sku=excluded.sku, name=excluded.name,
          description=excluded.description, category=excluded.category, price_pence=excluded.price_pence,
          images=excluded.images, type=excluded.type, active=excluded.active,
          preorder_opens_at=excluded.preorder_opens_at, preorder_closes_at=excluded.preorder_closes_at,
          preorder_eta=excluded.preorder_eta, preorder_max=excluded.preorder_max,
          preorder_max_per_order=excluded.preorder_max_per_order,
          supplier_cost_pence=excluded.supplier_cost_pence, updated_at=excluded.updated_at`
    ).bind(id, slug, clean(b.sku, 60), name, clean(b.description, 4000), clean(b.category, 60) || 'Other',
           price, JSON.stringify(Array.isArray(b.images) ? b.images.slice(0, 8) : []), type,
           b.active === false ? 0 : 1, clean(b.preorderOpensAt, 40) || null, clean(b.preorderClosesAt, 40) || null,
           clean(b.preorderEta, 120) || null, b.preorderMax == null ? null : intIn(b.preorderMax, 0, 100000),
           intIn(b.preorderMaxPerOrder, 1, 50) || 5, intIn(b.supplierCostPence, 0, 1e7) || 0, nowISO()).run();

    if (Array.isArray(b.variants)) {
      for (const v of b.variants) {
        const size = clean(v.size, 20), colour = clean(v.colour, 60);
        if (!size) continue;
        await env.DB.prepare(
          `INSERT INTO variants (id, product_id, size, colour, sku, stock, preorder_cap, active)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(product_id, size, colour) DO UPDATE SET sku=excluded.sku,
              stock=excluded.stock, preorder_cap=excluded.preorder_cap, active=excluded.active`
        ).bind(clean(v.id, 64) || uid('var_'), id, size, colour, clean(v.sku, 60) || null,
               intIn(v.stock, 0, 100000) ?? 0, v.preorderCap == null ? null : intIn(v.preorderCap, 0, 100000),
               v.active === false ? 0 : 1).run();
      }
    }
    return json(200, { ok: true, id, slug });
  }

  if (r2 === 'variants' && r3 && method === 'PATCH') {
    const b = await req.json().catch(() => ({}));
    const stock = intIn(b.stock, 0, 100000);
    if (stock === null) return bad(400, 'stock must be 0 or more.');
    const res = await env.DB.prepare('UPDATE variants SET stock = ? WHERE id = ?').bind(stock, r3).run();
    return res.meta?.changes ? json(200, { ok: true }) : bad(404, 'Variant not found.');
  }

  /* ---------- settings ---------- */
  if (r2 === 'settings' && method === 'GET') return json(200, { settings: await settings(env.DB) });
  if (r2 === 'settings' && method === 'PATCH') {
    const b = await req.json().catch(() => ({}));
    const allowed = ['shipping_standard','shipping_express','free_shipping_over','ship_to','dispatch_days',
      'stripe_fee_percent','stripe_fee_fixed_pence','paypal_fee_percent','paypal_fee_fixed_pence',
      'returns_policy','preorder_terms','currency'];
    let n = 0;
    for (const [k, v] of Object.entries(b)) {
      if (!allowed.includes(k)) continue;
      await env.DB.prepare(
        'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      ).bind(k, String(v).slice(0, 4000)).run();
      n++;
    }
    return json(200, { ok: true, updated: n });
  }

  return bad(404, 'Unknown admin route.');
}
