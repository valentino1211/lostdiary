/* ============================================================
   Transactional email through Resend. If RESEND_API_KEY is absent
   nothing is sent and nothing breaks — orders are unaffected.
   ============================================================ */
import { money } from './lib.js';

async function send(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY || !to) return { skipped: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Lost Diary <onboarding@resend.dev>', to: [to], subject, html })
  });
  if (!r.ok) console.error('resend', r.status, await r.text());
  return { ok: r.ok };
}

const shell = (env, title, inner) => `<!doctype html><html><body style="margin:0;background:#F4F3F1;padding:34px 16px;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #E4E2DE">
 <tr><td style="padding:34px 34px 0">
   <div style="font-size:10px;letter-spacing:.34em;text-transform:uppercase;color:#8E8D8A">LOST DIARY</div>
   <h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;margin:14px 0 0">${title}</h1>
 </td></tr>
 <tr><td style="padding:22px 34px 34px;font-size:14px;line-height:1.75;color:#3A3A3C">${inner}</td></tr>
 <tr><td style="padding:20px 34px 30px;border-top:1px solid #EEECE8;font-size:10px;letter-spacing:.2em;
   text-transform:uppercase;color:#8E8D8A">Lost Diary — Luxury streetwear<br>
   <a href="mailto:${env.SUPPORT_EMAIL || 'orders@example.com'}" style="color:#8E8D8A">${env.SUPPORT_EMAIL || 'orders@example.com'}</a>
 </td></tr></table></td></tr></table></body></html>`;

const itemRows = items => `<table role="presentation" width="100%" style="border-top:1px solid #EEECE8;margin:20px 0 0">` +
  items.map(i => `<tr>
    <td style="padding:12px 0;border-bottom:1px solid #EEECE8;font-size:14px">${i.name}
      ${i.is_preorder ? '<span style="font-size:10px;letter-spacing:.2em;color:#8E1116"> &nbsp;PRE-ORDER</span>' : ''}
      <br><span style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8E8D8A">
      ${[i.colour, 'Size ' + i.size].filter(Boolean).join(' · ')} · Qty ${i.qty}</span></td>
    <td align="right" style="padding:12px 0;border-bottom:1px solid #EEECE8;font-size:14px;white-space:nowrap">
      ${money(i.line_total_pence)}</td></tr>`).join('') + `</table>`;

const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#000;color:#fff;
  text-decoration:none;padding:15px 30px;font-size:10px;letter-spacing:.3em;text-transform:uppercase">${label}</a>`;

const addr = o => [o.name, o.ship_line1, o.ship_line2, o.ship_city, o.ship_postcode, o.ship_country]
  .filter(Boolean).join('<br>');

/* 1 + 2 — order and payment confirmation (one email, since payment is taken at checkout) */
export async function orderConfirmation(env, order, items) {
  const site = env.SITE_URL || '';
  const pre = order.is_preorder;
  return send(env, { to: order.email, subject: `Lost Diary — order ${order.id} confirmed`,
    html: shell(env, pre ? 'Your pre-order is confirmed' : 'Your order is confirmed', `
      <p style="margin:0 0 4px">Thank you${order.name ? ', ' + order.name : ''}.</p>
      <p style="margin:0">Order <strong>${order.id}</strong> is paid.</p>
      ${pre ? `<div style="margin:18px 0;padding:16px;background:#F7F6F4;border-left:2px solid #000">
        <p style="margin:0;font-size:11px;letter-spacing:.24em;text-transform:uppercase">This is a pre-order</p>
        <p style="margin:8px 0 0;font-size:13px">Payment has been taken now. These pieces are not yet in our hands —
        they are ordered from our maker once the pre-order window closes.
        ${items.find(i => i.is_preorder)?.eta ? 'Estimated delivery: ' + items.find(i => i.is_preorder).eta + '.' : ''}
        Supplier delays can move that estimate; we will tell you if it does.</p></div>`
      : `<p style="margin:8px 0 0">It leaves us within ${env.DISPATCH_DAYS || 'three working days'} and you will be
         emailed tracking the moment it ships.</p>`}
      ${itemRows(items)}
      <table role="presentation" width="100%" style="margin:12px 0 0">
        <tr><td style="font-size:13px;color:#8E8D8A">Shipping</td>
            <td align="right" style="font-size:13px">${order.shipping_pence ? money(order.shipping_pence) : 'Free'}</td></tr>
        <tr><td style="font-size:13px;color:#8E8D8A">Total paid</td>
            <td align="right" style="font-size:18px;font-family:Georgia,serif">${money(order.total_pence)}</td></tr>
      </table>
      ${addr(order) ? `<p style="margin:22px 0 6px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8E8D8A">Shipping to</p>
        <p style="margin:0;font-size:14px;line-height:1.6">${addr(order)}</p>` : ''}
      <p style="margin:28px 0 0">${btn(`${site}/track.html?order=${order.id}`, 'Track this order')}</p>
      <p style="margin:18px 0 0;font-size:12px;color:#8E8D8A">Keep order number <strong>${order.id}</strong> —
      you need it and this email address to check progress.</p>`) });
}

