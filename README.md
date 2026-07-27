# Community Errand Backend API

Backend API for Community Errand App built with NestJS, PostgreSQL, and TypeORM. Implements the full [PRD](./PRD.md) plus an AI feature suite: auth, errands, real-time messaging, ratings, Paystack payments, a runner wallet, VTpass bill payments, KYC, file uploads, an admin panel, push notifications, geolocation, and Claude-powered AI features.

## Tech Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT (access + refresh tokens) + email OTP for signup verification, password reset, new-device login, and bank-change confirmation. Separate JWT auth for the admin panel.
- **Payments**: Paystack integration (wallet deposit/top-up, AI-boost, wallet withdrawal transfers)
- **Wallet**: In-app ledger shared by both sides of the marketplace - requesters deposit and spend on errands, runners earn and spend/withdraw; airtime/data bill purchases and bank withdrawal are separate explicit actions off that balance
- **Bills**: VTpass integration for airtime/data top-ups
- **File Storage**: Cloudinary
- **Real-time**: Socket.io for messaging
- **Cache/OTP store**: Redis (via ioredis) - OTP codes live here only, never in Postgres
- **Email**: Resend
- **AI**: Anthropic Claude (Haiku 4.5) - structured extraction via forced tool-use
- **Push notifications**: Expo push API
- **Documentation**: Swagger/OpenAPI

## Prerequisites

