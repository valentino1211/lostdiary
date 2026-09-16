# LOST DIARY — production e-commerce

Storefront on GitHub Pages. Everything that touches money on a Cloudflare Worker with its own database.
Real Stripe (cards + Apple Pay) and real PayPal. Paid pre-orders with a supplier order summary.

---

## 0 · Open it right now

Double-click `index.html`. Code `GOGettersFitmade321?`. Everything works — all nine pieces, categories,
pre-order labels, the bag, totals — with **no backend and no setup**.

In this state the Checkout button is deliberately disabled and says payments are not connected. That is the
honest answer until you deploy the API: nothing can be charged, so nothing pretends it can.

When you are ready to take money, deploy `api/` (§5) and paste its address into `CONFIG.apiBase` near the top of
`index.html`. The shop then switches over automatically — prices, stock and totals start coming from the database
instead of the built-in copy, and the payment buttons appear.

Two catalogues exist and they must agree once you go live: the preview list in `index.html` (the `P` array) and
the real one in `api/seed.sql`. Edit the database one; the preview list is only there so the file never shows an
empty shop.

---

## 1 · What I changed

The site was a static page with a hard-coded product array and a bag in `localStorage`. Prices lived in the
browser, so the "shop" could not safely take money. Design, 3D logo, gate and copy are untouched — the commerce
layer underneath was replaced.

| Before | Now |
| --- | --- |
| `PRODUCTS` array hard-coded in `index.html` | Catalogue served from D1 via `GET /v1/products` |
| Prices in the page | Prices only in the database; the browser sends **variant id + quantity, nothing else** |
| Netlify functions + a single Stripe call | Cloudflare Worker: quote, checkout, webhooks, orders, admin |
| No database | D1 (SQLite): products, variants, orders, order_items, customers, refunds, supplier_orders, webhook_events, admin_users, sessions, settings |
| No stock | Race-safe reservations, sold-out sizes, automatic release of abandoned checkouts |
| No pre-orders | Full paid pre-order system with windows, caps, allocation counters and supplier aggregation |
| Static `admin.html` with a token in the URL | Real login (PBKDF2 + signed HttpOnly cookie), served from the Worker |
| One 630 KB HTML file | 226 KB — product images moved to `img/` and lazy-loaded |
| `Access-Control-Allow-Origin: *` | Origin allow-list |

Removed: `netlify/`, `netlify.toml`, the old root `admin.html` and `package.json`.

---

## 2 · Architecture

```
                         CUSTOMER
                            │
              CUSTOM DOMAIN │ (HTTPS, free cert from GitHub)
                            ▼
                    ┌───────────────────┐
                    │   GITHUB PAGES    │  static only
                    │  index.html       │  storefront + bag
                    │  order.html       │  confirmation
                    │  track.html       │  order tracking
                    │  policies.html    │  legal
                    │  img/             │  product photography
                    └─────────┬─────────┘
                              │  fetch(), CORS allow-list, no secrets
                              ▼
                    ┌───────────────────┐
                    │ CLOUDFLARE WORKER │  the only place secrets exist
                    │  /v1/products     │  catalogue
                    │  /v1/quote        │  authoritative prices + totals
                    │  /v1/checkout/*   │  reserve stock, open payment
                    │  /v1/webhooks/*   │  signature-verified confirmation
                    │  /v1/order/*      │  confirmation + tracking
                    │  /admin           │  dashboard behind a login
                    │  cron */15        │  release abandoned stock
                    └──┬────────┬───────┘
                       │        │
        ┌──────────────┘        └───────────────┬──────────────┐
        ▼                                       ▼              ▼
┌───────────────┐                    ┌────────────────┐  ┌──────────┐
│ CLOUDFLARE D1 │                    │ STRIPE         │  │ RESEND   │
│ products      │                    │  cards         │  │ order    │
│ variants      │                    │  Apple Pay     │  │ emails   │
│ orders        │                    │  Google Pay    │  └──────────┘
│ order_items   │                    ├────────────────┤
│ customers     │                    │ PAYPAL         │
│ refunds       │                    │  Orders v2     │
│ supplier      │                    └───────┬────────┘
│ webhook_events│                            │ verified webhook
│ admin/sessions│◀───────────────────────────┘
└───────────────┘        order → PAID  ·  stock/allocation committed
```

**Why these choices**

- **Cloudflare Workers** — free tier covers a small brand comfortably, no cold starts, secrets via `wrangler secret`,
  and a built-in cron for the stock sweep. Netlify or Vercel would also work; Workers wins on cost and latency.
- **D1** — real SQL with foreign keys, CHECK constraints and indexes, in the same runtime as the Worker, no
  connection pooling to think about. Conditional `UPDATE` gives race-safe stock without row locks.
- **Stripe Checkout for Apple Pay** — Stripe hosts the payment page, so Apple Pay works **without** you hosting an
  Apple domain-association file, and no card data touches your code. Your PCI scope stays at SAQ-A.
