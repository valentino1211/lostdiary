/* ============================================================
   Security + lifecycle tests against the real modules.
   Payment providers are stubbed; everything else is genuine code.
   ============================================================ */
import { makeDB } from './d1.js';
import { quote, reserve, release, settings } from '../src/pricing.js';
import { createPending, markPaid, markUnpaid, firstSeen, sweepStale, fullOrder } from '../src/orders.js';
import { hashPassword, verifyPassword, signSession, readSession, rateLimit } from '../src/lib.js';

const DB = makeDB(new URL('../schema.sql', import.meta.url).pathname,
                  new URL('../seed.sql', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; console.log('  \x1b[31m✗ ' + name + '\x1b[0m ' + extra); }
};
const head = t => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* Fixtures. The live catalogue changes as the brand releases pieces, so the
   tests set up their own known-good stock rather than depending on it. */
DB.prepare("UPDATE products SET type = 'in_stock' WHERE id = 'tee-chain'").run();
[['s',12],['m',18],['l',18],['xl',10],['xxl',6]].forEach(([sz, n]) =>
  DB.prepare('UPDATE variants SET stock = ? WHERE id = ?').bind(n, 'tee-chain-' + sz).run());
[['s',8],['m',12],['l',12],['xl',8],['xxl',4]].forEach(([sz, n]) =>
  DB.prepare('UPDATE variants SET stock = ? WHERE id = ?').bind(n, 'jersey-camo-' + sz).run());
const stock = id => DB.prepare('SELECT stock, preorder_taken FROM variants WHERE id = ?').bind(id).first();

/* ---------------------------------------------------------- */
head('1 · Pricing comes from the database, never the client');
{
  const q = await quote(DB, [{ variantId: 'tee-chain-m', qty: 2 }], 'standard');
  ok('legitimate quote priced from DB', q.ok && q.lines[0].unitPence === 3999, JSON.stringify(q.error || ''));
  ok('subtotal computed server-side', q.totals.subtotalPence === 7998);
  ok('shipping added from settings', q.totals.shippingPence === 495);
  ok('total is subtotal + shipping', q.totals.totalPence === 8493);

  const tampered = await quote(DB, [{ variantId: 'tee-chain-m', qty: 1, price: 1, unitPence: 1, name: 'Free tee' }], 'standard');
  ok('injected price of 1p is ignored', tampered.ok && tampered.lines[0].unitPence === 3999);
  ok('injected name is ignored', tampered.lines[0].name === 'Tethered Tee');

  const big = await quote(DB, [{ variantId: 'tee-chain-m', qty: 999 }], 'standard');
  ok('quantity above stock refused', !big.ok, big.ok ? 'ACCEPTED' : '');
  const neg = await quote(DB, [{ variantId: 'tee-chain-m', qty: -5 }], 'standard');
  ok('negative quantity refused', !neg.ok);
  const zero = await quote(DB, [{ variantId: 'tee-chain-m', qty: 0 }], 'standard');
  ok('zero quantity refused', !zero.ok);
  const ghost = await quote(DB, [{ variantId: 'does-not-exist', qty: 1 }], 'standard');
  ok('unknown variant id refused', !ghost.ok);
  const soon = await quote(DB, [{ variantId: 'tee-veil-m', qty: 1 }], 'standard');
  ok('unreleased product refused', !soon.ok, soon.ok ? 'ACCEPTED' : '');
  const empty = await quote(DB, [], 'standard');
  ok('empty bag refused', !empty.ok);

  const split = await quote(DB, [{ variantId: 'tee-chain-s', qty: 8 }, { variantId: 'tee-chain-s', qty: 8 }], 'standard');
  ok('duplicate lines collapsed before the stock check', !split.ok, split.ok ? 'ACCEPTED 16 of 12' : '');

  const free = await quote(DB, [{ variantId: 'jersey-camo-m', qty: 3 }], 'standard');
  ok('free shipping over the threshold', free.ok && free.totals.shippingPence === 0);
  const exp = await quote(DB, [{ variantId: 'tee-chain-m', qty: 1 }], 'express');
  ok('express shipping priced from settings', exp.totals.shippingPence === 995);
  const bogusMethod = await quote(DB, [{ variantId: 'tee-chain-m', qty: 1 }], "'; DROP TABLE orders;--");
  ok('unknown shipping method falls back to standard', bogusMethod.totals.shippingPence === 495);
}