- Node.js (v18+)
- PostgreSQL (v14+)
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
   - Database credentials
   - JWT secrets (use long random strings in production)
   - Paystack keys (test keys are fine for local dev; payouts/refunds
     gracefully fall back to a PENDING bookkeeping record when Paystack
     calls fail or aren't configured, so the rest of the app still works)
   - Cloudinary credentials
   - `REDIS_URL` (free instance at [upstash.com](https://upstash.com)) and
     `RESEND_API_KEY` (free at [resend.com](https://resend.com)) - required
     for OTP codes to actually send. Without them the app still boots and
     runs fine; only the OTP-dependent endpoints (register's verification
     email, login from a new device, forgot-password, bank-change
     confirmation) return a clear error until configured.

5. Create the database, then run migrations:
```bash
createdb community_errand
npm run migration:run
```

6. Start the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`
Swagger documentation: `http://localhost:3000/api/docs`

## Project Structure

```
src/
├── auth/              # Authentication module (JWT access + refresh, device trust)
├── users/             # User management, KYC submission, geolocation
├── errands/           # Errand CRUD & status management, AI-boost
├── messages/          # Messaging with WebSockets, AI smart replies
├── ratings/           # Ratings & reviews
├── payments/          # Paystack payment integration (wallet deposit/withdrawal transfers, AI-boost)
├── wallet/            # In-app wallet ledger (deposit, errand payment, earning, withdrawal, bill purchase, reversal)
├── bills/             # VTpass airtime/data bill purchases, debited from the wallet
├── uploads/           # File upload handling (Cloudinary)
├── otp/               # OTP generate/verify engine (Redis-backed, 10min TTL, 5 attempts)
├── mail/              # Transactional email (Resend)
├── ai/                # Anthropic Claude integration (Magic Post, pricing, boost title, smart replies)
├── admin/             # Admin auth (separate JWT), settings, KYC moderation
├── settings/          # Runtime-configurable platform settings (key-value store)
├── notifications/     # Expo push token registration + sending
├── common/            # Shared utilities, guards, decorators, transformers, Redis client
├── config/            # Configuration files
└── main.ts            # Application entry point
migrations/            # Hand-authored TypeORM migrations
scripts/               # One-off CLI scripts (e.g. admin account creation)
```

## API Endpoints

All endpoints are prefixed with `/api/v1`. Responses are wrapped as
`{ success, data }` on success (see `TransformInterceptor`) and
`{ statusCode, timestamp, path, message }` on error.

### Authentication
- `POST /auth/register` - Register new user (accepts optional `deviceId` - see [Device trust](#device-trust--otp-flows) below)
- `POST /auth/login` - Login (accepts optional `deviceId`; may return `{ requiresDeviceVerification: true }` instead of tokens)
- `POST /auth/login/confirm-device` - Confirm a new-device login with the emailed code, returns tokens
- `POST /auth/login/resend-device-code` - Resend the new-device login confirmation code (without re-entering the password)
- `POST /auth/refresh` - Refresh access token
- `POST /auth/verify-email` - Confirm the signup verification code
- `POST /auth/resend-verification` - Resend the signup verification code
- `POST /auth/forgot-password` - Request a password reset code by email (safe to call again to resend - it's the same action)
- `POST /auth/reset-password` - Reset password using the emailed code

### Users
- `GET /users/profile` - Get current user profile
- `PATCH /users/profile` - Update profile
- `GET /users/stats` - Get user statistics
- `POST /users/kyc` - Submit/update KYC information (may return `{ requiresConfirmation: true }` if this changes bank details on an already-approved KYC - see below)
- `GET /users/kyc` - Get current user's KYC status
- `POST /users/kyc/confirm-bank-change` - Confirm a pending bank detail change with the emailed code
- `POST /users/kyc/resend-bank-change-code` - Resend the pending bank-change confirmation code (400 if there's no pending change to resend for)
- `PATCH /users/location` - Report the current user's last known location (runners; used for AI-boost's "nearby runners" notification)
- `GET /users/:id/ratings` - Get a user's ratings + rating stats

### Errands
- `POST /errands` - Create errand (accepts optional `isBoosted: true` - see [AI Features](#ai-features) below). **Debits the requester's wallet for the errand price immediately** - if the balance can't cover it, the errand is rejected with a 400 and nothing is created. Deposit first via `POST /payments/initialize` (see Payments below).
- `GET /errands` - List errands (filters: category, status, urgency, price range, search, sortBy, page, limit)
- `GET /errands/my` - Get current user's errands (posted + accepted)
- `GET /errands/:id` - Get errand details
- `PATCH /errands/:id/accept` - Accept errand (runner) - atomic; returns 409 if another runner won the race
- `PATCH /errands/:id/status` - Update errand status
- `DELETE /errands/:id` - Cancel errand. **Only possible while the errand is still `OPEN`** - once a runner has accepted it, this returns a 400 ("already picked up") and there is currently no way to cancel through the API. Cancelling an `OPEN` errand refunds the wallet debit in full.
- `POST /errands/ai/magic-post` - AI Magic Post: extract a draft errand from free text (does not create it)
- `POST /errands/ai/price-estimate` - AI market-rate price range estimate

### Messages
- `GET /messages/:errandId` - Get message history
- `POST /messages/:errandId` - Send a message (REST fallback)
- `GET /messages/:errandId/smart-replies` - AI-suggested quick replies based on recent conversation
- WebSocket namespace `/messages` (JWT in `handshake.auth.token`):
  events `join_errand`, `send_message`, `typing` →
  `joined_errand`, `new_message`, `message_sent`, `user_typing`

### Ratings
- `POST /ratings` - Submit a rating (only after errand completion)
- `GET /ratings/stats/:userId` - Get a user's rating stats

### Payments
- `POST /payments/initialize { amount }` - Initialize a **wallet deposit (top-up)** via Paystack. Returns `{ authorizationUrl, reference }` - redirect the user to `authorizationUrl` to complete the charge. **This used to initialize a per-errand escrow payment; it no longer takes an `errandId` at all** - errand payments are now debited straight from the wallet at creation (see Errands above).
- `POST /payments/verify/:reference` - Verify a transaction against Paystack (resolves a pending deposit if the reference matches one, otherwise falls back to the legacy `Payment` table for AI-Boost/historical rows)
- `POST /payments/webhook` - Paystack webhook (signature-verified via `PAYSTACK_WEBHOOK_SECRET`) - this is what actually credits a deposit to the wallet once Paystack confirms the charge
- `GET /payments/payouts` - Get current user's earning history (reads from the wallet ledger)
- `POST /payments/withdraw` - Sweep the entire wallet balance to the runner's bank (see Wallet section below)

On errand completion, the platform fee (`PLATFORM_FEE_PERCENT`, default 10%)
is deducted and the remainder is **credited to the runner's wallet** - no
bank transfer happens at this point, and no KYC is required yet. On
cancellation (only possible while the errand is still `OPEN` - see Errands
above), the requester's wallet debit is reversed and credited back in full,
instantly - there's no live Paystack refund call anymore for errand
payments.

### Wallet
- `GET /wallet` - Balance, the configurable minimum withdrawal amount, the withdrawal fee percent, and whether withdrawal is currently allowed
- `GET /wallet/transactions?type=deposit|errand_payment|earning|withdrawal|bill_purchase|reversal` - Ledger history, optionally filtered by type

Both sides of the marketplace use the same wallet: requesters fund it via
`POST /payments/initialize` (deposit) and spend from it automatically when
posting an errand (`errand_payment`); runners earn into it on errand
completion (`earning`) and spend/withdraw from it the same way. Withdrawal
(`POST /payments/withdraw`) always sweeps the **entire** balance, minus a
configurable withdrawal fee (`withdrawal_fee_percent`, default 3.5%,
admin-configurable), and requires approved KYC with bank details on file. If
the balance is below the configurable minimum (`min_withdrawal_amount_ngn`,
default ₦2,000), it's rejected - that balance can still be spent directly on
airtime/data via the Bills endpoints below instead of sitting idle.

### Bills (airtime/data, via VTpass)
- `POST /bills/airtime { network, phone, amount }` - Buy airtime from wallet balance
- `POST /bills/data { network, phone, variationCode }` - Buy a data bundle from wallet balance (the amount is resolved server-side from `variationCode`, never trusted from the client)
- `GET /bills/data-plans?network=mtn` - List available data plan variations (code, name, price) for a network
- `GET /bills/history` - Bill purchase history

`network` is one of `mtn`, `glo`, `airtel`, `9mobile`. A rejected purchase
(VTpass responded with a clear failure, or a pre-flight error like missing
credentials) automatically refunds the wallet debit. A network/timeout error
where VTpass never responded is left `pending` for manual reconciliation
rather than risking a double-spend by auto-refunding - see Known Limitations.

### Uploads
- `POST /uploads/image` - Upload a single image (max 5MB)
- `POST /uploads/images` - Upload up to 10 images
- `POST /uploads/document` - Upload a document (PDF/image, max 10MB)

### Notifications
- `POST /notifications/register-token` - Register/update this device's Expo push token

### Admin (separate auth - see below)
- `POST /admin/auth/login` - Admin login
- `GET /admin/settings` - List all platform settings
- `PATCH /admin/settings/:key` - Create or update a platform setting (e.g. `ai_boost_price_ngn`)
- `GET /admin/kyc?status=pending` - List KYC submissions, optionally filtered by status
- `GET /admin/kyc/:userId` - Get a user's KYC submission
- `PATCH /admin/kyc/:userId/approve` - Approve a KYC submission
- `PATCH /admin/kyc/:userId/reject` - Reject a KYC submission (body: `{ reason }`)

## Device Trust & OTP Flows

Four flows send a 6-digit code (10-minute expiry, 5 attempts before it's
invalidated, stored only in Redis - never in Postgres):

1. **Signup verification** - `register()` sends a code automatically. Confirm
   with `POST /auth/verify-email { email, code }`. Registration succeeds and
   returns tokens immediately either way - verification doesn't block login,
   it just flips `verified: true` once confirmed.
2. **Password reset** - `POST /auth/forgot-password { email }` →
   `POST /auth/reset-password { email, code, newPassword }`. Both
   forgot-password and resend-verification always return the same generic
   message regardless of whether the account exists, to avoid leaking which
   emails are registered. There's no separate "resend" endpoint for this
   flow - `forgot-password` is safe to call again any time and **is** the
   resend action (it always issues a fresh code).
3. **New-device login** - this is the one with a frontend requirement:
   **generate a random ID once (e.g. `crypto.randomUUID()`), persist it in
   AsyncStorage/localStorage, and send it as `deviceId` on every
   `POST /auth/register` and `POST /auth/login` call.** A login from a
   `deviceId` the backend hasn't seen for that user returns
   `{ requiresDeviceVerification: true, message }` instead of tokens; the
   backend has already emailed a code. Call
   `POST /auth/login/confirm-device { email, deviceId, code }` to complete
   login and trust that device going forward. If you never send a
   `deviceId`, every login will require this extra step. If the code expires
   or wasn't received, call `POST /auth/login/resend-device-code { email, deviceId }`
   to get a fresh one without re-submitting the password (same
   enumeration-safe generic response as forgot-password/resend-verification).
4. **Bank detail change** - once a runner's KYC is `APPROVED`, changing
   `bankAccountNumber`/`bankName` via `POST /users/kyc` doesn't apply
   immediately - it emails a code and returns
   `{ requiresConfirmation: true }`. Call
   `POST /users/kyc/confirm-bank-change { code }` to apply it (this also
   resets KYC status back to `PENDING` for re-review). Other KYC fields
   (ID card, BVN) still apply immediately even on an approved KYC. If the
   code expires, `POST /users/kyc/resend-bank-change-code` (no body needed)
   issues a fresh one without resubmitting the bank details - this one isn't
   enumeration-sensitive (it's behind the JWT, keyed to the caller), so it
   returns a direct 400 if there's nothing pending to resend.

All four flows share the same underlying `OtpService.resend()` mechanism
(except signup, whose "resend" predates it and is a dedicated action since
`register()` itself can't be safely re-called for an existing account) - it
reuses whatever metadata was stored with the original code and issues a
fresh one with a full TTL and reset attempt counter.

## Admin Panel Authentication

Admins are a **separate entity from `User`**, with their own JWT secret
(`ADMIN_JWT_SECRET`, distinct from customer `JWT_SECRET`) and their own
short-lived token (default 4h). There's no self-signup - create the first
admin via:

```bash
npm run admin:create -- --email=you@example.com --name="Ops" --password="..."
```

Then `POST /admin/auth/login` to get an admin access token for the
`/admin/*` endpoints. All admin accounts currently have identical,
unrestricted access - there's no per-admin role/permission system yet.

## AI Features

Powered by Anthropic Claude (`claude-haiku-4-5`), using forced tool-use with
`strict: true` for reliable structured extraction rather than prompt-and-parse.
None of these mutate the database - they return a preview/suggestion for the
caller to act on.

- **AI Magic Post** - `POST /errands/ai/magic-post { text }` turns a free-text
  description ("pick up a pizza from Domino's on 5th in 30 mins") into a
  structured draft (title, description, category, urgency, pickup label,
  recommended price) for the user to review/edit before actually posting.
- **Dynamic pricing** - `POST /errands/ai/price-estimate` returns a
  `{ min, max }` NGN range for a "Market Rate: ₦X - ₦Y" badge.
- **AI-Boost** - see the flow below.
- **Smart replies** - `GET /messages/:errandId/smart-replies` returns up to 3
  short quick-reply suggestions based on the last 10 messages.

### AI-Boost flow (monetization)

`POST /errands` with `isBoosted: true` charges a configurable NGN fee via a
**direct Paystack checkout** (admin-configurable at runtime: `PATCH /admin/settings/ai_boost_price_ngn { "value": 2500 }`,
default ₦2,500 - **confirm the real sticker price**, since there's no live
USD→NGN conversion anywhere in this codebase). The response includes
`boostPayment: { authorizationUrl, reference }` for the frontend to redirect
to checkout. Unlike the errand's base price, the boost fee does **not** come
out of the wallet - it's a separate charge, unrelated to wallet balance.

**Important: the boost is payment-gated, not optimistic.** The perks
(AI-rewritten title, `isBoosted: true` flag, and a push notification to
nearby top-rated runners) only activate once Paystack confirms the charge
succeeded via webhook (`payment.boost.succeeded` event, handled in
`ErrandsService`) - not the moment checkout is initialized. So the errand
returned from the initial `POST /errands` call will have `isBoosted: false`
until the payment completes.

"Nearby" comes from `PATCH /users/location`, which runners should call
periodically - there's no location tracking without it, and no push
notification without a registered Expo token
(`POST /notifications/register-token`).

## Testing

```bash
# unit tests
npm run test

# e2e tests (requires a running Postgres instance configured via .env)
npm run test:e2e

# test coverage
npm run test:cov
```

Unit tests currently cover the core business logic in `auth`, `errands`,
`ratings`, `payments` (status transitions, permission checks, fee
calculations, refund fallback behavior, boost payment gating, wallet-based
payout crediting, withdrawal fee math and reversal/ambiguous-error handling),
`wallet` (atomic credit/debit, insufficient-balance rejection, reversal),
`bills` (VTpass purchase success/rejection/ambiguous-error handling), `otp`,
and `users` (KYC bank-change gating). Expanding coverage to the
remaining controllers/services (`admin`, `settings`, `notifications`, `ai`)
is still open - see [PRD.md](./PRD.md#testing-requirements) for the target.

## Database Migrations

```bash
npm run migration:generate -- -n MigrationName   # diff entities against the DB
npm run migration:run                            # apply pending migrations
npm run migration:revert                         # roll back the last migration
```

`DB_SYNCHRONIZE` should stay `false` outside of quick local prototyping -
migrations are the source of truth for schema changes.

## Known Limitations

See [PRD.md](./PRD.md#known-limitations) for the original PRD's list
(payment disputes are handled manually, etc.). Beyond that:

- No per-admin role/permission system - every admin account has identical access.
- No Expo push delivery-receipt handling or stale-token pruning.
- Geolocation "nearby" query is plain SQL (no PostGIS) - fine at low-thousands-of-runners scale.
- No automatic reconciliation job for ambiguous wallet withdrawal/bill-purchase failures (network errors, timeouts) - they're left `pending` for manual review rather than auto-resolved via VTpass's `/requery` or a Paystack transfer status check.
- VTpass amounts are assumed to be naira (not kobo, unlike Paystack) - unverified against a real sandbox call; confirm before enabling in production.
- No "runner default" / dispute resolution flow - once a runner accepts an errand, the requester can no longer cancel it through the API at all, even if the runner abandons or fails to complete it. Handling that case today requires manual intervention (e.g. directly in the database); a proper admin-mediated force-cancel/refund path is a good next addition.

## License

Private
