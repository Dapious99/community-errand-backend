# Setup Guide

This is the one place to look for: what to sign up for, how to configure `.env`,
how to run the server, and what your frontend needs to do to talk to it
correctly. See [README.md](./README.md) for the full endpoint reference and
[PRD.md](./PRD.md) for the product spec.

## 1. Accounts you need

| Service | What it's for | Required to boot? | Free tier? |
|---|---|---|---|
| [Supabase](https://supabase.com) | Postgres database | **Yes** | Yes |
| [Upstash](https://upstash.com) | Redis (OTP codes only) | No - app boots without it, but every OTP flow (signup verification, password reset, new-device login, bank-change confirm) fails until it's set | Yes |
| [Resend](https://resend.com) | Sends OTP emails | No - same as above | Yes (100 emails/day) |
| [Paystack](https://paystack.com) | Payments (wallet deposit/top-up, AI-boost, wallet withdrawal transfers) | No - test keys work, real deposit/withdrawal calls fail without real keys | Yes (test mode) |
| [Cloudinary](https://cloudinary.com) | Image/document uploads | No - only `/uploads/*` endpoints need it | Yes |
| [Anthropic](https://console.anthropic.com) | AI features (Magic Post, price estimates, boost title rewrite, smart replies) | No - only `/errands/ai/*`, boost title rewrite, and `/messages/:id/smart-replies` need it | Yes (pay-as-you-go, no free tier, but Haiku is cheap) |
| [VTpass](https://vtpass.com) | Airtime/data bill purchases from wallet balance | No - only `/bills/*` need it | Yes (sandbox.vtpass.com for testing) |

**You already have Supabase set up** (`DB_HOST` in `.env` points at your
project's connection pooler). The other five are only needed once you
build/test the features that use them - the server runs fine without them,
it just returns a clear error from the specific endpoints that need them.

### Getting each key

- **Supabase**: Project Settings → Database → use the **Session pooler**
  connection (not "Direct connection" - that one is IPv6-only and won't
  resolve on most networks). Username will look like
  `postgres.<project-ref>`, not just `postgres`.
- **Upstash**: Create a Redis database → copy the connection string labeled
  for `ioredis` (starts with `rediss://`).
- **Resend**: Sign up → API Keys → create one. Without verifying your own
  domain, you can only send emails *to the address you signed up with* -
  fine for solo testing, not for real users until you verify a domain.
- **Paystack**: Dashboard → Settings → API Keys & Webhooks. Use the `sk_test_`
  / `pk_test_` keys for development.
- **Cloudinary**: Dashboard home page shows Cloud Name, API Key, API Secret
  directly.
- **Anthropic**: console.anthropic.com → API Keys → create one.
- **VTpass**: Sign up at vtpass.com (or sandbox.vtpass.com to test without
  real money) → Profile → API Keys tab → set "API AUTHENTICATION TYPE" to
  "API keys" → copy your static API Key, then generate public/secret keys
  (**shown only once** - copy them immediately or you'll have to regenerate).

## 2. Local setup

```bash
npm install
cp .env.example .env   # if you don't already have a .env
```

Fill in `.env` (see the table above for where each value comes from). Then:

```bash
npm run migration:run   # creates all tables in your Supabase DB
npm run start:dev       # starts the server with hot-reload
```

You should see `Nest application successfully started` and
`Application is running on: http://localhost:<PORT>`. Open
`http://localhost:<PORT>/api/docs` for the interactive Swagger UI - the
fastest way to try any endpoint without writing frontend code first.

### Creating the first admin account

There's no public admin signup - admin accounts (used for `/admin/*`
endpoints: platform settings, KYC approval) are created via a one-off CLI
script:

```bash
npm run admin:create -- --email=you@example.com --name="Ops" --password="a-strong-password"
```

Then `POST /admin/auth/login` with that email/password to get an admin
access token (separate from, and not interchangeable with, customer JWTs -
see `ADMIN_JWT_SECRET` in `.env`).

## 3. Frontend integration requirements

These are things your frontend **must** do for the API to work correctly -
not just nice-to-haves.

### Base URL & routing
- Everything is prefixed with `API_PREFIX` (default `api/v1`), e.g.
  `http://localhost:3010/api/v1/errands`.
- Auth header: `Authorization: Bearer <accessToken>` on every request except
  `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/verify-email`,
  `/auth/resend-verification`, `/auth/forgot-password`,
  `/auth/reset-password`, `/auth/login/confirm-device`,
  `/auth/login/resend-device-code`, and `/payments/webhook`.

### Response envelope
Every response is wrapped. Design your API client around this shape:
```json
// success
{ "success": true, "data": { /* ... */ } }
// error
{ "statusCode": 400, "timestamp": "...", "path": "...", "message": "..." }
```

### CORS
Your frontend's origin **must** be listed in the backend's `CORS_ORIGIN` env
var (comma-separated), or the browser will block every request with a CORS
error. If you add a new frontend dev URL or a deployed domain, add it there
and restart the server.

### Device ID (required for smooth login)
Generate a random ID once per install (e.g. `crypto.randomUUID()` or a UUID
library), persist it (AsyncStorage on mobile, localStorage on web), and send
it as `deviceId` in the body of both `POST /auth/register` and
`POST /auth/login`. If you skip this, **every login** will come back as
`{ requiresDeviceVerification: true }` instead of tokens, requiring an extra
emailed-code step every single time. See README.md's
"Device Trust & OTP Flows" section for the full flow.

### Two-step login
`POST /auth/login` can return two different shapes - check for
`requiresDeviceVerification` before assuming you got tokens:
```json
// normal
{ "user": {...}, "accessToken": "...", "refreshToken": "..." }
// unrecognized device
{ "requiresDeviceVerification": true, "message": "..." }
```
On the second shape, prompt for the emailed code and call
`POST /auth/login/confirm-device { email, deviceId, code }`, which returns
tokens the same way a normal login would. If the user needs a fresh code
(expired, or the email never arrived), call
`POST /auth/login/resend-device-code { email, deviceId }` - it doesn't
require the password again.

### Bank-change confirmation
`POST /users/kyc` can similarly return
`{ requiresConfirmation: true, message }` instead of the KYC object, if the
runner is changing bank details on an already-approved KYC. Prompt for the
emailed code and call `POST /users/kyc/confirm-bank-change { code }`. If the
code expires, `POST /users/kyc/resend-bank-change-code` (no body) issues a
fresh one without resubmitting the bank details form.

### WebSocket (messaging)
Connect to the `/messages` namespace with the JWT access token in the
handshake, not a header:
```js
io('http://localhost:3010/messages', { auth: { token: accessToken } })
```
Then emit `join_errand` with `{ errandId }` before sending/receiving
messages for that errand.

### Push notifications (runners)
Register the device's Expo push token once you have it:
`POST /notifications/register-token { deviceId, expoPushToken }` (reuse the
same `deviceId` you generate for device-trust login). This is what lets
`POST /errands` with `isBoosted: true` notify nearby top-rated runners once
the boost payment is confirmed. Also call
`PATCH /users/location { latitude, longitude }` periodically from the
runner app (e.g. on foreground, or every few minutes) so "nearby" has
something to match against - there's no location tracking without it.

### AI-Boost flow
`POST /errands` accepts `isBoosted: true`. If set, the response includes a
`boostPayment: { authorizationUrl, reference }` - redirect the user to
`authorizationUrl` to complete the charge, same as the existing
`/payments/initialize` flow. **The boost's effects (AI-rewritten title,
`isBoosted` flag, runner notifications) only apply once the payment is
confirmed via webhook, not immediately on request** - so don't expect
`isBoosted` to be `true` on the errand returned from the initial `POST`.

### Wallet & bills (airtime/data)
Both requesters and runners have a wallet (`GET /wallet` for balance,
`GET /wallet/transactions` for history). It's the only place money moves
through internally now:

- **Funding it**: `POST /payments/initialize { amount }` → redirect to the
  returned `authorizationUrl` to complete a Paystack checkout. Once Paystack
  confirms the charge (webhook, or your app calling
  `POST /payments/verify/:reference` after the redirect back), the wallet
  balance increases. **This replaced the old per-errand escrow flow** - it
  no longer takes an `errandId`, just an `amount`.
- **Posting an errand**: `POST /errands` now debits the wallet for the
  errand's price *at creation time* - there's no separate "pay for this
  errand" step anymore. If the balance can't cover it, errand creation fails
  with a 400 and nothing is created. **Make sure the requester has deposited
  enough before letting them post an errand**, or handle the 400 by
  prompting them to top up.
- **Cancelling**: `DELETE /errands/:id` only works while the errand is still
  `OPEN` (no runner has accepted yet) - it refunds the wallet debit in full.
  Once a runner accepts, cancellation is no longer possible through the API
  at all (contact support for a runner-default/no-show case - there's no
  automated path for that yet).
- **Runner payouts**: a completed errand credits the runner's wallet
  directly (no bank transfer at that point). Withdrawing to a bank account
  is a separate, explicit action: `POST /payments/withdraw` sweeps the
  **entire** wallet balance to the runner's bank, minus a platform
  withdrawal fee (admin-configurable, `withdrawal_fee_percent`, default
  3.5%). It's rejected with a 400 if the balance is below the configurable
  minimum (`min_withdrawal_amount_ngn`, default ₦2,000) or if the runner has
  no approved KYC with bank details on file.
- **Bills** - below the withdrawal minimum, the wallet balance isn't stuck,
  it can be spent directly on airtime/data:
  - `POST /bills/airtime { network, phone, amount }`
  - `GET /bills/data-plans?network=mtn` → list variation codes/prices, then
    `POST /bills/data { network, phone, variationCode }`
  - `GET /bills/history` for past bill purchases
  - `network` is one of `mtn`, `glo`, `airtel`, `9mobile`.
- A failed bill purchase or withdrawal attempt is either automatically
  refunded back to the wallet (a clear rejection) or left in a `pending`
  state for manual reconciliation (an ambiguous network/timeout error) -
  never both charged and refunded.

## 4. Troubleshooting

**"blocked by CORS policy" in the browser console**
→ Your frontend's URL isn't in `CORS_ORIGIN`. Add it, restart the server.

**Server won't start / port already in use (`EADDRINUSE`)**
→ Something else is already running on `PORT`. Either stop it, or change
`PORT` in `.env`.

**`ENOTFOUND` or connection timeout to the database**
→ You're likely using Supabase's "Direct connection" host, which is
IPv6-only. Switch to the **Session pooler** connection details instead (see
section 1).

**`WARN [MailService] RESEND_API_KEY is not set` / `WARN [RedisService]
REDIS_URL is not set`**
→ Expected and harmless until you configure those services - logged once at
startup, doesn't crash anything. Only the specific OTP-dependent endpoints
will fail until you add the keys.

**A specific request fails with "Email sending isn't configured yet" or
"Redis isn't configured"**
→ You hit an OTP-dependent flow (register, login from a new device,
forgot-password, bank-change confirm) without `RESEND_API_KEY`/`REDIS_URL`
set. Add them and restart.

**Migrations fail or tables don't exist**
→ Run `npm run migration:run` after setting up `.env` and before starting
the server for the first time.

If you hit something not listed here, paste the exact error from the
terminal (not just "it doesn't work") and it can be diagnosed quickly.

## 5. What's still pending

- **Expo push receipt handling** - sends are fire-and-forget; there's no
  polling for delivery receipts or pruning of stale/uninstalled tokens yet.
- **Geolocation at scale** - the nearby-runner query is plain SQL (haversine
  formula, no PostGIS/spatial index). Fine at low-thousands-of-runners scale;
  revisit if the runner base grows much larger.
- **Admin role granularity** - all admin accounts currently have identical,
  unrestricted access to every `/admin/*` endpoint. No per-admin permissions.
- **VTpass/withdrawal reconciliation job** - ambiguous failures (network
  errors, timeouts) leave a wallet transaction `pending` rather than
  auto-resolving it. There's no background job that calls VTpass's
  `/requery` endpoint or re-checks a Paystack transfer's status to close
  these out automatically yet - pending transactions need manual review for
  now.
- **VTpass amount units are an unverified assumption** - the integration
  assumes VTpass takes naira (not kobo, unlike Paystack). Run one real
  sandbox airtime purchase and confirm the amount charged matches what you
  sent before enabling this in production - if it's off by 100x, adjust the
  conversion in `VtpassService.purchase`.
- **No runner-default/dispute flow** - once a runner accepts an errand, the
  requester can't cancel it through the API at all, even if the runner never
  shows up or abandons it. That needs manual (or future admin-mediated)
  intervention - not built yet.
