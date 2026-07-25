# Community Errand Backend API

Backend API for Community Errand App built with NestJS, PostgreSQL, and TypeORM. Implements the full [PRD](./PRD.md): auth, errands, real-time messaging, ratings, Paystack payments/payouts, KYC, and file uploads.

## Tech Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT (access + refresh tokens)
- **Payments**: Paystack integration (escrow, payout, refund)
- **File Storage**: Cloudinary
- **Real-time**: Socket.io for messaging
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
├── auth/              # Authentication module (JWT access + refresh)
├── users/             # User management, KYC submission
├── errands/           # Errand CRUD & status management
├── messages/          # Messaging with WebSockets
├── ratings/           # Ratings & reviews
├── payments/          # Paystack payment integration (escrow/payout/refund)
├── uploads/           # File upload handling (Cloudinary)
├── common/            # Shared utilities, guards, decorators, transformers
├── config/            # Configuration files
└── main.ts            # Application entry point
migrations/            # Hand-authored TypeORM migrations
```

## API Endpoints

All endpoints are prefixed with `/api/v1`. Responses are wrapped as
`{ success, data }` on success (see `TransformInterceptor`) and
`{ statusCode, timestamp, path, message }` on error.

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh access token

### Users
- `GET /users/profile` - Get current user profile
- `PATCH /users/profile` - Update profile
- `GET /users/stats` - Get user statistics
- `POST /users/kyc` - Submit/update KYC information
- `GET /users/kyc` - Get current user's KYC status
- `GET /users/:id/ratings` - Get a user's ratings + rating stats

### Errands
- `POST /errands` - Create errand
- `GET /errands` - List errands (filters: category, status, urgency, price range, search, sortBy, page, limit)
- `GET /errands/my` - Get current user's errands (posted + accepted)
- `GET /errands/:id` - Get errand details
- `PATCH /errands/:id/accept` - Accept errand (runner)
- `PATCH /errands/:id/status` - Update errand status
- `DELETE /errands/:id` - Cancel errand (triggers a refund if escrow was paid)

### Messages
- `GET /messages/:errandId` - Get message history
- `POST /messages/:errandId` - Send a message (REST fallback)
- WebSocket namespace `/messages` (JWT in `handshake.auth.token`):
  events `join_errand`, `send_message`, `typing` →
  `joined_errand`, `new_message`, `message_sent`, `user_typing`

### Ratings
- `POST /ratings` - Submit a rating (only after errand completion)
- `GET /ratings/stats/:userId` - Get a user's rating stats

### Payments
- `POST /payments/initialize` - Initialize escrow payment for an errand
- `POST /payments/verify/:reference` - Verify a transaction against Paystack
- `POST /payments/webhook` - Paystack webhook (signature-verified via `PAYSTACK_WEBHOOK_SECRET`)
- `GET /payments/payouts` - Get current user's payout history

Payouts (on errand completion) and refunds (on cancellation) are handled
automatically: the platform fee (`PLATFORM_FEE_PERCENT`, default 10%) is
deducted, and a real Paystack transfer/refund is attempted when the runner
has approved KYC with bank details on file. If that isn't possible, a
`PENDING` payment record is created instead so it can be settled manually -
errand completion/cancellation is never blocked by payment provider issues.

### Uploads
- `POST /uploads/image` - Upload a single image (max 5MB)
- `POST /uploads/images` - Upload up to 10 images
- `POST /uploads/document` - Upload a document (PDF/image, max 10MB)

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
`ratings`, and `payments` (status transitions, permission checks, fee
calculations, payout/refund fallback behavior). Expanding coverage to the
remaining controllers/services is still open - see [PRD.md](./PRD.md#testing-requirements)
for the target.

## Database Migrations

```bash
npm run migration:generate -- -n MigrationName   # diff entities against the DB
npm run migration:run                            # apply pending migrations
npm run migration:revert                         # roll back the last migration
```

`DB_SYNCHRONIZE` should stay `false` outside of quick local prototyping -
migrations are the source of truth for schema changes.

## Known Limitations

See [PRD.md](./PRD.md#known-limitations) - notably, KYC approval is manual
(no admin endpoint exists yet to move a submission from `PENDING` to
`APPROVED`), and payment disputes are handled manually.

## License

Private
