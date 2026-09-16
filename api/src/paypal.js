/* ============================================================
   PayPal — Orders v2. The button is the official PayPal JS SDK on
   the storefront; order creation, capture and refunds all happen
   here, server-side, with the secret never leaving the Worker.
   ============================================================ */
import { money } from './lib.js';

const base = env => env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function token(env) {
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const r = await fetch(`${base(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || 'PayPal auth failed');
  return d.access_token;
}

async function call(env, path, body, method = 'POST', requestId) {
  const headers = { Authorization: `Bearer ${await token(env)}`, 'Content-Type': 'application/json' };
  if (requestId) headers['PayPal-Request-Id'] = requestId;       // PayPal's own idempotency key
  const r = await fetch(base(env) + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(data?.message || data?.details?.[0]?.description || `PayPal ${r.status}`);
  return data;
}

const gbp = pence => (pence / 100).toFixed(2);

export async function createOrder(env, { orderId, quote, returnUrl, cancelUrl }) {
  const t = quote.totals;
  const items = quote.lines.map(l => ({
    name: ((l.isPreorder ? 'PRE-ORDER — ' : '') + l.name).slice(0, 127),
    description: [l.colour, 'Size ' + l.size].filter(Boolean).join(' / ').slice(0, 127),
    sku: (l.sku || l.variantId).slice(0, 127),
    quantity: String(l.qty),
    unit_amount: { currency_code: t.currency, value: gbp(l.unitPence) },
    category: 'PHYSICAL_GOODS'
  }));
  const o = await call(env, '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: orderId,
      custom_id: orderId,
      invoice_id: orderId,                                     // blocks a duplicate capture of the same order
      description: `Lost Diary ${orderId}`.slice(0, 127),
      items,
      amount: {
        currency_code: t.currency,
        value: gbp(t.totalPence),
        breakdown: {
          item_total: { currency_code: t.currency, value: gbp(t.subtotalPence) },
          shipping:   { currency_code: t.currency, value: gbp(t.shippingPence) }
        }
      }
    }],
    payment_source: {
      paypal: {
        experience_context: {
          shipping_preference: 'GET_FROM_FILE',
          user_action: 'PAY_NOW',
          brand_name: 'LOST DIARY',
          return_url: returnUrl,
          cancel_url: cancelUrl
        }
      }
    }
  }, 'POST', `create_${orderId}`);
  return { id: o.id, status: o.status };
}

/* Server-to-server capture. This, plus the webhook, are the only ways an order becomes paid. */
export async function captureOrder(env, paypalOrderId, ourOrderId) {
  const c = await call(env, `/v2/checkout/orders/${paypalOrderId}/capture`, {}, 'POST', `cap_${ourOrderId}`);
  const pu  = c.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  const bd  = cap?.seller_receivable_breakdown;
  const sh  = pu?.shipping;
  const a   = sh?.address;
  return {
    status: c.status,                                          // COMPLETED when the money moved
    reference: pu?.custom_id || pu?.reference_id,
    captureId: cap?.id,
    grossPence: cap ? Math.round(parseFloat(cap.amount.value) * 100) : null,
    feePence:   bd?.paypal_fee ? Math.round(parseFloat(bd.paypal_fee.value) * 100) : null,
    netPence:   bd?.net_amount ? Math.round(parseFloat(bd.net_amount.value) * 100) : null,
    payer: { email: c.payer?.email_address, name: [c.payer?.name?.given_name, c.payer?.name?.surname].filter(Boolean).join(' ') },
    shipping: a ? {
      name: sh?.name?.full_name, line1: a.address_line_1, line2: a.address_line_2,
      city: a.admin_area_2, postcode: a.postal_code, country: a.country_code
    } : null
  };
}

export async function getOrder(env, paypalOrderId) {
  return call(env, `/v2/checkout/orders/${paypalOrderId}`, null, 'GET');
}

export async function refund(env, { captureId, amountPence, currency = 'GBP', note, key }) {
  const r = await call(env, `/v2/payments/captures/${captureId}/refund`, {
    amount: { value: gbp(amountPence), currency_code: currency },
    note_to_payer: (note || 'Refund').slice(0, 255)
  }, 'POST', key);
  return { id: r.id, status: r.status };
}

/* ---------- webhook verification, done by PayPal itself ---------- */
export async function verifyWebhook(env, rawBody, headers) {
  if (!env.PAYPAL_WEBHOOK_ID) return { ok: false, error: 'PAYPAL_WEBHOOK_ID not set' };
  const h = n => headers.get(n) || headers.get(n.toLowerCase());
  const payload = {
    transmission_id:   h('paypal-transmission-id'),
    transmission_time: h('paypal-transmission-time'),
    cert_url:          h('paypal-cert-url'),
    auth_algo:         h('paypal-auth-algo'),
    transmission_sig:  h('paypal-transmission-sig'),
    webhook_id:        env.PAYPAL_WEBHOOK_ID,
    webhook_event:     JSON.parse(rawBody)
  };
  if (!payload.transmission_id || !payload.transmission_sig) return { ok: false, error: 'missing headers' };
  const res = await call(env, '/v1/notifications/verify-webhook-signature', payload);
  if (res.verification_status !== 'SUCCESS') return { ok: false, error: 'verification_status ' + res.verification_status };
  return { ok: true, event: payload.webhook_event };
}