/* ---------------------------------------------------------- */
head('2 · Stock is decremented safely, including under a race');
{
  const before = stock('tee-chain-xxl').stock;         // 6
  const q = await quote(DB, [{ variantId: 'tee-chain-xxl', qty: 2 }], 'standard');
  await reserve(DB, q.lines);
  ok(`reserve took 2 (${before} → ${stock('tee-chain-xxl').stock})`, stock('tee-chain-xxl').stock === before - 2);

  // drain to exactly one unit left, then have two shoppers race for it
  DB.prepare('UPDATE variants SET stock = 1 WHERE id = ?').bind('tee-chain-xxl').run();
  const a = await quote(DB, [{ variantId: 'tee-chain-xxl', qty: 1 }], 'standard');
  const b = await quote(DB, [{ variantId: 'tee-chain-xxl', qty: 1 }], 'standard');
  ok('both shoppers see it as available', a.ok && b.ok);
  const [ra, rb] = [await reserve(DB, a.lines), await reserve(DB, b.lines)];
  ok('exactly one reservation wins', (ra.ok ? 1 : 0) + (rb.ok ? 1 : 0) === 1, `${ra.ok} / ${rb.ok}`);
  ok('stock never goes negative', stock('tee-chain-xxl').stock === 0);

  // a multi-line order where the second line fails must not silently take the first
  DB.prepare('UPDATE variants SET stock = 5 WHERE id = ?').bind('tee-chain-s').run();
  DB.prepare('UPDATE variants SET stock = 0 WHERE id = ?').bind('tee-chain-l').run();
  const sBefore = stock('tee-chain-s').stock;
  const partial = await reserve(DB, [
    { variantId: 'tee-chain-s', qty: 1, isPreorder: false, name: 'Tethered Tee', size: 'S' },
    { variantId: 'tee-chain-l', qty: 1, isPreorder: false, name: 'Tethered Tee', size: 'L' }
  ]);
  ok('partial reservation refused', !partial.ok);
  ok('first line rolled back', stock('tee-chain-s').stock === sBefore, 'leaked stock');
  DB.prepare('UPDATE variants SET stock = 18 WHERE id = ?').bind('tee-chain-l').run();
}

/* ---------------------------------------------------------- */
head('3 · Pre-orders use an allocation, not physical stock');
{
  // The shipped catalogue has nothing on pre-order, so the test creates its own
  // fixture. This is exactly what the admin "Products" form does.
  DB.prepare(`UPDATE products SET type = 'preorder', preorder_opens_at = '2020-01-01T00:00:00Z',
      preorder_closes_at = '2099-01-01T00:00:00Z', preorder_eta = '1–10 October',
      preorder_max = 100, preorder_max_per_order = 3 WHERE id = 'set-cobalt'`).run();
  DB.prepare("UPDATE variants SET preorder_cap = 40, preorder_taken = 0 WHERE product_id = 'set-cobalt'").run();

  const q = await quote(DB, [{ variantId: 'set-cobalt-m', qty: 1 }], 'standard');
  ok('pre-order is sellable with zero stock', q.ok, q.error || '');
  ok('marked as a pre-order line', q.ok && q.lines[0].isPreorder === true);
  ok('pre-order ETA carried through', q.ok && q.lines[0].eta === '1–10 October');

  const tooMany = await quote(DB, [{ variantId: 'set-cobalt-m', qty: 4 }], 'standard');
  ok('per-order pre-order cap enforced (max 3)', !tooMany.ok, tooMany.ok ? 'ACCEPTED 4' : '');

  await reserve(DB, q.lines);
  ok('allocation counter moves, physical stock does not',
     stock('set-cobalt-m').preorder_taken === 1 && stock('set-cobalt-m').stock === 0);

  DB.prepare('UPDATE variants SET preorder_taken = 40 WHERE id = ?').bind('set-cobalt-l').run();
  const full = await quote(DB, [{ variantId: 'set-cobalt-l', qty: 1 }], 'standard');
  ok('refused once the allocation is full', !full.ok, full.ok ? 'ACCEPTED' : '');

  DB.prepare("UPDATE products SET preorder_closes_at = '2020-01-01T00:00:00Z' WHERE id = 'set-cobalt'").run();
  const closed = await quote(DB, [{ variantId: 'set-cobalt-m', qty: 1 }], 'standard');
  ok('refused after the pre-order window closes', !closed.ok, closed.ok ? 'ACCEPTED' : '');
  DB.prepare("UPDATE products SET preorder_opens_at = '2099-01-01T00:00:00Z', preorder_closes_at = '2099-02-01T00:00:00Z' WHERE id = 'set-cobalt'").run();
  const early = await quote(DB, [{ variantId: 'set-cobalt-m', qty: 1 }], 'standard');
  ok('refused before the window opens', !early.ok);
  DB.prepare("UPDATE products SET preorder_opens_at = '2020-01-01T00:00:00Z', preorder_closes_at = '2099-01-01T00:00:00Z' WHERE id = 'set-cobalt'").run();
}

