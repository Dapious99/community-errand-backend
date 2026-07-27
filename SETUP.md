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
| [Paystack](https://paystack.com) | Payments (escrow/payout/refund/AI-boost) | No - test keys work, real payment/payout calls fail without real keys | Yes (test mode) |
| [Cloudinary](https://cloudinary.com) | Image/document uploads | No - only `/uploads/*` endpoints need it | Yes |
| [Anthropic](https://console.anthropic.com) | AI features (Magic Post, price estimates, boost title rewrite, smart replies) | No - only `/errands/ai/*`, boost title rewrite, and `/messages/:id/smart-replies` need it | Yes (pay-as-you-go, no free tier, but Haiku is cheap) |

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
  `/auth/reset-password`, `/auth/login/confirm-device`, and
  `/payments/webhook`.

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
tokens the same way a normal login would.

### Bank-change confirmation
`POST /users/kyc` can similarly return
`{ requiresConfirmation: true, message }` instead of the KYC object, if the
runner is changing bank details on an already-approved KYC. Prompt for the
emailed code and call `POST /users/kyc/confirm-bank-change { code }`.

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
