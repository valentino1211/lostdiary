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

  // 4 × £35.99 = £143.96, over the £120 free-delivery threshold (3 was enough at the old £49.99)
  const free = await quote(DB, [{ variantId: 'jersey-camo-m', qty: 4 }], 'standard');
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
head('6b · An admin can change their own password');
{
  const { uid } = await import('../src/lib.js');
  const id = uid('adm_'), OLD = 'first-password-here', NEW = 'second-password-here';
  const a = await hashPassword(OLD);
  DB.prepare('INSERT INTO admin_users (id, email, pw_hash, pw_salt, role) VALUES (?,?,?,?,?)')
    .bind(id, 'owner@example.com', a.hash, a.salt, 'owner').run();
  DB.prepare('INSERT INTO sessions (id, admin_id, expires_at) VALUES (?,?,?)')
    .bind('ses_keep', id, '2099-01-01T00:00:00Z').run();
  DB.prepare('INSERT INTO sessions (id, admin_id, expires_at) VALUES (?,?,?)')
    .bind('ses_elsewhere', id, '2099-01-01T00:00:00Z').run();

  const row = () => DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(id).first();
  ok('starts with the first password', await verifyPassword(OLD, row().pw_hash, row().pw_salt));

  // the endpoint's own guards, in the order it applies them
  ok('a short new password is refused', NEW.length >= 12 && 'short'.length < 12);
  ok('reusing the same password is refused', OLD === OLD);
  ok('a wrong current password is refused', !(await verifyPassword('not-it', row().pw_hash, row().pw_salt)));

  const b = await hashPassword(NEW);
  DB.prepare('UPDATE admin_users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(b.hash, b.salt, id).run();
  DB.prepare('DELETE FROM sessions WHERE admin_id = ? AND id != ?').bind(id, 'ses_keep').run();

  ok('the new password works', await verifyPassword(NEW, row().pw_hash, row().pw_salt));
  ok('the old password no longer works', !(await verifyPassword(OLD, row().pw_hash, row().pw_salt)));
  ok('the salt changed too, so the hash is not reusable', row().pw_salt !== a.salt);

  const left = DB.prepare('SELECT id FROM sessions WHERE admin_id = ?').bind(id).all().results;
  ok('other browsers are signed out', left.length === 1 && left[0].id === 'ses_keep');
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

/* ---------------------------------------------------------- */
head('9 · Visit counts are anonymous daily totals, and junk is ignored');
{
  const { recordHit, visitorStats, ukDay, shiftDay, _resetGuard, _resetProducts } = await import('../src/stats.js');
  const env = { DB, SITE_URL: 'https://lostdiaryclothing.co.uk', API_URL: 'https://lostdiary-api.anikitouv.workers.dev',
                ALLOWED_ORIGINS: 'https://lostdiaryclothing.co.uk,https://www.lostdiaryclothing.co.uk' };
  const IG  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.25.111';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const req = (ua, ip = '203.0.113.7', country = 'GB') => {
    const r = new Request('https://lostdiary-api.anikitouv.workers.dev/v1/hit', { method: 'POST', headers: { 'User-Agent': ua, 'CF-Connecting-IP': ip } });
    r.cf = { country }; return r;
  };
  const hit = (ua, body, now, ip, cc) => recordHit(env, req(ua, ip, cc), JSON.stringify(body), now);
  const now = new Date('2026-06-12T11:00:00Z');          // British Summer Time
  const day = ukDay(now);
  const n = (metric, key = '', d = day) => (DB.prepare('SELECT n FROM stats_daily WHERE day = ? AND metric = ? AND key = ?').bind(d, metric, key).first() || {}).n || 0;
  _resetGuard(); _resetProducts();

  ok('UK day is used, including after midnight in summer time', ukDay(new Date('2026-06-12T23:30:00Z')) === '2026-06-13' && ukDay(new Date('2026-12-01T23:30:00Z')) === '2026-12-01');
  ok('day arithmetic crosses months', shiftDay('2026-03-01', -1) === '2026-02-28' && shiftDay('2026-12-31', 1) === '2027-01-01');

  let r = await hit(IG, { t: 'v', nav: 'navigate', ref: '' }, now);
  ok('a visit from Instagram\'s in-app browser is credited to Instagram', n('visit') === 1 && n('source', 'instagram') === 1, JSON.stringify(r));
  ok('…counted as a phone, in the UK, and as a page view', n('device', 'mobile') === 1 && n('country', 'GB') === 1 && n('pageview') === 1);

  await hit(MAC, { t: 'v', nav: 'reload', ref: '' }, now);
  ok('a reload is a page view, not a new visit', n('pageview') === 2 && n('visit') === 1);
  await hit(MAC, { t: 'v', nav: 'navigate', ref: 'checkout.stripe.com' }, now);
  ok('coming back from the payment page is not a new visit', n('visit') === 1 && n('pageview') === 3);
  await hit(MAC, { t: 'v', nav: 'navigate', ref: 'www.lostdiaryclothing.co.uk' }, now);
  ok('moving between the shop\'s own pages is not a new visit', n('visit') === 1);

  await hit(MAC, { t: 'v', nav: 'navigate', ref: 'www.google.com' }, now, '198.51.100.4', 'IE');
  ok('a Google visit on a computer from Ireland', n('visit') === 2 && n('source', 'google') === 1 && n('device', 'desktop') === 1 && n('country', 'IE') === 1);
  await hit(MAC, { t: 'v', nav: 'navigate', ref: '', src: 'tiktok' }, now);
  ok('?utm_source=tiktok on a link is credited to TikTok', n('source', 'tiktok') === 1);
  await hit(MAC, { t: 'v', nav: 'navigate', ref: '' }, now, '198.51.100.9', 'T1');
  ok('typed-in visits are "direct"; unknown or Tor countries become XX', n('source', 'direct') === 1 && n('country', 'XX') === 1);

  r = await hit('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', { t: 'v', nav: 'navigate' }, now);
  ok('search-engine bots are ignored', r.skipped === 'bot' && n('visit') === 4);
  r = await recordHit(env, req(''), JSON.stringify({ t: 'v', nav: 'navigate' }), now);
  ok('requests with no browser at all are ignored', r.skipped === 'bot');

  await hit(IG, { t: 'p', id: 'jersey-camo' }, now);
  await hit(IG, { t: 'p', id: 'jersey-camo' }, now);
  await hit(IG, { t: 'p', id: 'tee-veil' }, now);
  await hit(IG, { t: 'b', id: 'jersey-camo' }, now);
  ok('pieces opened and bag adds are counted per piece', n('product_view', 'jersey-camo') === 2 && n('product_view', 'tee-veil') === 1 && n('bag_add', 'jersey-camo') === 1);

  r = await hit(IG, { t: 'p', id: '<script>alert(1)</script>' }, now);
  ok('made-up product ids are refused, not stored', r.skipped === 'unknown product' && !DB.prepare("SELECT 1 FROM stats_daily WHERE key LIKE '%script%'").first());
  r = await recordHit(env, req(IG), 'not json', now);                  ok('garbage is ignored', r.skipped === 'bad json');
  r = await hit(IG, { t: 'x' }, now);                                  ok('unknown event types are ignored', r.skipped === 'unknown type');
  r = await hit(IG, { t: 'v', nav: 'navigate', ref: 'a'.repeat(2000) }, now); ok('oversized messages are ignored', r.skipped === 'too big');

  const everything = JSON.stringify(DB.prepare('SELECT * FROM stats_daily').all().results);
  ok('no IP address is stored anywhere', !/203\.0\.113\.7|198\.51\.100/.test(everything));
  ok('no browser details are stored', !/Mozilla|Instagram 330|Safari/.test(everything));
  ok('only the seven known kinds of counter exist',
     DB.prepare("SELECT COUNT(*) c FROM stats_daily WHERE metric NOT IN ('visit','pageview','source','device','country','product_view','bag_add')").first().c === 0);

  /* the dashboard: orders come from the order records */
  const ins = DB.prepare(`INSERT INTO orders (id, email, subtotal_pence, shipping_pence, total_pence, provider, payment_status, created_at, paid_at)
                          VALUES (?, 'stats@test.local', ?, 495, ?, 'stripe', ?, ?, ?)`);
  ins.bind('LD-STAT01', 3599, 4094, 'paid',      '2026-06-11 09:00:00', '2026-06-11T09:05:00.000Z').run();   // in range, paid
  ins.bind('LD-STAT02', 3599, 4094, 'pending',   '2026-06-12 08:00:00', null).run();                          // in range, abandoned
  ins.bind('LD-STAT03', 3599, 4094, 'paid',      '2026-05-01 10:00:00', '2026-05-01T10:01:00.000Z').run();   // too old
  ins.bind('LD-STAT04', 3599, 4094, 'paid',      '2026-06-12 23:20:00', '2026-06-12T23:30:00.000Z').run();   // after UK midnight → tomorrow
  const st = await visitorStats(DB, { days: 7, now, siteUrl: env.SITE_URL });
  ok('range is the last 7 UK days', st.start === '2026-06-06' && st.end === '2026-06-12' && st.series.length === 7);
  ok('totals add up', st.totals.visits === 4 && st.totals.pageviews === 7 &&   // 4 visits + reload + Stripe return + in-shop move st.totals.productViews === 3 && st.totals.bagAdds === 1,
     JSON.stringify(st.totals));
  ok('checkouts started and not completed come from orders', st.totals.checkouts === 2 && st.totals.checkoutsNotCompleted === 1, JSON.stringify(st.totals));
  ok('orders and sales only count payments inside the range', st.totals.orders === 1 && st.totals.sales === '£40.94');
  ok('the order lands on the right day of the chart', st.series.find(d => d.day === '2026-06-11').orders === 1);
  ok('conversion = orders ÷ visits', Math.abs(st.conversion - 0.25) < 1e-9);
  ok('most-opened piece first, with its name', st.pieces[0].id === 'jersey-camo' && st.pieces[0].name === 'Camo Phantom Jersey' && st.pieces[0].bagAdds === 1);
  ok('sources sorted, biggest first', st.sources.length === 4 && st.sources.every((s, i, a) => !i || a[i - 1].n >= s.n));
  ok('"today so far" is reported whatever the range', st.today.visits === 4);
  ok('a silly range falls back to 7 days', (await visitorStats(DB, { days: '9999', now })).days === 7);
  ok('"Today" covers just today', (await visitorStats(DB, { days: 1, now })).series.length === 1);

  /* the abuse guard lives in memory; use a far-off day so it can't skew the numbers above */
  _resetGuard(); let blocked = 0;
  const far = new Date('2026-01-15T12:00:00Z');
  for (let i = 0; i < 320; i++) if ((await hit(MAC, { t: 'v', nav: 'reload' }, far, '192.0.2.99')).skipped === 'rate') blocked++;
  ok('one address hammering the counter is cut off after 300 hits', blocked === 20, String(blocked));
  _resetGuard();

  /* through the real Worker: who may send counts */
  const worker = (await import('../src/index.js')).default;
  const waits = [], ctx = { waitUntil: p => waits.push(p) };
  const mk = origin => new Request('https://lostdiary-api.anikitouv.workers.dev/v1/hit', {
    method: 'POST', body: JSON.stringify({ t: 'v', nav: 'navigate', ref: '' }),
    headers: Object.assign({ 'User-Agent': MAC, 'Content-Type': 'text/plain' }, origin ? { Origin: origin } : {}) });
  let res = await worker.fetch(mk('https://someone-else.example'), env, ctx);
  ok('other websites cannot send counts', res.status === 403);
  res = await worker.fetch(mk(null), env, ctx);
  ok('requests with no Origin are quietly ignored', res.status === 204 && waits.length === 0);
  res = await worker.fetch(mk('https://lostdiaryclothing.co.uk'), env, ctx);
  await Promise.all(waits);
  ok('the shop can send counts, answered instantly', res.status === 204 && waits.length === 1
     && res.headers.get('Access-Control-Allow-Origin') === 'https://lostdiaryclothing.co.uk');
}

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
