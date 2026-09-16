/* ============================================================
   LOST DIARY — API (Cloudflare Worker)

   Public storefront lives on GitHub Pages and only ever talks to
   these endpoints. No secret ever reaches the browser.
   ============================================================ */
import { json, bad, allowedOrigin, corsHeaders, isEmail, clean, intIn, timingSafeEqual,
         rateLimit, clientIP, uid, money } from './lib.js';
import { quote, reserve, settings, shippingOptions, preorderRemaining, saleState } from './pricing.js';
import { createPending, markPaid, markUnpaid, setShipping, fullOrder, itemsFor,
         firstSeen, sweepStale } from './orders.js';
import * as stripe from './stripe.js';
import * as paypal from './paypal.js';
import * as mail from './email.js';
import { adminRoutes } from './admin.js';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = allowedOrigin(req, env);

    if (origin === false) return bad(403, 'Origin not allowed', null);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    try {
      // ---- admin (own auth, own CORS rules) ----
      if (path === '/admin' || path.startsWith('/admin/')) return adminRoutes(req, env, url, path);

      // ---- webhooks: no CORS, signature-verified ----
      if (path === '/v1/webhooks/stripe') return stripeWebhook(req, env, ctx);
      if (path === '/v1/webhooks/paypal') return paypalWebhook(req, env, ctx);

      // ---- public storefront API ----
      if (path === '/v1/products' && req.method === 'GET')  return listProducts(env, origin);
      if (path === '/v1/quote'    && req.method === 'POST') return getQuote(req, env, origin);
      if (path === '/v1/checkout/stripe' && req.method === 'POST') return checkoutStripe(req, env, origin, ctx);
      if (path === '/v1/checkout/paypal' && req.method === 'POST') return checkoutPaypal(req, env, origin);
      if (path === '/v1/checkout/paypal/capture' && req.method === 'POST') return capturePaypal(req, env, origin, ctx);
      if (path === '/v1/order/confirm' && req.method === 'GET')  return confirmOrder(req, env, url, origin);
      if (path === '/v1/order/status'  && req.method === 'POST') return orderStatus(req, env, origin);
      if (path === '/v1/config' && req.method === 'GET') return publicConfig(env, origin);
      if (path === '/health') return json(200, { ok: true, ts: new Date().toISOString() }, origin);

      return bad(404, 'Not found', origin);
    } catch (err) {
      console.error(path, err?.stack || err);
      return bad(500, 'Something went wrong at our end.', origin);
    }
  },

  /* Cloudflare Cron Trigger — returns stock from abandoned checkouts. */
  async scheduled(event, env) {
    const n = await sweepStale(env.DB, 45);
    if (n) console.log(`released stock from ${n} abandoned checkout(s)`);
  }
};

/* ============================================================
   CATALOGUE
   ============================================================ */
