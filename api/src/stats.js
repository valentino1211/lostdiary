/* ============================================================
   VISIT COUNTS — anonymous daily totals for the admin dashboard.

   What is stored: for each UK day, a handful of counters such as
   "visits = 41", "source:instagram = 28", "product_view:jersey-camo = 12".
   What is never stored: IP addresses, cookies, device IDs, or anything
   that could tell one visitor from another.

   The shop only sends a hit when the visitor hasn't chosen "Essential
   only", their browser isn't asking not to be tracked, and the page isn't
   running inside someone else's preview frame. UK PECR (as amended by the
   Data (Use and Access) Act 2025, in force 5 Feb 2026) allows first-party
   statistics like this without consent, provided visitors are told and can
   opt out free of charge — which the banner and cookie policy do.
   ============================================================ */

const TZ = 'Europe/London';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** UK calendar day, YYYY-MM-DD. */
export const ukDay = (d = new Date()) => dayFmt.format(d);
/** Move a YYYY-MM-DD day by n days (calendar arithmetic, no time zone involved). */
export function shiftDay(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** created_at is SQLite "YYYY-MM-DD HH:MM:SS" (UTC); paid_at is ISO. Read both. */
const parseTs = s => s ? new Date(/[TZ]/.test(s) ? s : s.replace(' ', 'T') + 'Z') : null;

/* ---------- who isn't counted ---------- */
const BOT = /bot\b|bot\/|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|facebookexternalhit|whatsapp\/|telegrambot|discordbot|curl\/|wget\/|python|java\/|go-http|axios|node-fetch|okhttp|httpclient/i;

/* ---------- where visitors came from ---------- */
const KNOWN = [
  ['email',     /^e?mail$|newsletter|(^|\.)mail\.|gmail|outlook|yahoo|icloud/],
  ['instagram', /instagram|^ig$/],
  ['tiktok',    /tiktok|musical_ly|bytedance/],
  ['facebook',  /facebook|^fb$|(^|\.)fb\.com$/],
  ['snapchat',  /snapchat/],
  ['x',         /^(x|twitter)$|twitter\.com|^t\.co$|(^|\.)x\.com$/],
  ['youtube',   /youtube|youtu\.be/],
  ['pinterest', /pinterest|pin\.it/],
  ['whatsapp',  /whatsapp|^wa\.me$/],
  ['google',    /google/],
  ['bing',      /bing|duckduckgo|ecosia|yahoo\.com/]
];
const known = s => { for (const [name, re] of KNOWN) if (re.test(s)) return name; return null; };

export function sourceOf(ua, refHost, param) {
  const p = String(param || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
  if (p) return known(p) || 'other';                 // ?utm_source=instagram on a link wins
  // Instagram, TikTok and Facebook open links in their own in-app browser,
  // which usually hides the referrer but announces itself in the user agent.
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  if (!refHost) return 'direct';
  return known(refHost) || 'other';
}

export const deviceOf = ua =>
  /iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua) ? 'tablet'
  : /Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(ua) ? 'mobile'
  : 'desktop';

/* Hosts whose referral is not a new visit: the shop itself, the admin,
   and the payment pages people return from after checkout. */
function internalHosts(env) {
  const hosts = new Set(['checkout.stripe.com', 'stripe.com', 'paypal.com', 'www.paypal.com', 'www.sandbox.paypal.com']);
  for (const u of [env.SITE_URL, env.API_URL, ...(env.ALLOWED_ORIGINS || '').split(',')]) {
    try { const h = new URL(String(u).trim()).hostname; if (h) { hosts.add(h); hosts.add(h.replace(/^www\./, '')); hosts.add('www.' + h.replace(/^www\./, '')); } }
    catch (e) {}
  }
  return hosts;
}

/* ---------- light abuse guard, held in memory only (never stored) ---------- */
const RL = new Map();
export const _resetGuard = () => RL.clear();
function tooMany(ip, now) {
  if (RL.size > 10000) RL.clear();
  const w = RL.get(ip);
  if (!w || now - w.t > 600000) { RL.set(ip, { t: now, n: 1 }); return false; }
  return ++w.n > 300;                                 // >300 hits in 10 minutes from one address
}

/* ---------- product ids, cached briefly so a hit costs no extra reads ---------- */
let PIDS = null, PIDS_AT = 0;
export const _resetProducts = () => { PIDS = null; };
async function productIds(db, now) {
  if (!PIDS || now - PIDS_AT > 300000) {
    PIDS = new Set((await db.prepare('SELECT id FROM products').all()).results.map(r => r.id));
    PIDS_AT = now;
  }
  return PIDS;
}

const UPSERT = `INSERT INTO stats_daily (day, metric, key, n) VALUES (?, ?, ?, 1)
                ON CONFLICT(day, metric, key) DO UPDATE SET n = n + 1`;

/**
 * Record one hit from the shop. Returns what was counted (for tests);
 * never throws on bad input — junk is ignored, not stored.
 */
export async function recordHit(env, req, rawBody, now = new Date()) {
  const ua = req.headers.get('User-Agent') || '';
  if (!ua || BOT.test(ua)) return { skipped: 'bot' };
  if (String(rawBody || '').length > 1024) return { skipped: 'too big' };
  if (tooMany(req.headers.get('CF-Connecting-IP') || 'local', now.getTime())) return { skipped: 'rate' };

  let b; try { b = JSON.parse(rawBody); } catch (e) { return { skipped: 'bad json' }; }
  if (!b || typeof b !== 'object') return { skipped: 'bad json' };

  const day = ukDay(now), rows = [];
  if (b.t === 'v') {
    rows.push(['pageview', '']);
    const ref = String(b.ref || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 100);
    const internal = ref && internalHosts(env).has(ref);
    // a reload, a back-button return or a trip back from the payment page isn't a new visit
    if (b.nav === 'navigate' && !internal) {
      const cc = String(req.cf?.country || '').toUpperCase();
      rows.push(['visit', ''],
                ['source', sourceOf(ua, ref, b.src)],
                ['device', deviceOf(ua)],
                ['country', /^[A-Z]{2}$/.test(cc) && cc !== 'T1' ? cc : 'XX']);
    }
  } else if (b.t === 'p' || b.t === 'b') {
    const id = String(b.id || '').slice(0, 60);
    if (!(await productIds(env.DB, now.getTime())).has(id)) return { skipped: 'unknown product' };
    rows.push([b.t === 'p' ? 'product_view' : 'bag_add', id]);
  } else {
    return { skipped: 'unknown type' };
  }

  await env.DB.batch(rows.map(([metric, key]) => env.DB.prepare(UPSERT).bind(day, metric, key)));
  return { day, counted: rows.map(r => r[1] ? r[0] + ':' + r[1] : r[0]) };
}

/** Delete daily totals older than ~13 months. Run from the cron. */
export async function pruneStats(db, now = new Date()) {
  return db.prepare('DELETE FROM stats_daily WHERE day < ?').bind(shiftDay(ukDay(now), -400)).run();
}

/* ============================================================
   DASHBOARD NUMBERS
   ============================================================ */
const money = p => '£' + (p / 100).toFixed(2);

export async function visitorStats(db, { days = 7, now = new Date(), siteUrl = '' } = {}) {
  days = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const today = ukDay(now), start = shiftDay(today, -(days - 1));

  const span = [];
  for (let d = start; d <= today; d = shiftDay(d, 1)) span.push(d);
  const byDay = Object.fromEntries(span.map(d => [d, { day: d, visits: 0, pageviews: 0, orders: 0 }]));

  const rows = (await db.prepare(
    'SELECT day, metric, key, n FROM stats_daily WHERE day >= ? AND day <= ?').bind(start, today).all()).results;

  const sum = { visit: 0, pageview: 0, product_view: 0, bag_add: 0 };
  const groups = { source: {}, device: {}, country: {}, product_view: {}, bag_add: {} };
  for (const r of rows) {
    if (r.metric in sum) sum[r.metric] += r.n;
    if (r.metric in groups) groups[r.metric][r.key] = (groups[r.metric][r.key] || 0) + r.n;
    if (byDay[r.day]) {
      if (r.metric === 'visit') byDay[r.day].visits += r.n;
      if (r.metric === 'pageview') byDay[r.day].pageviews += r.n;
    }
  }
  const sorted = o => Object.entries(o).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));

  // today, whatever range is selected
  const todayRows = rows.filter(r => r.day === today);
  const todayVisits = todayRows.filter(r => r.metric === 'visit').reduce((s, r) => s + r.n, 0);
  const todayViews = todayRows.filter(r => r.metric === 'pageview').reduce((s, r) => s + r.n, 0);

  // checkouts and orders come from the order records themselves, not from counting
  const from = shiftDay(start, -1);       // a day of slack: the two timestamp formats are compared as text
  const orders = (await db.prepare(
    `SELECT created_at, paid_at, payment_status, total_pence FROM orders
      WHERE created_at >= ? OR (paid_at IS NOT NULL AND paid_at >= ?)`).bind(from + ' 00:00:00', from).all()).results;
  let checkouts = 0, notCompleted = 0, paid = 0, salesPence = 0;
  for (const o of orders) {
    const c = parseTs(o.created_at), p = parseTs(o.paid_at);
    if (c && ukDay(c) >= start && ukDay(c) <= today) {
      checkouts++;
      if (!o.paid_at) notCompleted++;
    }
    if (p && ukDay(p) >= start && ukDay(p) <= today) {
      paid++; salesPence += o.total_pence;
      if (byDay[ukDay(p)]) byDay[ukDay(p)].orders++;
    }
  }

  const names = Object.fromEntries((await db.prepare('SELECT id, name FROM products').all()).results.map(r => [r.id, r.name]));
  const pieceIds = new Set([...Object.keys(groups.product_view), ...Object.keys(groups.bag_add)]);
  const pieces = [...pieceIds].map(id => ({
    id, name: names[id] || id, views: groups.product_view[id] || 0, bagAdds: groups.bag_add[id] || 0
  })).sort((a, b) => b.views - a.views || b.bagAdds - a.bagAdds);

  return {
    days, start, end: today, siteUrl,
    today: { visits: todayVisits, pageviews: todayViews },
    totals: {
      visits: sum.visit, pageviews: sum.pageview, productViews: sum.product_view, bagAdds: sum.bag_add,
      checkouts, checkoutsNotCompleted: notCompleted, orders: paid, salesPence, sales: money(salesPence)
    },
    conversion: sum.visit ? paid / sum.visit : null,
    series: span.map(d => byDay[d]),
    pieces,
    sources: sorted(groups.source),
    devices: sorted(groups.device),
    countries: sorted(groups.country)
  };
}