- **PayPal Orders v2** — the official button, with order creation and capture server-side so the secret never ships.
- **Resend** — one HTTP call, no SDK, generous free tier.

---

## 3 · Accounts you need

| Service | For | Cost |
| --- | --- | --- |
| GitHub | storefront hosting | free |
| Cloudflare | Worker + D1 | free tier is enough to start |
| Stripe | cards, Apple Pay, Google Pay | ~1.5% + 20p UK cards |
| PayPal (Business) | PayPal payments | ~2.9% + 30p |
| Resend | order emails | free to 3,000/month |
| Domain registrar | your own domain | ~£10/year |

---

## 4 · Environment variables

Set with `npx wrangler secret put NAME` (never in a file, never in git).

| Variable | Needed for | Where to find it |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | taking card/Apple Pay payments | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | verifying Stripe webhooks | shown when you add the endpoint |
| `PAYPAL_CLIENT_ID` | PayPal button (public by design) | PayPal Developer → your app |
| `PAYPAL_SECRET` | server-side capture | same screen |
| `PAYPAL_WEBHOOK_ID` | verifying PayPal webhooks | shown when you add the webhook |
| `RESEND_API_KEY` | order emails | Resend → API keys |
| `SESSION_SECRET` | signing admin cookies | `openssl rand -base64 48` |
| `ADMIN_SETUP_TOKEN` | creating the first admin, once | `openssl rand -base64 32` |

Non-secret values live in `api/wrangler.toml` under `[vars]`: `SITE_URL`, `API_URL`, `ALLOWED_ORIGINS`,
`PAYPAL_ENV`, `MAIL_FROM`, `SUPPORT_EMAIL`, `ORDER_NOTIFY_EMAIL`, `DISPATCH_DAYS`.

---

## 5 · Deploy the backend

```bash
cd api
npm install
npx wrangler login

npx wrangler d1 create lostdiary          # copy database_id into wrangler.toml
npm run db:migrate                        # creates the schema
npm run db:seed                           # loads your nine pieces

npx wrangler secret put STRIPE_SECRET_KEY     # repeat for each secret in §4
npx wrangler deploy
```

Then edit `[vars]` in `wrangler.toml` — `SITE_URL`, `API_URL` and `ALLOWED_ORIGINS` — and `npx wrangler deploy` again.

**`ALLOWED_ORIGINS`** is the CORS allow-list: a comma-separated list of exact origins, no wildcard, no trailing
slash. While you are on `username.github.io` use that; when your domain goes live add
`https://lostdiary.com,https://www.lostdiary.com`. Anything not on the list gets a 403.

---

## 6 · Deploy the storefront

Paste your Worker URL into **three** files — `index.html` (`CONFIG.apiBase`), `order.html` (`API`), `track.html` (`API`).

```bash
git add . && git commit -m "storefront" && git push
```

GitHub → Settings → Pages → Source: `main`, folder `/ (root)`. `.nojekyll` is already there so `img/` is served
untouched. Future updates are just `git push`.

**Custom domain:** add a `CNAME` file containing `lostdiary.com`, point a CNAME record at
`username.github.io`, then tick *Enforce HTTPS* once the cert issues (10–30 minutes). Afterwards update
`SITE_URL` and `ALLOWED_ORIGINS`, redeploy the Worker, and change the return URLs in Stripe and PayPal.

---

## 7 · Stripe (cards + Apple Pay)

1. Stripe → **Settings → Payment methods** → enable **Apple Pay** and **Google Pay**. On Stripe-hosted Checkout
   no domain file is needed; Apple Pay simply appears on Safari/iOS.
2. **Developers → Webhooks → Add endpoint**: `https://YOUR-WORKER/v1/webhooks/stripe`
   Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `payment_intent.payment_failed`, `charge.refunded`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. **Settings → Emails** → turn on *Successful payments* so Stripe's own receipt goes out alongside ours.

Test mode and live mode have separate keys **and separate webhooks**. Set both up when you go live.

## 8 · PayPal

1. developer.paypal.com → **Apps & Credentials** → create an app. Sandbox first.
2. Copy Client ID and Secret into the secrets.
3. In the app, add a webhook: `https://YOUR-WORKER/v1/webhooks/paypal`, events
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`.
   Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID`.
4. Test with a sandbox buyer account. When ready, repeat under **Live** and set `PAYPAL_ENV = "live"`.

---

## 9 · Create your admin account

Once, using the setup token:

```bash
curl -X POST https://YOUR-WORKER/admin/api/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"token":"YOUR_ADMIN_SETUP_TOKEN","email":"you@lostdiary.com","password":"a-long-passphrase-you-remember"}'
```