async function listProducts(env, origin) {
  const s = await settings(env.DB);
  const prods = await env.DB.prepare(
    `SELECT id, slug, sku, name, description, category, price_pence, images, type,
            preorder_opens_at, preorder_closes_at, preorder_eta, preorder_max, preorder_max_per_order
       FROM products WHERE active = 1 ORDER BY rowid`).all();
  const vars = await env.DB.prepare(
    `SELECT v.id, v.product_id, v.size, v.colour, v.sku, v.stock, v.preorder_taken, v.preorder_cap
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.active = 1 AND p.active = 1`).all();

  const byProduct = new Map();
  for (const v of vars.results) {
    if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
    byProduct.get(v.product_id).push(v);
  }
  const now = new Date();

  const products = prods.results.map(p => {
    const state = saleState({ ...p, active: 1 }, now);
    const variants = (byProduct.get(p.id) || []).map(v => {
      const pre = p.type === 'preorder';
      const left = pre ? preorderRemaining(p, v) : v.stock;
      return {
        id: v.id, size: v.size, colour: v.colour, sku: v.sku,
        available: state.sellable && left > 0,
        remaining: left === Infinity ? null : left        // null = uncapped
      };
    });
    return {
      id: p.id, slug: p.slug, sku: p.sku, name: p.name, description: p.description,
      category: p.category, pricePence: p.price_pence, price: money(p.price_pence),
      images: JSON.parse(p.images || '[]'),
      type: p.type,
      status: p.type === 'coming_soon' ? 'COMING SOON'
            : p.type === 'sold_out' || !variants.some(v => v.available) ? 'SOLD OUT'
            : p.type === 'preorder' ? 'PRE-ORDER' : 'IN STOCK',
      sellable: state.sellable && variants.some(v => v.available),
      reason: state.reason || null,
      preorder: p.type === 'preorder' ? {
        opensAt: p.preorder_opens_at, closesAt: p.preorder_closes_at,
        eta: p.preorder_eta, maxPerOrder: p.preorder_max_per_order
      } : null,
      variants
    };
  });

  const ship = shippingOptions(s);
  return json(200, {
    currency: s.currency, products,
    shipping: { standard: ship.standard, express: ship.express,
                freeOver: Number.parseInt(s.free_shipping_over || '0', 10) },
    dispatchDays: s.dispatch_days,
    policies: { returns: s.returns_policy, preorder: s.preorder_terms }
  }, origin, 60);        // 60s browser / 5min edge — prices are re-read from the DB at checkout regardless
}

async function publicConfig(env, origin) {
  const s = await settings(env.DB);
  const ship = shippingOptions(s);
  return json(200, {
    currency: s.currency,
    paypalClientId: env.PAYPAL_CLIENT_ID || null,   // publishable by design
    paypalEnv: env.PAYPAL_ENV || 'sandbox',
    shipping: { standard: ship.standard, express: ship.express,
                freeOver: Number.parseInt(s.free_shipping_over || '0', 10) },
    shipTo: JSON.parse(s.ship_to || '["GB"]')
  }, origin, 300);
}

/* ============================================================
   QUOTE — the cart calls this; it is the only source of totals
   ============================================================ */
async function readCart(req) {
  const b = await req.json().catch(() => null);
  if (!b) return { error: 'Bad request body.' };
  return { cart: b.cart, method: b.shippingMethod, customer: b.customer || {} };
}

async function getQuote(req, env, origin) {
  const { cart, method, error } = await readCart(req);
  if (error) return bad(400, error, origin);
  const q = await quote(env.DB, cart, method);
  if (!q.ok) return bad(409, q.error, origin);
  return json(200, {
    lines: q.lines.map(({ supplierCostPence, ...pub }) => pub),   // never leak cost price
    totals: q.totals, isPreorder: q.isPreorder
  }, origin);
}

/* ============================================================
   CHECKOUT — reserve stock, then hand off to the provider
   ============================================================ */
async function beginCheckout(req, env, origin, provider) {
  const rl = await rateLimit(env.DB, `co:${clientIP(req)}`, 20, 300);
  if (!rl.ok) return bad(429, 'Too many attempts. Try again shortly.', origin);

  const { cart, method, customer, error } = await readCart(req);
  if (error) return bad(400, error, origin);

  const email = clean(customer.email, 254).toLowerCase();
  if (email && !isEmail(email)) return bad(400, 'That email address does not look right.', origin);

  const q = await quote(env.DB, cart, method);
  if (!q.ok) return bad(409, q.error, origin);

  const res = await reserve(env.DB, q.lines);            // race-safe conditional UPDATEs
  if (!res.ok) return bad(409, res.error, origin);

  const oid = await createPending(env.DB, {
    provider, quote: q,
    customer: { email: email || 'pending@unknown', name: clean(customer.name, 120), phone: clean(customer.phone, 40) }
  });
  return { oid, q, email };
}

