/* ============================================================
   Stripe — cards + Apple Pay + Google Pay via Stripe Checkout.

   Why Checkout rather than our own card form: Stripe hosts the
   payment page, so Apple Pay is available without us hosting an
   Apple domain-association file, and no card data ever touches
   our code or GitHub Pages (PCI scope stays with Stripe).
   ============================================================ */
import { formBody, timingSafeEqual, bytesToB64 } from './lib.js';

const API = 'https://api.stripe.com/v1';

async function call(env, path, body, method = 'POST', idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-06-20'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await fetch(API + path, { method, headers, body: body ? formBody(body).toString() : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Stripe ${r.status}`);
  return data;
}

export async function createCheckoutSession(env, { orderId, quote, email, successUrl, cancelUrl }) {
  const t = quote.totals;
  const body = {
    mode: 'payment',
    client_reference_id: orderId,
    // Apple Pay / Google Pay appear automatically for eligible devices when the
    // wallet is enabled in Stripe Dashboard → Settings → Payment methods.
    automatic_tax: { enabled: false },
    customer_email: email || undefined,
    customer_creation: 'always',
    invoice_creation: { enabled: true },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    shipping_address_collection: { allowed_countries: quote.shipTo },
    phone_number_collection: { enabled: false },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,     // matches the stock-reservation sweep
    line_items: quote.lines.map(l => ({
      quantity: l.qty,
      price_data: {
        currency: t.currency.toLowerCase(),
        unit_amount: l.unitPence,                            // from our database, never the client
        product_data: {
          name: (l.isPreorder ? 'PRE-ORDER — ' : '') + l.name,
          description: [l.colour, 'Size ' + l.size].filter(Boolean).join(' / ')
        }
      }
    })),
    shipping_options: [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: t.shippingLabel,
        fixed_amount: { amount: t.shippingPence, currency: t.currency.toLowerCase() }
      }
    }],
    metadata: { order_id: orderId, preorder: quote.isPreorder ? '1' : '0' },
    payment_intent_data: {
      description: `Lost Diary ${orderId}`,
      metadata: { order_id: orderId, preorder: quote.isPreorder ? '1' : '0' }
    },
    custom_text: quote.isPreorder ? {
      submit: { message: 'This is a pre-order. Payment is taken now; the pieces are made to order.' }
    } : undefined,
    success_url: `${successUrl}?order=${orderId}&provider=stripe&ref={CHECKOUT_SESSION_ID}`,
    cancel_url: `${cancelUrl}?cancelled=1&order=${orderId}`
  };
  const s = await call(env, '/checkout/sessions', body, 'POST', `sess_${orderId}`);
  return { id: s.id, url: s.url };
}

/* Server-to-server session read, used when the webhook is still in flight. */
export async function retrieveSession(env, sessionId) {
  return call(env, `/checkout/sessions/${sessionId}`, null, 'GET');
}

/* Real fee + net, straight from Stripe's balance transaction. */
export async function paymentFacts(env, paymentIntentId) {
  if (!paymentIntentId) return {};
  try {
    const pi = await call(env,
      `/payment_intents/${paymentIntentId}?expand[]=latest_charge.balance_transaction`, null, 'GET');
    const bt = pi?.latest_charge?.balance_transaction;
    return {
      paymentId: pi?.latest_charge?.id || paymentIntentId,
      feePence: bt?.fee ?? null,
      netPence: bt?.net ?? null
    };
  } catch { return { paymentId: paymentIntentId }; }
}

export async function refund(env, { paymentId, amountPence, reason, key }) {
  const r = await call(env, '/refunds', {
    payment_intent: paymentId.startsWith('pi_') ? paymentId : undefined,
    charge:         paymentId.startsWith('ch_') ? paymentId : undefined,
    amount: amountPence,
    reason: reason === 'fraudulent' ? 'fraudulent' : 'requested_by_customer'
  }, 'POST', key);
  return { id: r.id, status: r.status };
}

/* ---------- webhook signature verification (Stripe's scheme) ---------- */
export async function verifyWebhook(env, rawBody, sigHeader, toleranceSec = 300) {
  if (!sigHeader || !env.STRIPE_WEBHOOK_SECRET) return { ok: false, error: 'missing signature' };
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=').map(s => s.trim())));
  const ts = parts.t, given = parts.v1;
  if (!ts || !given) return { ok: false, error: 'malformed signature' };
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return { ok: false, error: 'timestamp outside tolerance' };

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(expected, given)) return { ok: false, error: 'signature mismatch' };
  try { return { ok: true, event: JSON.parse(rawBody) }; }
  catch { return { ok: false, error: 'bad json' }; }
}

/* Stripe → our shipping shape */
export function shippingFrom(session) {
  const d = session?.shipping_details || session?.customer_details;
  const a = d?.address;
  if (!a) return null;
  return { name: d.name, phone: session?.customer_details?.phone, line1: a.line1, line2: a.line2,
           city: a.city, postcode: a.postal_code, country: a.country };
}
