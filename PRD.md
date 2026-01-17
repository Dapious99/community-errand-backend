# Community Errand Platform - Product Requirements Document (PRD)

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Backend API Specifications](#backend-api-specifications)
4. [Mobile Application Specifications](#mobile-application-specifications)
5. [Web Application Specifications](#web-application-specifications)
6. [Database Schema](#database-schema)
7. [API Endpoints Reference](#api-endpoints-reference)
8. [User Flows](#user-flows)
9. [Technical Requirements](#technical-requirements)
10. [Security & Compliance](#security--compliance)
11. [Testing Requirements](#testing-requirements)
12. [Deployment Guidelines](#deployment-guidelines)

---

## Executive Summary

### Project Overview
Community Errand is a peer-to-peer errand service platform that connects people who need tasks completed (Requesters) with individuals who can complete those tasks (Runners). The platform facilitates local errands such as deliveries, shopping, queue services, repairs, and custom tasks.

### Objectives
- Enable seamless connection between requesters and runners
- Provide secure payment processing with escrow functionality
- Ensure user trust through ratings, reviews, and KYC verification
- Deliver real-time communication between parties
- Support multiple platforms (Mobile iOS/Android and Web)

### Target Users
- **Requesters**: Individuals who need errands completed
- **Runners**: Individuals who complete errands for compensation
- **Both**: Users who can both request and run errands

### Key Features
- User authentication and profile management
- Errand posting and discovery
- Real-time messaging
- Secure payment processing (Paystack integration)
- Rating and review system
- KYC verification for runners
- Location-based services
- Media attachments for errands
- Multi-platform support (Mobile & Web)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │     │    Web App      │
│  (React Native) │     │   (Next.js)     │
└────────┬────────┘     └────────┬────────┘
         │                        │
         └────────────┬───────────┘
                      │
         ┌────────────▼────────────┐
         │   Backend API (NestJS)   │
         │   - REST API             │
         │   - WebSocket Gateway    │
         └────────────┬─────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼────┐  ┌────▼────┐  ┌───▼────┐
    │PostgreSQL│  │Cloudinary│  │Paystack│
    │ Database │  │  Storage │  │Payment │
    └──────────┘  └──────────┘  └────────┘
```

### Technology Stack

#### Backend
- **Framework**: NestJS 10.x with TypeScript
- **Database**: PostgreSQL 14+ with TypeORM
- **Authentication**: JWT (Access + Refresh tokens)
- **Real-time**: Socket.io (WebSocket)
- **Payment**: Paystack API
- **File Storage**: Cloudinary
- **Documentation**: Swagger/OpenAPI
- **Security**: Helmet, CORS, bcrypt

#### Mobile App
- **Framework**: React Native with Expo (~54.0)
- **Navigation**: React Navigation (Native Stack)
- **State Management**: Context API
- **Maps**: React Native Maps
- **Location**: Expo Location
- **Image Picker**: Expo Image Picker
- **Styling**: NativeWind (Tailwind CSS)
- **Storage**: AsyncStorage

#### Web App
- **Framework**: Next.js 15.x (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.x
- **UI Components**: Ant Design, Lucide React
- **Forms**: React Hook Form, Formik, Yup, Zod
- **Animations**: Lottie React

---

## Backend API Specifications

### Module Structure

```
src/
├── auth/              # Authentication & JWT
├── users/             # User management & KYC
├── errands/           # Errand CRUD & status management
├── messages/          # Real-time messaging (WebSocket)
├── ratings/           # Ratings & reviews
├── payments/          # Paystack payment integration
├── uploads/           # File upload handling (Cloudinary)
├── common/            # Shared utilities, guards, decorators
└── config/            # Configuration files
```

### 1. Authentication Module

#### Features
- User registration with email/password
- User login with JWT token generation
- Refresh token mechanism
- Password hashing with bcrypt
- JWT authentication guards

#### DTOs
- `CreateUserDto`: email, phone (optional), name, password, role
- `LoginDto`: email, password
- `RefreshTokenDto`: refreshToken

#### Endpoints
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token

#### Security
- Passwords hashed with bcrypt (salt rounds: 10)
- JWT tokens with expiration (access: 15min, refresh: 7 days)
- Refresh tokens stored securely
- Protected routes with JWT guards

### 2. User Management Module

#### Features
- User profile management
- KYC verification system
- User statistics
- Role management (Requester, Runner, Both)
- Avatar upload

#### User Entity Fields
- `id`: UUID (Primary Key)
- `email`: Unique, indexed
- `phone`: Unique, optional, indexed
- `name`: Required
- `passwordHash`: Hashed password
- `role`: Enum (REQUESTER, RUNNER, BOTH)
- `verified`: Boolean
- `ratingAvg`: Decimal (0-5)
- `avatarUrl`: Optional
- `createdAt`, `updatedAt`: Timestamps

#### KYC Entity Fields
- `id`: UUID
- `userId`: Foreign key to User
- `bvn`: Optional (Bank Verification Number)
- `idCardUrl`: Optional (ID card image)
- `bankAccountNumber`: Optional
- `bankName`: Optional
- `status`: Enum (PENDING, APPROVED, REJECTED)
- `verifiedAt`: Optional timestamp

#### Endpoints
- `GET /api/v1/users/profile` - Get current user profile
- `PATCH /api/v1/users/profile` - Update profile
- `GET /api/v1/users/stats` - Get user statistics
- `POST /api/v1/users/kyc` - Submit KYC information
- `GET /api/v1/users/:id/ratings` - Get user ratings

### 3. Errand Management Module

#### Features
- Create errands with detailed information
- Filter and search errands
- Accept errands (runners)
- Update errand status
- Cancel errands
- Location management (pickup/dropoff)
- Media attachments
- Time windows for completion
- Urgency levels

#### Errand Entity Fields
- `id`: UUID
- `title`: Required, min 3 chars
- `description`: Required, min 10 chars
- `category`: Enum (DELIVERY, BUY_FOR_ME, QUEUE, REPAIR, CUSTOM)
- `price`: Decimal (required, min 1)
- `tip`: Decimal (optional, min 0)
- `status`: Enum (OPEN, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED)
- `urgency`: Enum (LOW, MEDIUM, HIGH, URGENT)
- `requesterId`: Foreign key to User
- `runnerId`: Optional, foreign key to User
- `etaMinutes`: Optional (Estimated time)
- `timeWindowStart`: Optional timestamp
- `timeWindowEnd`: Optional timestamp
- `completedAt`: Optional timestamp
- `createdAt`, `updatedAt`: Timestamps

#### Location Entity Fields
- `id`: UUID
- `errandId`: Foreign key to Errand
- `type`: Enum (PICKUP, DROPOFF)
- `label`: Required (address/location name)
- `latitude`: Optional decimal
- `longitude`: Optional decimal

#### Media Attachment Entity Fields
- `id`: UUID
- `errandId`: Foreign key to Errand
- `url`: Required (Cloudinary URL)
- `cloudinaryId`: Optional
- `type`: Enum (IMAGE, VIDEO, DOCUMENT)

#### Endpoints
- `POST /api/v1/errands` - Create new errand
- `GET /api/v1/errands` - List errands (with filters)
- `GET /api/v1/errands/my` - Get current user's errands
- `GET /api/v1/errands/:id` - Get errand details
- `PATCH /api/v1/errands/:id/accept` - Accept errand (runner)
- `PATCH /api/v1/errands/:id/status` - Update errand status
- `DELETE /api/v1/errands/:id` - Cancel errand

#### Filter Options
- Category filter
- Status filter
- Price range (min/max)
- Location-based (future)
- Sort by: newest, price_high, price_low, distance

### 4. Messaging Module

#### Features
- Real-time messaging via WebSocket
- Message history persistence
- Typing indicators
- Errand-specific chat rooms
- Message notifications

#### Message Entity Fields
- `id`: UUID
- `errandId`: Foreign key to Errand
- `fromUserId`: Foreign key to User
- `text`: Required
- `createdAt`: Timestamp

#### WebSocket Events
- `join_errand`: Join errand chat room
- `send_message`: Send message
- `typing`: Typing indicator
- `new_message`: Receive new message (broadcast)
- `message_sent`: Confirm message sent
- `user_typing`: Receive typing indicator
- `joined_errand`: Confirm room joined

#### REST Endpoints
- `GET /api/v1/messages/:errandId` - Get message history

#### WebSocket Gateway
- Namespace: `/messages`
- Authentication: JWT token in handshake
- Room structure: `errand:{errandId}`

### 5. Ratings Module

#### Features
- Submit ratings after errand completion
- 1-5 star rating system
- Optional review text
- User rating averages
- Rating history

#### Rating Entity Fields
- `id`: UUID
- `errandId`: Foreign key to Errand
- `fromUserId`: Foreign key to User (rater)
- `toUserId`: Foreign key to User (rated)
- `rating`: Integer (1-5)
- `review`: Optional text
- `createdAt`: Timestamp

#### Endpoints
- `POST /api/v1/ratings` - Submit rating
- `GET /api/v1/users/:id/ratings` - Get user ratings

#### Business Rules
- Only one rating per errand per user
- Can only rate after errand completion
- Cannot rate yourself
- Rating updates user's average rating

### 6. Payments Module

#### Features
- Paystack payment integration
- Escrow payment system
- Payment initialization
- Payment verification via webhook
- Payout to runners
- Refund handling

#### Payment Entity Fields
- `id`: UUID
- `errandId`: Foreign key to Errand
- `userId`: Foreign key to User
- `amount`: Decimal
- `type`: Enum (ESCROW, PAYOUT, REFUND)
- `status`: Enum (PENDING, PROCESSING, SUCCESS, FAILED, CANCELLED)
- `paystackReference`: Unique, optional
- `paystackAuthorizationUrl`: Optional
- `description`: Optional text
- `createdAt`, `updatedAt`: Timestamps

#### Payment Flow
1. Requester creates errand
2. Payment initialized (escrow)
3. Requester completes Paystack payment
4. Webhook verifies payment
5. Payment status updated to SUCCESS
6. On errand completion, payout to runner
7. Platform fee deducted (10%)

#### Endpoints
- `POST /api/v1/payments/initialize` - Initialize payment
- `POST /api/v1/payments/webhook` - Paystack webhook handler
- `GET /api/v1/payments/:id` - Get payment details

#### Platform Fee
- Default: 10% of errand price
- Deducted from escrow before payout
- Runner receives: price - platform fee

### 7. File Upload Module

#### Features
- Image upload to Cloudinary
- Support for multiple file types
- Automatic optimization
- Secure upload URLs

#### Endpoints
- `POST /api/v1/uploads/image` - Upload image
- `POST /api/v1/uploads/document` - Upload document

#### Supported Formats
- Images: JPEG, PNG, WebP
- Documents: PDF (future)

---

## Mobile Application Specifications

### Navigation Structure

```
App
├── Splash Screen
├── Auth Stack
│   ├── Login
│   └── SignUp
└── Main Stack
    ├── Home
    ├── PostErrand
    ├── ErrandDetail
    ├── Profile
    └── Messaging
```

### Screen Specifications

#### 1. Splash Screen
- **Purpose**: Initial loading and authentication check
- **Features**:
  - App logo/branding
  - Loading indicator
  - Check authentication status
  - Navigate to Auth or Main stack

#### 2. Authentication Screens

##### Login Screen
- **Fields**: Email, Password
- **Actions**: Login, Navigate to SignUp
- **Validation**: Email format, password required
- **Features**: Remember me (future)

##### SignUp Screen
- **Fields**: Name, Email, Phone (optional), Password, Confirm Password, Role selection
- **Actions**: Register, Navigate to Login
- **Validation**: All fields validated
- **Features**: Role toggle (Requester/Runner/Both)

#### 3. Home Screen
- **Purpose**: Main errand discovery and management
- **Features**:
  - Role toggle (Requester/Runner view)
  - Search bar
  - Filter button with modal
  - Tab switcher: "Open errands" / "My errands"
  - Errand cards list
  - Post errand button
  - Profile navigation

##### Filter Modal
- **Options**:
  - Category filter
  - Status filter
  - Price range (min/max)
  - Sort by (newest, price_high, price_low, distance)
- **Actions**: Apply filters, Clear filters

##### Errand Card Display
- Title
- Category badge
- Price
- Pickup/Dropoff locations
- Urgency indicator
- Requester info (avatar, name, rating)
- Status badge
- Time posted

#### 4. Post Errand Screen
- **Purpose**: Create new errand
- **Form Fields**:
  - Title (required, min 3 chars)
  - Description (required, min 10 chars)
  - Category selector
  - Urgency level (Low, Medium, High, Urgent)
  - Pickup location (with map picker)
  - Dropoff location (with map picker)
  - Time window toggle (optional)
    - Start datetime
    - End datetime
  - Media attachments (images)
  - Budget (required)
  - Tip (optional)
- **Features**:
  - Fee breakdown display
    - Budget
    - Platform fee (10%)
    - Runner earnings
    - Tip
    - Total cost
  - Image picker (multiple images)
  - Location picker with map integration
  - Form validation
- **Actions**: Submit errand, Cancel

#### 5. Errand Detail Screen
- **Purpose**: View errand details and take actions
- **Information Display**:
  - Title and description
  - Category and urgency
  - Price and tip
  - Pickup and dropoff locations (with map)
  - Media attachments gallery
  - Time window (if applicable)
  - Requester profile (avatar, name, rating, verified status)
  - Runner profile (if accepted)
  - Status and timestamps
- **Actions** (context-dependent):
  - Accept errand (if runner and status is OPEN)
  - Update status (if runner and accepted)
  - Cancel errand (if requester and not completed)
  - Start messaging
  - View ratings
  - Complete payment (if requester)

#### 6. Messaging Screen
- **Purpose**: Real-time chat for errand communication
- **Features**:
  - Message list (chronological)
  - Message bubbles (sent/received)
  - Typing indicators
  - Send message input
  - Errand context display
  - User avatars
- **Real-time**: WebSocket connection for live updates

#### 7. Profile Screen
- **Purpose**: User profile and settings
- **Information Display**:
  - User avatar (editable)
  - Name and email
  - Phone number
  - Role (Requester/Runner/Both)
  - Verification status
  - Average rating
  - Statistics:
    - Errands posted
    - Errands completed
    - Total earnings (if runner)
- **Actions**:
  - Edit profile
  - Switch role
  - KYC submission (if runner)
  - View ratings
  - Logout

### Components

#### Shared Components
- `ErrandCard`: Displays errand summary
- `RoleToggle`: Switch between Requester/Runner view
- `SearchBar`: Search input with clear button
- `FilterModal`: Filter options modal
- `CategorySelector`: Category selection UI
- `LocationPicker`: Location input with map
- `MapView`: Map display component
- `MessageBubble`: Chat message display
- `RatingDisplay`: Star rating display
- `RatingModal`: Submit rating modal
- `StatusBadge`: Errand status indicator
- `StatsCard`: Statistics display card

### State Management
- **Context API**: `ErrandContext` for global state
- **State Includes**:
  - Current user
  - Errands list
  - Users list
  - Loading states
  - Authentication state

### API Integration
- Base URL: Configurable environment variable
- Authentication: JWT token in Authorization header
- Error handling: User-friendly error messages
- Loading states: Loading indicators during API calls

---

## Web Application Specifications

### Page Structure

```
Web App
├── Landing Page (/)
├── Auth Pages
│   ├── Login (/auth/login)
│   └── Register (/auth/register)
└── Web App (Protected)
    ├── Dashboard (/dashboard)
    ├── Errands (/errands)
    ├── Profile (/profile)
    └── Admin (future)
```

### Page Specifications

#### 1. Landing Page (/)
- **Purpose**: Public landing/marketing page
- **Features**: Hero section, features, CTA buttons

#### 2. Authentication Pages

##### Login Page (/auth/login)
- **Components**: `LoginForm`
- **Fields**: Email, Password
- **Actions**: Login, Navigate to Register
- **Validation**: Email format, required fields

##### Register Page (/auth/register)
- **Components**: `RegisterForm`
- **Fields**: Name, Email, Phone (optional), Password, Confirm Password, Role
- **Actions**: Register, Navigate to Login
- **Validation**: Comprehensive form validation

#### 3. Dashboard Page (/dashboard)
- **Purpose**: Main errand discovery
- **Features**:
  - Map view (placeholder)
  - Search bar
  - Post errand button
  - Tab switcher: Latest, Nearby, Urgent
  - Errand cards grid/list
  - Filter options
- **Components**:
  - `DashboardCard`: Errand card component
  - `ErrandsForm`: Modal form for posting errands

#### 4. Errands Page (/errands)
- **Purpose**: Detailed errand management
- **Features**: (To be implemented)
  - Errand list view
  - Filter and search
  - Status management

#### 5. Profile Page (/profile)
- **Purpose**: User profile management
- **Features**:
  - Profile information display
  - Edit profile form
  - Statistics dashboard
  - KYC submission (if runner)
  - Ratings display

### Components Structure

```
components/
├── layout/
│   └── Layout.tsx (App layout wrapper)
├── shared/
│   ├── Button.tsx
│   ├── DisplayModal.tsx
│   └── (other shared components)
└── ui/
    └── (UI components)
```

### Routing
- **Framework**: Next.js App Router
- **Protected Routes**: Middleware for authentication
- **Route Groups**: `(webapp)` for protected routes

### Styling
- **Framework**: Tailwind CSS 4.x
- **UI Library**: Ant Design 5.x
- **Icons**: Lucide React
- **Responsive**: Mobile-first design

---

## Database Schema

### Entity Relationship Diagram

```
Users
├── id (PK, UUID)
├── email (Unique, Indexed)
├── phone (Unique, Optional, Indexed)
├── name
├── passwordHash
├── role (Enum)
├── verified
├── ratingAvg
├── avatarUrl
└── timestamps

KYC
├── id (PK, UUID)
├── userId (FK → Users)
├── bvn
├── idCardUrl
├── bankAccountNumber
├── bankName
├── status (Enum)
└── timestamps

Errands
├── id (PK, UUID)
├── title
├── description
├── category (Enum)
├── price
├── tip
├── status (Enum)
├── urgency (Enum)
├── requesterId (FK → Users)
├── runnerId (FK → Users, Optional)
├── etaMinutes
├── timeWindowStart
├── timeWindowEnd
├── completedAt
└── timestamps

Locations
├── id (PK, UUID)
├── errandId (FK → Errands)
├── type (Enum: PICKUP/DROPOFF)
├── label
├── latitude
└── longitude

MediaAttachments
├── id (PK, UUID)
├── errandId (FK → Errands)
├── url
├── cloudinaryId
└── type (Enum)

Messages
├── id (PK, UUID)
├── errandId (FK → Errands)
├── fromUserId (FK → Users)
├── text
└── createdAt

Ratings
├── id (PK, UUID)
├── errandId (FK → Errands)
├── fromUserId (FK → Users)
├── toUserId (FK → Users)
├── rating (1-5)
├── review
└── createdAt

Payments
├── id (PK, UUID)
├── errandId (FK → Errands)
├── userId (FK → Users)
├── amount
├── type (Enum)
├── status (Enum)
├── paystackReference (Unique)
├── paystackAuthorizationUrl
├── description
└── timestamps
```

### Relationships
- User 1:1 KYC
- User 1:N Errands (as requester)
- User 1:N Errands (as runner)
- User 1:N Messages
- User 1:N Ratings (given)
- User 1:N Ratings (received)
- Errand 1:N Locations
- Errand 1:N MediaAttachments
- Errand 1:N Messages
- Errand 1:N Ratings
- Errand 1:N Payments

### Indexes
- Users: email, phone
- Errands: status + createdAt (composite)
- Messages: errandId + createdAt (composite)
- Ratings: toUserId + createdAt (composite), errandId
- Payments: errandId + status (composite), userId + status (composite)

---

## API Endpoints Reference

### Base URL
- Development: `http://localhost:3000`
- Production: (To be configured)

### API Prefix
- `/api/v1`

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login user | No |
| POST | `/auth/refresh` | Refresh access token | No |

### User Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/users/profile` | Get current user profile | Yes |
| PATCH | `/users/profile` | Update user profile | Yes |
| GET | `/users/stats` | Get user statistics | Yes |
| GET | `/users/:id/ratings` | Get user ratings | Yes |

### Errand Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/errands` | Create new errand | Yes |
| GET | `/errands` | List errands (with filters) | Yes |
| GET | `/errands/my` | Get user's errands | Yes |
| GET | `/errands/:id` | Get errand details | Yes |
| PATCH | `/errands/:id/accept` | Accept errand | Yes |
| PATCH | `/errands/:id/status` | Update errand status | Yes |
| DELETE | `/errands/:id` | Cancel errand | Yes |

### Message Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/messages/:errandId` | Get message history | Yes |

### Rating Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/ratings` | Submit rating | Yes |

### Payment Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/payments/initialize` | Initialize payment | Yes |
| POST | `/payments/webhook` | Paystack webhook | No |
| GET | `/payments/:id` | Get payment details | Yes |

### Upload Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/uploads/image` | Upload image | Yes |
| POST | `/uploads/document` | Upload document | Yes |

### Authentication
- **Header**: `Authorization: Bearer {access_token}`
- **Token Expiry**: 15 minutes (access), 7 days (refresh)

### Response Format
```json
{
  "success": true,
  "data": {},
  "message": "Success message"
}
```

### Error Format
```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 400
}
```

---

## User Flows

### Flow 1: User Registration and First Errand

1. User opens app/web
2. Navigate to Sign Up
3. Fill registration form (name, email, password, role)
4. Submit registration
5. Auto-login after registration
6. Navigate to Home
7. Click "Post Errand"
8. Fill errand form:
   - Title, description, category
   - Pickup and dropoff locations
   - Budget and optional tip
   - Media attachments (optional)
   - Time window (optional)
9. Submit errand
10. Errand appears in "My errands" tab
11. Wait for runner to accept

### Flow 2: Runner Accepts and Completes Errand

1. Runner opens app/web
2. View "Open errands" tab
3. Browse available errands
4. Apply filters (category, price range, etc.)
5. Select errand to view details
6. Review errand details (locations, price, requester rating)
7. Click "Accept Errand"
8. Errand status changes to "ACCEPTED"
9. Navigate to messaging to communicate with requester
10. Update status to "IN_PROGRESS" when starting
11. Complete errand tasks
12. Update status to "COMPLETED"
13. Requester confirms completion
14. Payment released to runner (minus platform fee)
15. Both parties can rate each other

### Flow 3: Payment Flow

1. Requester creates errand with budget
2. System calculates:
   - Budget: ₦X
   - Platform fee (10%): ₦Y
   - Runner earnings: ₦(X - Y)
   - Total cost: ₦X + tip
3. Requester clicks "Pay" or payment auto-initialized
4. Redirected to Paystack payment page
5. Complete payment
6. Paystack webhook verifies payment
7. Payment status updated to SUCCESS
8. Errand status can now be ACCEPTED
9. On completion, payout initiated to runner
10. Runner receives payment (minus platform fee)

### Flow 4: Real-time Messaging

1. User opens errand detail
2. Clicks "Message" or "Start Chat"
3. WebSocket connection established
4. Join errand chat room
5. View message history
6. Type and send message
7. Message appears in real-time for both parties
8. Typing indicators shown
9. Messages persisted to database

### Flow 5: Rating and Review

1. Errand marked as COMPLETED
2. Both parties receive notification to rate
3. User opens errand detail or rating prompt
4. Select rating (1-5 stars)
5. Optionally add review text
6. Submit rating
7. Rating saved and user's average updated
8. Rating visible on user profile

### Flow 6: KYC Verification (Runner)

1. User switches role to Runner or Both
2. Navigate to Profile
3. Click "Verify Identity" or "Submit KYC"
4. Fill KYC form:
   - BVN (optional)
   - Upload ID card
   - Bank account number
   - Bank name
5. Submit KYC
6. Status: PENDING
7. Admin reviews (future: automated)
8. Status updated to APPROVED or REJECTED
9. Verified badge shown on profile

---

## Technical Requirements

### Backend Requirements

#### Environment Variables
```env
# Server
PORT=3000
API_PREFIX=api/v1
NODE_ENV=development|production
CORS_ORIGIN=http://localhost:3001,http://localhost:19006

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=community_errand
DB_SYNCHRONIZE=false

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# Paystack
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

#### Dependencies
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

#### Installation Steps
1. Clone repository
2. Install dependencies: `npm install`
3. Create `.env` file with required variables
4. Run migrations: `npm run migration:run`
5. Start development server: `npm run start:dev`

### Mobile App Requirements

#### Environment Variables
```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

#### Dependencies
- Node.js 18+
- Expo CLI
- iOS Simulator (for iOS) or Android Emulator (for Android)

#### Installation Steps
1. Navigate to mobile app directory
2. Install dependencies: `npm install`
3. Configure API URL in environment
4. Start Expo: `npm start`
5. Scan QR code with Expo Go app or run on simulator

### Web App Requirements

#### Environment Variables
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

#### Dependencies
- Node.js 18+
- npm or yarn

#### Installation Steps
1. Navigate to web app directory
2. Install dependencies: `npm install`
3. Configure API URL in environment
4. Start development server: `npm run dev`
5. Open `http://localhost:3001`

### Database Migrations

#### Create Migration
```bash
npm run migration:generate -- -n MigrationName
```

#### Run Migrations
```bash
npm run migration:run
```

#### Revert Migration
```bash
npm run migration:revert
```

---

## Security & Compliance

### Authentication Security
- Passwords hashed with bcrypt (10 salt rounds)
- JWT tokens with short expiration (15 minutes)
- Refresh tokens with longer expiration (7 days)
- Token stored securely (not in localStorage for web)
- Protected routes with JWT guards

### API Security
- Helmet.js for security headers
- CORS configured for specific origins
- Input validation with class-validator
- SQL injection prevention (TypeORM parameterized queries)
- XSS prevention (input sanitization)

### Payment Security
- Paystack secure payment processing
- Webhook signature verification
- Payment status tracking
- Escrow system for fund protection
- Secure payment reference storage

### Data Protection
- Sensitive data excluded from responses (passwordHash)
- User data privacy (only show necessary info)
- Secure file uploads (Cloudinary)
- Database connection encryption (SSL in production)

### KYC Compliance
- Identity verification system
- Bank account verification
- Document upload and storage
- Verification status tracking

### API Rate Limiting
- Implement rate limiting (future)
- Prevent abuse and DDoS

---

## Testing Requirements

### Backend Testing

#### Unit Tests
- Service layer tests
- Controller tests
- Utility function tests
- Test coverage target: 80%+

#### Integration Tests
- API endpoint tests
- Database integration tests
- Payment flow tests
- Authentication flow tests

#### E2E Tests
- Complete user flows
- Payment processing
- Real-time messaging

#### Test Commands
```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

### Mobile App Testing
- Component testing (future: React Native Testing Library)
- Navigation testing
- API integration testing
- Manual testing on iOS and Android devices

### Web App Testing
- Component testing (future: Jest + React Testing Library)
- Page testing
- Form validation testing
- API integration testing

### Test Data
- Mock data for development
- Test users (requester, runner)
- Test errands with various statuses
- Test payment scenarios

---

## Deployment Guidelines

### Backend Deployment

#### Prerequisites
- Production PostgreSQL database
- Environment variables configured
- Paystack production keys
- Cloudinary production account

#### Steps
1. Build application: `npm run build`
2. Set production environment variables
3. Run migrations: `npm run migration:run`
4. Start production server: `npm run start:prod`
5. Set up process manager (PM2, systemd)
6. Configure reverse proxy (Nginx)
7. Set up SSL certificate
8. Configure firewall

#### Recommended Platforms
- AWS EC2
- DigitalOcean
- Heroku
- Railway
- Render

### Mobile App Deployment

#### iOS (App Store)
1. Configure app.json with production settings
2. Build with EAS: `eas build --platform ios`
3. Submit to App Store Connect
4. App Store review process

#### Android (Google Play)
1. Configure app.json with production settings
2. Build with EAS: `eas build --platform android`
3. Generate signed APK/AAB
4. Upload to Google Play Console
5. Play Store review process

### Web App Deployment

#### Recommended Platforms
- Vercel (recommended for Next.js)
- Netlify
- AWS Amplify
- Railway

#### Steps
1. Configure production environment variables
2. Build application: `npm run build`
3. Deploy to platform
4. Configure custom domain (optional)
5. Set up SSL certificate

### Environment Configuration

#### Production Checklist
- [ ] Database backups configured
- [ ] Environment variables set
- [ ] API URLs updated to production
- [ ] Payment keys switched to production
- [ ] CORS origins updated
- [ ] SSL certificates installed
- [ ] Monitoring and logging set up
- [ ] Error tracking configured (Sentry, etc.)

### Monitoring
- Application logs (Winston)
- Error tracking
- Performance monitoring
- Database monitoring
- API usage analytics

---

## Additional Notes

### Future Enhancements
- Push notifications (mobile)
- Email notifications
- SMS notifications
- Advanced search with geolocation
- In-app map navigation
- Multiple payment methods
- Subscription plans
- Admin dashboard
- Analytics dashboard
- Dispute resolution system
- Automated KYC verification
- Multi-language support
- Dark mode

### Known Limitations
- Distance-based sorting requires user location (future)
- Real-time location tracking (future)
- Payment disputes handled manually (future: automated)
- KYC approval requires manual review (future: automated)

### Support and Documentation
- API Documentation: Swagger UI at `/api/docs`
- Code comments and JSDoc
- README files in each project
- This PRD document

---

## Appendix

### Enums Reference

#### UserRole
- `REQUESTER`: Can only post errands
- `RUNNER`: Can only accept errands
- `BOTH`: Can post and accept errands

#### ErrandStatus
- `OPEN`: Available for acceptance
- `ACCEPTED`: Runner has accepted
- `IN_PROGRESS`: Runner is working on it
- `COMPLETED`: Errand finished
- `CANCELLED`: Errand cancelled

#### ErrandCategory
- `DELIVERY`: Package/item delivery
- `BUY_FOR_ME`: Shopping errand
- `QUEUE`: Queue/waiting service
- `REPAIR`: Repair service
- `CUSTOM`: Custom errand type

#### UrgencyLevel
- `LOW`: Not urgent
- `MEDIUM`: Normal priority
- `HIGH`: High priority
- `URGENT`: Very urgent

#### PaymentType
- `ESCROW`: Payment held in escrow
- `PAYOUT`: Payment to runner
- `REFUND`: Refund to requester

#### PaymentStatus
- `PENDING`: Payment initiated
- `PROCESSING`: Payment processing
- `SUCCESS`: Payment successful
- `FAILED`: Payment failed
- `CANCELLED`: Payment cancelled

#### KYCStatus
- `PENDING`: Awaiting review
- `APPROVED`: Verified
- `REJECTED`: Rejected

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Maintained By**: Development Team