async function checkoutStripe(req, env, origin, ctx) {
  if (!env.STRIPE_SECRET_KEY) return bad(503, 'Card payment is not configured yet.', origin);
  const begun = await beginCheckout(req, env, origin, 'stripe');
  if (begun instanceof Response) return begun;
  const { oid, q, email } = begun;
  try {
    const s = await stripe.createCheckoutSession(env, {
      orderId: oid, quote: q, email,
      successUrl: `${env.SITE_URL}/order.html`, cancelUrl: `${env.SITE_URL}/`
    });
    await env.DB.prepare('UPDATE orders SET provider_session_id = ? WHERE id = ?').bind(s.id, oid).run();
    return json(200, { order: oid, url: s.url }, origin);
  } catch (e) {
    ctx.waitUntil(markUnpaid(env.DB, oid, 'failed'));    // never hold stock for a checkout that never opened
    console.error('stripe session', e);
    return bad(502, 'Could not open the payment page. Nothing has been charged.', origin);
  }
}

async function checkoutPaypal(req, env, origin) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) return bad(503, 'PayPal is not configured yet.', origin);
  const begun = await beginCheckout(req, env, origin, 'paypal');
  if (begun instanceof Response) return begun;
  const { oid, q } = begun;
  try {
    const p = await paypal.createOrder(env, {
      orderId: oid, quote: q,
      returnUrl: `${env.SITE_URL}/order.html?order=${oid}&provider=paypal`,
      cancelUrl: `${env.SITE_URL}/?cancelled=1`
    });
    await env.DB.prepare('UPDATE orders SET provider_session_id = ? WHERE id = ?').bind(p.id, oid).run();
    return json(200, { order: oid, paypalOrderId: p.id }, origin);
  } catch (e) {
    await markUnpaid(env.DB, oid, 'failed');
    console.error('paypal create', e);
    return bad(502, 'Could not start the PayPal payment. Nothing has been charged.', origin);
  }
}

/* onApprove from the PayPal button: capture server-side, then mark paid. */
async function capturePaypal(req, env, origin, ctx) {
  const b = await req.json().catch(() => null);
  const ppId = clean(b?.paypalOrderId, 64);
  const oid  = clean(b?.order, 32);
  if (!ppId || !oid) return bad(400, 'Missing order reference.', origin);

  const o = await env.DB.prepare(
    'SELECT * FROM orders WHERE id = ? AND provider = ? AND provider_session_id = ?'
  ).bind(oid, 'paypal', ppId).first();
  if (!o) return bad(404, 'Order not found.', origin);
  if (o.payment_status === 'paid') return json(200, { order: oid, status: 'paid' }, origin);

  let cap;
  try { cap = await paypal.captureOrder(env, ppId, oid); }
  catch (e) { console.error('paypal capture', e); return bad(402, 'PayPal could not take the payment.', origin); }

  if (cap.status !== 'COMPLETED') return bad(402, `PayPal returned ${cap.status}.`, origin);
  if (cap.reference !== oid)      return bad(409, 'Payment reference mismatch.', origin);
  if (cap.grossPence !== o.total_pence) {                 // last line of defence on amount
    console.error('amount mismatch', oid, cap.grossPence, o.total_pence);
    return bad(409, 'Payment amount did not match the order.', origin);
  }

  await setShipping(env.DB, oid, cap.shipping);
  if (cap.payer?.email) await env.DB.prepare('UPDATE orders SET email = ? WHERE id = ?')
    .bind(cap.payer.email.toLowerCase(), oid).run();

  const r = await markPaid(env.DB, oid, { paymentId: cap.captureId, feePence: cap.feePence, netPence: cap.netPence });
  if (r.ok && !r.already) ctx.waitUntil(afterPaid(env, oid));
  return json(200, { order: oid, status: 'paid' }, origin);
}

/* ============================================================
   WEBHOOKS — the authoritative confirmation
   ============================================================ */