/* ---------------------------------------------------------- */
head('4 · An order only becomes paid through a verified event');
{
  const q = await quote(DB, [{ variantId: 'tee-chain-m', qty: 1 }, { variantId: 'set-cobalt-m', qty: 1 }], 'standard');
  await reserve(DB, q.lines);
  const oid = await createPending(DB, { provider: 'stripe', sessionId: 'cs_test_1', quote: q,
    customer: { email: 'buyer@example.com', name: 'A Buyer' } });
  const o0 = await fullOrder(DB, oid);
  ok('order starts pending', o0.payment_status === 'pending');
  ok('flagged as a pre-order because one line is', o0.is_preorder === 1);
  ok('line prices snapshotted', o0.items.find(i => i.name === 'Tethered Tee').unit_price_pence === 3999);

  const r1 = await markPaid(DB, oid, { paymentId: 'ch_1', feePence: 150, netPence: o0.total_pence - 150 });
  ok('first confirmation pays the order', r1.ok && !r1.already);
  const o1 = await fullOrder(DB, oid);
  ok('pre-order routed to “supplier order required”', o1.fulfilment_status === 'supplier_order_required');
  ok('fee and net recorded', o1.fee_pence === 150 && o1.net_pence === o1.total_pence - 150);

  const r2 = await markPaid(DB, oid, { paymentId: 'ch_1' });
  ok('replayed confirmation is a no-op', r2.ok && r2.already === true);
  const o2 = await fullOrder(DB, oid);
  ok('total unchanged after replay', o2.total_pence === o1.total_pence);

  ok('first webhook id accepted', await firstSeen(DB, 'stripe', 'evt_1', 'checkout.session.completed', oid) === true);
  ok('same webhook id rejected as a replay', await firstSeen(DB, 'stripe', 'evt_1', 'checkout.session.completed', oid) === false);
  ok('same id from another provider is separate', await firstSeen(DB, 'paypal', 'evt_1', 'x', oid) === true);

  await markUnpaid(DB, oid, 'cancelled');
  ok('a paid order cannot be cancelled back into stock', (await fullOrder(DB, oid)).payment_status === 'paid');
}

/* ---------------------------------------------------------- */
head('5 · Abandoned checkouts give their stock back, once');
{
  const before = stock('jersey-camo-l').stock;
  const q = await quote(DB, [{ variantId: 'jersey-camo-l', qty: 2 }], 'standard');
  await reserve(DB, q.lines);
  const oid = await createPending(DB, { provider: 'stripe', sessionId: 'cs_abandoned', quote: q,
    customer: { email: 'gone@example.com' } });
  ok('stock held during checkout', stock('jersey-camo-l').stock === before - 2);

  DB.prepare("UPDATE orders SET created_at = '2020-01-01T00:00:00Z' WHERE id = ?").bind(oid).run();
  const n = await sweepStale(DB, 45);
  ok('sweep found the abandoned checkout', n >= 1);
  ok('stock returned', stock('jersey-camo-l').stock === before);
  await sweepStale(DB, 45);
  ok('second sweep does not double-refund stock', stock('jersey-camo-l').stock === before);
  ok('order marked cancelled', (await fullOrder(DB, oid)).payment_status === 'cancelled');
}

