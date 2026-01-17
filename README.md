# Community Errand Backend API

Backend API for Community Errand App built with NestJS, PostgreSQL, and TypeORM.

## Tech Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT (access + refresh tokens)
- **Payments**: Paystack integration
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
   - JWT secrets
   - Paystack keys
   - Cloudinary credentials

5. Run database migrations:
```bash
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
├── auth/              # Authentication module
├── users/             # User management & KYC
├── errands/           # Errand CRUD & status management
├── messages/          # Messaging with WebSockets
├── ratings/           # Ratings & reviews
├── payments/          # Paystack payment integration
├── uploads/           # File upload handling
├── common/            # Shared utilities, guards, decorators
├── config/            # Configuration files
└── main.ts            # Application entry point
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout

### Users
- `GET /api/v1/users/profile` - Get current user profile
- `PATCH /api/v1/users/profile` - Update profile
- `GET /api/v1/users/stats` - Get user statistics

### Errands
- `POST /api/v1/errands` - Create errand
- `GET /api/v1/errands` - List errands (with filters)
- `GET /api/v1/errands/:id` - Get errand details
- `PATCH /api/v1/errands/:id/accept` - Accept errand
- `PATCH /api/v1/errands/:id/status` - Update status

### Messages
- `GET /api/v1/messages/:errandId` - Get message history
- WebSocket: Real-time messaging

### Ratings
- `POST /api/v1/ratings` - Submit rating
- `GET /api/v1/users/:id/ratings` - Get user ratings

### Payments
- `POST /api/v1/payments/initialize` - Initialize payment
- `POST /api/v1/payments/webhook` - Paystack webhook

## Testing

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## License

Private



