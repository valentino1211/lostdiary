/* ============================================================
   Shared helpers. No secrets in here — everything sensitive
   arrives through env bindings (Cloudflare secrets).
   ============================================================ */

export const ORDER_ALPHABET = '0123456789BCDFGHJKLMNPQRSTVWXZ'; // no vowels: no accidental words

export function orderId() {
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  return 'LD-' + [...b].map(n => ORDER_ALPHABET[n % ORDER_ALPHABET.length]).join('');
}
export function uid(prefix = '') {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return prefix + [...b].map(n => n.toString(16).padStart(2, '0')).join('');
}
export const money = (pence, sym = '£') => sym + (pence / 100).toFixed(2);
export const nowISO = () => new Date().toISOString();

/* ---------- CORS: never a wildcard on anything that matters ---------- */
export function allowedOrigin(req, env) {
  const list = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin');
  if (!origin) return null;                       // same-origin / server-to-server
  return list.includes(origin) ? origin : false;  // false = explicitly rejected
}
/* cacheSeconds is opt-in and only ever used on the public catalogue.
   Everything touching an order, a customer or the admin stays no-store. */
export function corsHeaders(origin, cacheSeconds = 0) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheSeconds
      ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 5}, stale-while-revalidate=${cacheSeconds * 10}`
      : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Credentials'] = 'true';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, OPTIONS';
    h['Vary'] = 'Origin';
  }
  return h;
}
export const json = (status, body, origin, cacheSeconds = 0) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(origin, cacheSeconds) });
export const bad = (status, error, origin) => json(status, { error }, origin);

/* ---------- input validation ---------- */
export const isEmail = s => typeof s === 'string' && /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(s) && s.length < 255;
export const clean = (s, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
export function intIn(v, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/* ---------- password hashing (PBKDF2 via Web Crypto; bcrypt is unavailable on Workers) ---------- */
const PBKDF2_ROUNDS = 100000;
export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ROUNDS, hash: 'SHA-512' }, key, 512);
  return { hash: bytesToB64(new Uint8Array(bits)), salt: bytesToB64(salt) };
}
export async function verifyPassword(password, hash, salt) {
  const got = await hashPassword(password, salt);
  return timingSafeEqual(got.hash, hash);
}
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- signed session cookies ---------- */
export async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToB64url(new Uint8Array(sig));
}
export async function signSession(id, secret) { return id + '.' + await hmac(secret, id); }
export async function readSession(cookieValue, secret) {
  if (!cookieValue || !cookieValue.includes('.')) return null;
  const i = cookieValue.lastIndexOf('.');
  const id = cookieValue.slice(0, i), sig = cookieValue.slice(i + 1);
  return timingSafeEqual(await hmac(secret, id), sig) ? id : null;
}
export function cookie(name, value, { maxAge = 60 * 60 * 8, clear = false } = {}) {
  return `${name}=${clear ? '' : value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear ? 0 : maxAge}`;
}
export function readCookie(req, name) {
  const raw = req.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/* ---------- base64 ---------- */
export const bytesToB64 = b => btoa(String.fromCharCode(...b));
export const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const bytesToB64url = b => bytesToB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const hex = b => [...b].map(n => n.toString(16).padStart(2, '0')).join('');

/* ---------- rate limiting (D1-backed, per IP + route) ---------- */
export async function rateLimit(db, bucket, limit, windowSec) {
  const now = Date.now();
  const row = await db.prepare('SELECT hits, reset_at FROM rate_limit WHERE bucket = ?').bind(bucket).first();
  if (!row || new Date(row.reset_at).getTime() < now) {
    await db.prepare(
      `INSERT INTO rate_limit (bucket, hits, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET hits = 1, reset_at = excluded.reset_at`
    ).bind(bucket, new Date(now + windowSec * 1000).toISOString()).run();
    return { ok: true, remaining: limit - 1 };
  }
  if (row.hits >= limit) return { ok: false, retryAfter: Math.ceil((new Date(row.reset_at).getTime() - now) / 1000) };
  await db.prepare('UPDATE rate_limit SET hits = hits + 1 WHERE bucket = ?').bind(bucket).run();
  return { ok: true, remaining: limit - row.hits - 1 };
}
export const clientIP = req => req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'unknown';

/* ---------- x-www-form-urlencoded body builder (Stripe & PayPal REST) ---------- */
export function formBody(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) =>
      typeof item === 'object' ? formBody(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, item));
    else if (typeof v === 'object') formBody(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