Then sign in at `https://YOUR-WORKER/admin`. The endpoint refuses to run twice.
Delete `ADMIN_SETUP_TOKEN` afterwards: `npx wrangler secret delete ADMIN_SETUP_TOKEN`.

---

## 10 · Running the shop

**Add or change a product** — Admin → Products → *Add or update a product*. Everything is there: price in pence,
type (`in_stock` / `preorder` / `coming_soon` / `sold_out`), pre-order dates, caps, ETA text, supplier cost,
and the size/colour variants.

**Change stock** — Admin → Products, edit the number, Save. Takes effect immediately.

**Pre-order dates** — `preorderOpensAt` and `preorderClosesAt` (ISO dates). Ordering stops automatically outside
that window and when `preorderMax` or a variant's `preorderCap` is reached. No manual switch-off needed.

**Ship an order** — Admin → Orders → pick one → set fulfilment status, carrier and tracking number → Save.
Each stage emails the customer: *ordered from supplier*, *received*, *shipped* (with tracking), *delivered*.

**Supplier summary** — Admin → Supplier. Paid pre-orders aggregate by product, colour and size:

```
COBALT SET — Cobalt
S × 2   M × 4   L × 2        TOTAL 8
Customers paid £960.00 · Supplier cost £384.00 · Est. margin £576.00
```

Press *Mark ordered from supplier* and every customer line links to one supplier order and moves to the next
stage. Individual orders stay linked, so you can always see who is owed what.

**Refunds** — open the order, enter an amount, confirm. It goes through Stripe or PayPal for real and emails
the customer. Partial refunds supported.

**Money** — Admin → Overview shows gross, fees, net, refunds, supplier cost and estimated margin. Fees come from
the provider where reported, otherwise from the configurable rates in Settings. Note that gross and net are not
the same as *available to withdraw* — Stripe and PayPal pay out on their own schedules.

---

## 11 · Testing before real money

```bash
cd api && node test/run.js     # 59 checks, no accounts needed
```

Then in Stripe **test mode**, card `4242 4242 4242 4242`, any future expiry, any CVC:

| Test | Expected |
| --- | --- |
| Successful payment | order PAID, confirmation email, stock down |
| Cancel at Stripe | order cancelled, stock returns within 15 min (cron) |
| Close the browser after paying | webhook still marks it PAID |
| Refresh the success page | same order, no duplicate |
| Send the same webhook twice | second one ignored (`webhook_events`) |
| Edit the price in devtools | server prices it from D1 — impossible to change |
| Buy more than stock | refused with the real remaining count |
| Two people buy the last item | exactly one succeeds |
| Pre-order after the close date | refused |
| PayPal sandbox purchase | order PAID via capture **and** webhook, no double-count |

---

## 12 · What still needs you

Being blunt, because you asked:

1. **Accounts and verification.** Stripe and PayPal both need your real business details before they release
   money. Neither I nor anyone else can do that for you, and it can take a few days.
2. **I could not run these payment APIs.** I have no network access to Stripe or PayPal from here, so the
   integrations are written to their documented APIs and tested against stubs — the money paths have never been
   exercised against the live services. **Do the test-mode run in §11 before you take a real order.**
3. **Apple Pay on iOS needs Safari and a real card** — it will not appear in a desktop Chrome test.
4. **Prices are placeholders.** Chainlink £39.99, Territory £49.99, Cobalt Set £120 as a pre-order example.
   Supplier costs are guesses used only for the margin figure. Set your real numbers.
5. **Legal pages are structure, not law.** `policies.html` marks exactly what must be written. UK distance
   selling requires a 14-day cancellation right, refunds within 14 days, and your trading identity to be findable.
   Get them checked.
6. **Email domain.** Resend needs your domain verified before mail from `orders@yourdomain` will deliver.
7. **Product photography.** The images are cut from your reference collage. Replace `img/*.png` with studio shots.
8. **Backups.** `npx wrangler d1 export lostdiary --remote --output=backup.sql` — schedule it.

## 13 · Production checklist

- [ ] `wrangler.toml` vars point at your real domain; `ALLOWED_ORIGINS` has no wildcard
- [ ] All eight secrets set; `ADMIN_SETUP_TOKEN` deleted after first use
- [ ] `apiBase` / `API` updated in `index.html`, `order.html`, `track.html`
- [ ] Stripe **live** keys and a **live** webhook; Apple Pay enabled; receipts on
- [ ] PayPal **live** app, `PAYPAL_ENV = "live"`, live webhook id
- [ ] Real prices, supplier costs, shipping rates and free-shipping threshold
- [ ] Pre-order windows and caps set for anything on pre-order
- [ ] Legal pages written and checked; footer links working
- [ ] One full test-mode purchase on each provider, plus one refund
- [ ] `img/` replaced with real photography; `YOURDOMAIN` replaced in `robots.txt`, `sitemap.xml`, meta tags
- [ ] Admin password stored in a password manager
- [ ] D1 backup scheduled