async function stripeWebhook(req, env, ctx) {
  const raw = await req.text();
  const v = await stripe.verifyWebhook(env, raw, req.headers.get('Stripe-Signature'));
  if (!v.ok) { console.error('stripe webhook rejected:', v.error); return new Response('bad signature', { status: 400 }); }

  const ev = v.event;
  const obj = ev.data?.object || {};
  const oid = obj.metadata?.order_id || obj.client_reference_id ||
              (await env.DB.prepare('SELECT id FROM orders WHERE provider_session_id = ?')
                 .bind(obj.id || '').first())?.id;

  if (!await firstSeen(env.DB, 'stripe', ev.id, ev.type, oid)) return new Response('replay ignored', { status: 200 });
  if (!oid) return new Response('no order', { status: 200 });

  switch (ev.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (obj.payment_status && obj.payment_status !== 'paid') break;   // e.g. delayed methods
      const order = await env.DB.prepare('SELECT total_pence, currency FROM orders WHERE id = ?').bind(oid).first();
      if (order && obj.amount_total != null && obj.amount_total !== order.total_pence) {
        console.error('stripe amount mismatch', oid, obj.amount_total, order.total_pence);
        return new Response('amount mismatch', { status: 200 });
      }
      await setShipping(env.DB, oid, stripe.shippingFrom(obj));
      if (obj.customer_details?.email) await env.DB.prepare('UPDATE orders SET email = ? WHERE id = ?')
        .bind(obj.customer_details.email.toLowerCase(), oid).run();
      const facts = await stripe.paymentFacts(env, obj.payment_intent);
      const r = await markPaid(env.DB, oid, facts);
      if (r.ok && !r.already) ctx.waitUntil(afterPaid(env, oid));
      break;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      await markUnpaid(env.DB, oid, ev.type.endsWith('failed') ? 'failed' : 'cancelled');
      break;
    case 'payment_intent.payment_failed':
      await markUnpaid(env.DB, oid, 'failed');
      break;
    case 'charge.refunded': {
      const refunded = obj.amount_refunded || 0;
      await env.DB.prepare(
        `UPDATE orders SET payment_status = CASE WHEN ? >= total_pence THEN 'refunded'
            ELSE 'partially_refunded' END, updated_at = datetime('now') WHERE id = ?`
      ).bind(refunded, oid).run();
      break;
    }
  }
  return new Response('ok', { status: 200 });
}

async function paypalWebhook(req, env, ctx) {
  const raw = await req.text();
  const v = await paypal.verifyWebhook(env, raw, req.headers);
  if (!v.ok) { console.error('paypal webhook rejected:', v.error); return new Response('bad signature', { status: 400 }); }

  const ev = v.event;
  const res = ev.resource || {};
  const oid = res.custom_id || res.invoice_id ||
              res.purchase_units?.[0]?.custom_id ||
              res.supplementary_data?.related_ids?.order_id && null;

  if (!await firstSeen(env.DB, 'paypal', ev.id, ev.event_type, oid)) return new Response('replay ignored', { status: 200 });
  if (!oid) return new Response('no order', { status: 200 });

  if (ev.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const order = await env.DB.prepare('SELECT total_pence FROM orders WHERE id = ?').bind(oid).first();
    const gross = res.amount ? Math.round(parseFloat(res.amount.value) * 100) : null;
    if (order && gross != null && gross !== order.total_pence) {
      console.error('paypal amount mismatch', oid, gross, order.total_pence);
      return new Response('amount mismatch', { status: 200 });
    }
    const bd = res.seller_receivable_breakdown;
    const r = await markPaid(env.DB, oid, {
      paymentId: res.id,
      feePence: bd?.paypal_fee ? Math.round(parseFloat(bd.paypal_fee.value) * 100) : null,
      netPence: bd?.net_amount ? Math.round(parseFloat(bd.net_amount.value) * 100) : null
    });
    if (r.ok && !r.already) ctx.waitUntil(afterPaid(env, oid));
  } else if (['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED'].includes(ev.event_type)) {
    await markUnpaid(env.DB, oid, 'failed');
  } else if (ev.event_type === 'CHECKOUT.ORDER.APPROVED') {
    /* nothing to do: capture happens through our own endpoint */
  } else if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(ev.event_type)) {
    await env.DB.prepare(
      `UPDATE orders SET payment_status = 'refunded', updated_at = datetime('now') WHERE id = ?`).bind(oid).run();
  }
  return new Response('ok', { status: 200 });
}