/* 3 — we have placed the supplier order */
export const supplierPlaced = (env, order, eta) => send(env, {
  to: order.email, subject: `Lost Diary — order ${order.id} is in production`,
  html: shell(env, 'Ordered from our maker', `
    <p style="margin:0">Your pre-order <strong>${order.id}</strong> has been placed with our maker.</p>
    ${eta ? `<p style="margin:10px 0 0">Estimated delivery to you: ${eta}.</p>` : ''}
    <p style="margin:10px 0 0">Nothing needed from you — the next email will carry your tracking.</p>`) });

/* 4 — stock is with us */
export const stockReceived = (env, order) => send(env, {
  to: order.email, subject: `Lost Diary — order ${order.id} is with us`,
  html: shell(env, 'Your pieces have arrived', `
    <p style="margin:0">Order <strong>${order.id}</strong> has reached our studio and is being packed.
    Tracking follows shortly.</p>`) });

/* 5 — dispatched */
export const dispatched = (env, order, items, carrierName, url) => send(env, {
  to: order.email, subject: `Lost Diary — order ${order.id} is on its way`,
  html: shell(env, 'Your order has shipped', `
    <p style="margin:0">Order <strong>${order.id}</strong> left us today${carrierName ? ' with ' + carrierName : ''}.</p>
    <p style="margin:16px 0 0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8E8D8A">Tracking number</p>
    <p style="margin:6px 0 0;font-size:19px;font-family:Georgia,serif">${order.tracking_number || ''}</p>
    ${url ? `<p style="margin:20px 0 0">${btn(url, 'Track parcel')}</p>` : ''}
    <p style="margin:14px 0 0;font-size:12px;color:#8E8D8A">If that link does not open, paste the number into the
    carrier's website — scans can take a few hours to appear.</p>
    ${itemRows(items)}`) });

/* 6 — delivered */
export const delivered = (env, order) => send(env, {
  to: order.email, subject: `Lost Diary — order ${order.id} delivered`,
  html: shell(env, 'Delivered', `
    <p style="margin:0">Order <strong>${order.id}</strong> is marked delivered. If anything is wrong, reply to this
    email within 14 days and we will put it right.</p>`) });

/* refund */
export const refunded = (env, order, amountPence) => send(env, {
  to: order.email, subject: `Lost Diary — refund for order ${order.id}`,
  html: shell(env, 'Your refund is on its way', `
    <p style="margin:0">We have refunded <strong>${money(amountPence)}</strong> against order
    <strong>${order.id}</strong>. It returns to your original payment method — banks usually take 5–10 days.</p>`) });

/* internal */
export const newOrderAlert = (env, order, items) => send(env, {
  to: env.ORDER_NOTIFY_EMAIL, subject: `${order.is_preorder ? 'PRE-ORDER' : 'Order'} ${order.id} — ${money(order.total_pence)}`,
  html: shell(env, order.is_preorder ? 'New pre-order' : 'New order', `
    <p style="margin:0"><strong>${order.id}</strong> — ${money(order.total_pence)} via ${order.provider}</p>
    ${itemRows(items)}
    <p style="margin:16px 0 0;font-size:13px">${order.name || ''} &lt;${order.email}&gt;</p>
    ${addr(order) ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.6">${addr(order)}</p>` : ''}
    <p style="margin:24px 0 0">${btn(`${env.API_URL || ''}/admin`, 'Open admin')}</p>`) });