/* ---------------------------------------------------------- */
head('6 · Admin credentials and sessions');
{
  const { hash, salt } = await hashPassword('a-long-enough-password');
  ok('correct password verifies', await verifyPassword('a-long-enough-password', hash, salt));
  ok('wrong password rejected', !(await verifyPassword('a-long-enough-passworD', hash, salt)));
  ok('hash is salted, not raw', !hash.includes('a-long-enough-password'));

  const secret = 'test-session-secret';
  const signed = await signSession('ses_abc', secret);
  ok('valid cookie resolves to its session id', await readSession(signed, secret) === 'ses_abc');
  ok('tampered session id rejected', await readSession('ses_evil.' + signed.split('.')[1], secret) === null);
  ok('cookie signed with another secret rejected', await readSession(signed, 'other-secret') === null);

  let blocked = false;
  for (let i = 0; i < 10; i++) { const r = await rateLimit(DB, 'login:1.2.3.4', 8, 900); if (!r.ok) blocked = true; }
  ok('login rate limit trips after 8 attempts', blocked);
}

/* ---------------------------------------------------------- */
head('7 · Supplier summary aggregates paid pre-orders');
{
  // isolate this section from earlier pre-orders in the run
  DB.prepare("DELETE FROM order_items WHERE product_id = 'set-cobalt'").run();
  DB.prepare("UPDATE variants SET preorder_taken = 0 WHERE product_id = 'set-cobalt'").run();
  const buy = async (size, qty, email) => {
    const q = await quote(DB, [{ variantId: 'set-cobalt-' + size, qty }], 'standard');
    if (!q.ok) throw new Error(q.error);
    await reserve(DB, q.lines);
    const oid = await createPending(DB, { provider: 'paypal', sessionId: 'pp_' + email, quote: q, customer: { email } });
    await markPaid(DB, oid, { paymentId: 'cap_' + email });
    return oid;
  };
  await buy('s', 2, 'a@x.com'); await buy('m', 3, 'b@x.com');
  await buy('m', 1, 'c@x.com'); await buy('l', 2, 'd@x.com');

  const rows = DB.prepare(
    `SELECT oi.name, oi.colour, oi.size, SUM(oi.qty) qty, SUM(oi.line_total_pence) paid
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'paid' AND oi.supplier_status = 'required'
      GROUP BY oi.product_id, oi.colour, oi.size ORDER BY oi.size`).all().results;
  const cobalt = rows.filter(r => r.name === 'Hybrid');
  const total = cobalt.reduce((n, r) => n + r.qty, 0);
  const paidSum = cobalt.reduce((n, r) => n + r.paid, 0);
  ok('sizes aggregated across customers (2+3+1+2)', total === 8, 'got ' + total);
  ok('M merged from two customers', cobalt.find(r => r.size === 'M')?.qty === 4);
  ok('customer money totalled', paidSum === 8 * 12000, 'got ' + paidSum);
  ok('individual orders still linked', DB.prepare(
    `SELECT COUNT(DISTINCT order_id) n FROM order_items WHERE product_id = 'set-cobalt'`).first().n >= 4);
}

/* ---------------------------------------------------------- */
head('8 · No secrets anywhere in the storefront');
{
  const fs = await import('node:fs');
  const files = ['../../index.html', '../../track.html', '../../admin.html'];
  const patterns = [/sk_live_/, /sk_test_/, /whsec_/, /rk_live_/, /PAYPAL_SECRET/, /SESSION_SECRET/,
                    /ADMIN_SETUP_TOKEN/, /RESEND_API_KEY/, /-----BEGIN/];
  let found = [];
  for (const f of files) {
    const p = new URL(f, import.meta.url).pathname;
    if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, 'utf8');
    for (const re of patterns) if (re.test(t)) found.push(`${f} → ${re}`);
  }
  ok('no secret patterns in public files', found.length === 0, found.join(', '));
}

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