/* Runs once per order, after the first successful payment confirmation. */
async function afterPaid(env, oid) {
  const o = await fullOrder(env.DB, oid);
  if (!o) return;
  await mail.orderConfirmation(env, o, o.items);
  if (env.ORDER_NOTIFY_EMAIL) await mail.newOrderAlert(env, o, o.items);
}

/* ============================================================
   CUSTOMER-FACING ORDER READS
   ============================================================ */
/* Confirmation page. The provider reference is unguessable, so it
   authorises the read without making a just-paid customer log in.
   If the webhook has not landed yet we ask the provider directly —
   still a server-to-server check, never the browser's word. */
async function confirmOrder(req, env, url, origin) {
  const oid = clean(url.searchParams.get('order'), 32).toUpperCase();
  const ref = clean(url.searchParams.get('ref'), 128);
  if (!oid || !ref) return bad(400, 'Missing order reference.', origin);

  let o = await fullOrder(env.DB, oid);
  if (!o) return bad(404, 'Order not found.', origin);
  if (!timingSafeEqual(String(o.provider_session_id || ''), ref))
    return bad(403, 'Not authorised to view this order.', origin);

  if (o.payment_status === 'pending' && o.provider === 'stripe' && env.STRIPE_SECRET_KEY) {
    const s = await stripe.retrieveSession(env, ref).catch(() => null);
    if (s && s.payment_status === 'paid' && s.amount_total === o.total_pence) {
      await setShipping(env.DB, oid, stripe.shippingFrom(s));
      if (s.customer_details?.email) await env.DB.prepare('UPDATE orders SET email = ? WHERE id = ?')
        .bind(s.customer_details.email.toLowerCase(), oid).run();
      const facts = await stripe.paymentFacts(env, s.payment_intent);
      const r = await markPaid(env.DB, oid, facts);
      if (r.ok && !r.already) await afterPaid(env, oid);
      o = await fullOrder(env.DB, oid);
    }
  }
  return json(200, publicOrder(o), origin);
}

async function orderStatus(req, env, origin) {
  const rl = await rateLimit(env.DB, `os:${clientIP(req)}`, 12, 300);
  if (!rl.ok) return bad(429, 'Too many lookups. Try again in a few minutes.', origin);
  const b = await req.json().catch(() => null);
  const oid   = clean(b?.order, 32).toUpperCase();
  const email = clean(b?.email, 254).toLowerCase();
  if (!oid || !isEmail(email)) return bad(400, 'Order number and email are both needed.', origin);

  const o = await fullOrder(env.DB, oid);
  if (!o) return bad(404, 'No order found with that number.', origin);
  if (o.email.toLowerCase() !== email) return bad(403, 'That email does not match this order.', origin);
  return json(200, publicOrder(o), origin);
}

export function publicOrder(o) {
  return {
    order: o.id,
    placed: o.created_at,
    paid: o.payment_status === 'paid',
    paymentStatus: o.payment_status,
    fulfilment: o.fulfilment_status,
    isPreorder: !!o.is_preorder,
    total: money(o.total_pence),
    shipping: o.shipping_pence ? money(o.shipping_pence) : 'Free',
    items: o.items.map(i => ({
      name: i.name, size: i.size, colour: i.colour, qty: i.qty,
      isPreorder: !!i.is_preorder, line: money(i.line_total_pence)
    })),
    address: [o.name, o.ship_line1, o.ship_line2, o.ship_city, o.ship_postcode, o.ship_country].filter(Boolean),
    tracking: o.tracking_number ? { carrier: o.tracking_carrier, number: o.tracking_number } : null,
    shippedAt: o.shipped_at, deliveredAt: o.delivered_at
  };
}
