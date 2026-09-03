# 48Date Backend — Comprehensive In-Depth Project Analysis & API Specification

---

## 1. Executive Summary & System Overview

**48Date** is a modern, high-performance speed-dating and relationship platform backend designed for scale, low-latency real-time communication, secure biometric and phone verification, and cost-effective single-server VPS hosting.

The backend serves two primary client ecosystems:
1. **Flutter Mobile User App**: Full user-facing experience including phone/Google authentication, rich profile customization, photo uploads, discovery feed & swiping, mutual matching, real-time Socket.io chat, in-chat interactive mini-games, date planning, and push notifications.
2. **React Admin Dashboard**: Moderation and back-office panel protected by Role-Based Access Control (RBAC), managing reports, verification queues, trust scores, and platform analytics.

### Core Architectural Pillars
- **Framework & Runtime**: NestJS 11 (TypeScript, strict null checks) configured as an ECMAScript Module (**ESM**, `"type": "module"`).
- **Primary Database**: PostgreSQL 16 managed via **Prisma 7** using a multi-file schema architecture with `@prisma/adapter-pg`.
- **In-Memory Store & Queues**: Redis 7 powering caching, live presence tracking (`online_users`), and asynchronous background jobs backed by **BullMQ 5**.
- **Real-Time Communication**: WebSockets powered by **Socket.io** (`@nestjs/platform-socket.io`) with JWT-authenticated handshakes, conversation rooms, live typing indicators, and game state broadcasting.
- **Media & File Storage**: **Cloudflare R2** (S3-compatible API) for image hosting with local filesystem fallback for development. The PostgreSQL database stores only image URLs, hashes, dimensions, and sort metadata—**zero blobs in the database**.
- **Unified API Response Envelope**: Consistent `{ success, message, messages, data }` JSON contracts across all endpoints, handled automatically via custom utility helpers and a global exception filter (`AllExceptionsFilter`).

```
                              ┌───────────────────────────────────┐
                              │    Client Applications            │
                              │  (Flutter Mobile & React Admin)   │
                              └─────────────────┬─────────────────┘
                                                │
                                       HTTPS / WSS / REST
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │       NestJS 11 API Gateway       │
                              │   Global Validation Pipe & Filter │
                              └───┬─────────────┬─────────────┬───┘
                                  │             │             │
                    ┌─────────────┘             │             └─────────────┐
                    ▼                           ▼                           ▼
       ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
       │   REST Controller /    │  │   Socket.io Gateway    │  │   BullMQ Background    │
       │   Service Layer        │  │   (Real-time Chat/Game)│  │   Workers & Queues     │
       └────────────┬───────────┘  └────────────┬───────────┘  └────────────┬───────────┘
                    │                           │                           │
                    ▼                           ▼                           ▼
       ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
       │     Prisma 7 ORM       │  │        Redis 7         │  │ External Integrations: │
       │  (PostgreSQL 16 DB)    │  │(Presence, Cache, Queue)│  │ FCM, Twilio, SMTP, R2  │
       └────────────────────────┘  └────────────────────────┘  └────────────────────────┘
```

---

## 2. Technology Stack & Infrastructure

| Layer / Capability | Technology | Package / Version | Role in Architecture |
|---|---|---|---|
| **Framework** | NestJS | `@nestjs/core` ^11.0.1 | Feature-first modular MVC & Gateway architecture |
| **Language & Runtime** | Node.js (v22 LTS) & TypeScript | `typescript` ^5.7.3 | Strict null-checking, ESM native resolution |
| **Database** | PostgreSQL 16 | Docker / Hostinger VPS | Relational persistence for all core domain entities |
| **ORM** | Prisma 7 | `@prisma/client` ^7.9.1 | Type-safe queries, migrations, multi-file schema |
| **Database Adapter** | `@prisma/adapter-pg` | `^7.9.1` | Native PG driver connection for Prisma 7 |
| **In-Memory Cache / Store** | Redis 7 | `ioredis` ^6.0.0 | Chat presence, user socket mapping, BullMQ backing |
| **Background Queues** | BullMQ | `bullmq` ^5.81.3, `@nestjs/bullmq` ^11.0.0 | Async notifications, image processing, score jobs |
| **Real-Time Gateway** | Socket.io | `socket.io` ^4.8.3, `@nestjs/websockets` ^11.0.0 | Bi-directional chat messaging, typing, game sessions |
| **Authentication & AuthZ** | Passport JWT & Bcrypt | `passport-jwt` ^4.0.1, `bcrypt` ^6.0.0 | Stateless access/refresh JWT tokens, RBAC guards |
| **Object Storage** | Cloudflare R2 / AWS S3 SDK | `@aws-sdk/client-s3` ^3.1116.0 | User photos & selfies CDN storage (local fallback) |
| **Push Notifications** | Firebase Admin SDK | `firebase-admin` ^14.3.0 | Real-time APNs / FCM push alerts to devices |
| **SMS / OTP Verification** | Twilio SDK | `twilio` ^6.1.0 | International SMS OTP delivery (dummy fallback in dev) |
| **Transactional Email** | Nodemailer | `nodemailer` ^9.0.5 | SMTP delivery via Hostinger mailbox |
| **Input Validation** | Class-Validator & Transformer | `class-validator` ^0.15.1, `class-transformer` ^0.5.1 | Global whitelist, auto-transform request DTOs |

---

## 3. Database & Domain Entity Architecture

The database schema utilizes Prisma 7's multi-file organization partitioned into `prisma/models/` and `prisma/enums/`. 

### 3.1 Domain Models Overview

```
                                  ┌──────────────┐
                                  │     User     │
                                  └──────┬───────┘
                                         │
        ┌──────────────┬─────────────────┼─────────────────┬──────────────┐
        │ 1:N          │ 1:N             │ 1:N             │ 1:N          │ 1:1
        ▼              ▼                 ▼                 ▼              ▼
  ┌───────────┐  ┌───────────┐     ┌───────────┐     ┌───────────┐  ┌───────────┐
  │   Image   │  │  Device   │     │Discovery- │     │   Block   │  │Discovery- │
  │ (Metadata)│  │ (FCM Push)│     │  Action   │     │  / Report │  │Preference │
  └───────────┘  └───────────┘     └─────┬─────┘     └───────────┘  └───────────┘
                                         │ Mutual LIKE
                                         ▼
                                  ┌───────────┐
                                  │   Match   │ (Lexicographical Low/High Pair)
                                  └──────┬────┘
                                         │ 1:1
                                         ▼
                                  ┌──────────────┐
                                  │ Conversation │
                                  └──────┬───────┘
                                         │
                         ┌───────────────┴───────────────┐
                         │ 1:N                           │ 1:N
                         ▼                               ▼
                   ┌───────────┐                   ┌─────────────┐
                   │  Message  │                   │ GameSession │
                   └───────────┘                   └──────┬──────┘
                                                          │ 1:N
                                                          ▼
                                                   ┌──────────────┐
                                                   │  GameAnswer  │
                                                   └──────────────┘
```

1. **`User` (`users`)**:
   - Identity: `id` (UUID), `phone` (unique), `email` (unique), `passwordHash`, `role` (`USER`, `ADMIN`).
   - Flags: `isEmailVerified`, `isPhoneVerified`, `isUserVerified` (auto-set to `true` when profile requirements are fulfilled).
   - Profile: `name`, `firstName`, `lastName`, `username` (unique), `birthDate`, `occupation`, `gender`, `interestedIn`.
   - Lifestyle: `smoker`, `alcohol`, `kids`, `wantsKids`, `lookingFor`.
   - Location: `locations` (array), `lastLocation`, `latitude`, `longitude`.
   - Body & Aesthetics: `heightCm`, `weightKg`.
   - Interests: `creativity` (array), `sports` (array), `moviesAndDramas` (array).
   - Media: `selfieUrl`, `selfieVerified`, `notificationsEnabled`.
   - Timestamps & Billing: `subscriptionId`, `lastLoginAt`, `createdAt`, `updatedAt`.

2. **`Image` (`images`)**:
   - `id`, `userId` (FK to `users`, cascade delete), `r2Key` (URL or storage key), `hash`, `width`, `height`, `isPrimary` (boolean), `sortOrder` (integer), `createdAt`.

3. **`Device` (`devices`)**:
   - `id`, `userId`, `fcmToken`, `platform` (`IOS`, `ANDROID`, `WEB`), `createdAt`, `updatedAt`.

4. **`DiscoveryPreference` (`discovery_preferences`)**:
   - `id`, `userId` (unique 1:1), `minAge` (default 18), `maxAge` (default 60), `maxDistanceKm` (default 50), `preferredGender` (nullable).

5. **`DiscoveryAction` (`discovery_actions`)**:
   - Records swipes: `id`, `actorId`, `targetUserId`, `action` (`LIKE`, `PASS`, `SUPER_LIKE`), `createdAt`. Unique compound index `[actorId, targetUserId]`.

6. **`Match` (`matches`)**:
   - Lexicographically ordered pair: `userLowId` and `userHighId` (guarantees `userLowId < userHighId` to prevent duplicate reciprocal match rows).
   - `status` (`ACTIVE`, `UNMATCHED`), `matchedAt`, `unmatchedAt`.

7. **`Conversation` (`conversations`)**:
   - 1:1 with `Match` via `matchId` (unique), `createdAt`, `updatedAt`.

8. **`Message` (`messages`)**:
   - `id`, `conversationId`, `senderId`, `content`, `type` (`TEXT`, `IMAGE`, `AUDIO`, `DATE_INVITE`, `GAME_PROMPT`, `SYSTEM`), `readAt`, `createdAt`.

9. **`Game` (`games`) & `GameQuestion` (`game_questions`)**:
   - Catalog of icebreaker games (e.g. *This or That*, *Icebreaker Games*). Static questions seeded on bootstrap.

10. **`GameSession` (`game_sessions`) & `GameAnswer` (`game_answers`)**:
    - Multi-round collaborative match games: `status` (`IN_PROGRESS`, `COMPLETED`, `ABANDONED`), tracking simultaneous answer submissions and computing final compatibility scores.

11. **`Notification` (`notifications`)**:
    - In-app notification center: `userId`, `type` (`MATCH`, `MESSAGE`, `DATE_REMINDER`, `TRUST_UPDATE`, `PROMO`, `SYSTEM`), `title`, `body`, `data` (JSON), `isRead`, `createdAt`.

12. **`Block` (`blocks`) & `Report` (`reports`)**:
    - Safety and moderation system preventing discovery and message delivery between blocked/reported users.

13. **`DatePlan` (`date_plans`) & `DateRating` (`date_ratings`)**:
    - Scheduled physical/virtual date coordination with place coordinates, proposed times, confirmation states, and post-date safety ratings.

14. **`TrustScore` (`trust_scores`) & `TrustScoreEvent` (`trust_score_events`)**:
    - Dynamic user authenticity score calculated based on phone verification, selfie verification, report penalties, and successful date completions.

15. **`Subscription` (`subscriptions`) & `SubscriptionEvent` (`subscription_events`)**:
    - Integration records for RevenueCat entitlements (`FREE`, `GOLD`, `PLATINUM`).

16. **`SuccessStory` (`success_stories`), `SuccessStoryLike`, `SuccessStoryComment`**:
    - Community engagement feed where matched couples share their milestone relationship stories.

---

## 4. API Design Standards & Response Envelope

All REST endpoints in 48Date adhere strictly to a **unified response envelope**.

### Success Response (`200 OK`, `201 Created`)
```json
{
  "success": true,
  "message": "Human readable summary of the action",
  "messages": [],
  "data": { ... }
}
```

### Error Response (`400`, `401`, `403`, `404`, `409`, `500`)
```json
{
  "success": false,
  "message": "Human readable summary of the error",
  "messages": [
    "phone must be a valid international number in E.164 format (e.g. +8801...)",
    "password must be longer than or equal to 8 characters"
  ],
  "statusCode": 400
}
```

### Formatted User Object Specification
Any endpoint returning a User entity formats the payload through `src/common/utils/user-formatter.ts` into structured categories (while strictly excluding sensitive fields such as `passwordHash`):
```json
{
  "id": "cd9c425f-2daa-4a55-9b00-b0a470a86727",
  "auth": {
    "phone": "+8801700000000",
    "email": "user@48date.com",
    "role": "USER",
    "isEmailVerified": false,
    "isPhoneVerified": true,
    "isUserVerified": true
  },
  "basicProfile": {
    "name": "Jane Doe",
    "firstName": "Jane",
    "lastName": "Doe",
    "username": "janedoe",
    "birthDate": "2000-01-01T00:00:00.000Z",
    "occupation": "Software Engineer",
    "gender": "FEMALE",
    "interestedIn": "MALE"
  },
  "lifestyle": {
    "smoker": "NONE",
    "alcohol": "OCCASIONALLY",
    "kids": "DONT_HAVE",
    "wantsKids": true,
    "lookingFor": "REAL_RELATIONSHIP"
  },
  "location": {
    "locations": ["Dhaka"],
    "lastLocation": "Dhaka"
  },
  "body": {
    "heightCm": 165,
    "weightKg": 55
  },
  "interests": {
    "creativity": ["Art", "Photography"],
    "sports": ["Gym", "Tennis"],
    "moviesAndDramas": ["Romance", "Comedy"]
  },
  "media": {
    "images": [
      {
        "id": "img_uuid",
        "url": "http://localhost:3000/uploads/jane.jpg",
        "hash": null,
        "width": null,
        "height": null,
        "isMain": true,
        "sortOrder": 0,
        "createdAt": "2026-08-17T08:55:00.000Z"
      }
    ],
    "selfieUrl": "http://localhost:3000/uploads/selfie.jpg",
    "selfieVerified": false,
    "notificationsEnabled": true
  },
  "meta": {
    "subscriptionId": null,
    "lastLoginAt": "2026-08-17T09:10:00.000Z",
    "createdAt": "2026-08-17T08:55:00.000Z",
    "updatedAt": "2026-08-17T09:20:00.000Z"
  }
}
```

---

## 5. Detailed API Specification by Module

### 5.1 Module 1: Authentication & Identity (`/auth`)

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| **A-01** | `POST` | `/auth/register` | None | Register account with phone/email + password; optional profile and images. Returns profile + JWT tokens. |
| **A-02** | `POST` | `/auth/login` | None | Login with phone or email + password. Returns profile + JWT tokens, updates `lastLoginAt`. |
| **A-03** | `POST` | `/auth/request-otp` | None | Request a 6-digit OTP for phone or email (dummy `123456` in dev). |
| **A-04** | `POST` | `/auth/verify-otp` | None | Verify OTP, marks channel verified (`isPhoneVerified`/`isEmailVerified`), returns profile + JWT tokens. |
| **A-05** | `POST` | `/auth/forgot-password` | None | Request password reset OTP for phone or email. |
| **A-06** | `POST` | `/auth/verify-forgot-password` | None | Verify reset OTP, receives a short-lived `resetToken` (15m). |
| **A-07** | `POST` | `/auth/reset-password` | None | Set a new password using `resetToken`. |
| **A-08** | `POST` | `/auth/refresh` | None | Exchange a valid `refreshToken` for a new token pair. |
| **A-09** | `POST` | `/auth/logout` | `Bearer <accessToken>` | Invalidate session client-side. |
| **A-10** | `GET` | `/auth/me` | `Bearer <accessToken>` | Fetch the authenticated user's profile and media. |
| **A-11** | `POST` | `/auth/google` | None | Login/register with Google OAuth `idToken`. Returns profile + JWT tokens. |

#### A-01: Register (`POST /auth/register`)
- **Headers**: `Content-Type: application/json`
- **Request Body (Minimal)**:
  ```json
  {
    "email": "user@48date.com",
    "password": "Password123"
  }
  ```
- **Request Body (Full)**: Supports `phone`, `email`, `password`, `name`, `firstName`, `lastName`, `username`, `birthDate`, `occupation`, `gender`, `interestedIn`, `smoker`, `alcohol`, `kids`, `wantsKids`, `lookingFor`, `locations`, `lastLocation`, `heightCm`, `weightKg`, `creativity`, `sports`, `moviesAndDramas`, `images` (array of 1-6 `{ url, isMain, sortOrder }`), `selfieUrl`, `notificationsEnabled`.
- **Response**: `201 Created` with `{ success: true, message: "Account created successfully", data: { user: {...}, accessToken: "...", refreshToken: "..." } }`.

#### A-02: Login (`POST /auth/login`)
- **Request Body (Phone)**: `{"phone": "+8801700000000", "password": "Password123"}`
- **Request Body (Email)**: `{"email": "user@48date.com", "password": "Password123"}`
- **Response**: `200 OK` with user profile and token pair.

#### A-03: Request OTP (`POST /auth/request-otp`)
- **Request Body**:
  ```json
  {
    "channel": "phone",
    "phone": "+8801700000000"
  }
  ```
  *(or `channel: "email"` with `email: "user@48date.com"`)*
- **Response**: `201 Created` with `data: { channel: "phone", otp: "123456", message: "Dummy OTP..." }`.

#### A-04: Verify OTP (`POST /auth/verify-otp`)
- **Request Body**: `{"channel": "phone", "phone": "+8801700000000", "otp": "123456"}`
- **Response**: `201 Created` with user, tokens, and `verified: true`.

#### A-05: Forgot Password (`POST /auth/forgot-password`)
- **Request Body**: `{"channel": "email", "email": "user@48date.com"}`
- **Response**: `201 Created` with OTP sent confirmation.

#### A-06: Verify Forgot Password (`POST /auth/verify-forgot-password`)
- **Request Body**: `{"channel": "email", "email": "user@48date.com", "otp": "123456"}`
- **Response**: `201 Created` with `data: { resetToken: "...", expiresIn: "15m" }`.

#### A-07: Reset Password (`POST /auth/reset-password`)
- **Request Body**: `{"resetToken": "...", "newPassword": "NewPassword123"}`
- **Response**: `201 Created` with `data: { message: "Password updated successfully" }`.

#### A-08: Refresh Tokens (`POST /auth/refresh`)
- **Request Body**: `{"refreshToken": "..."}`
- **Response**: `200 OK` with fresh `accessToken` and `refreshToken`.

#### A-09: Logout (`POST /auth/logout`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `201 Created` with `{ success: true, message: "Logged out successfully" }`.

#### A-10: Get Current User Profile (`GET /auth/me`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK` with categorized user profile.

#### A-11: Google OAuth Login (`POST /auth/google`)
- **Request Body**: `{"idToken": "google_jwt_token_string"}`
- **Response**: `201 Created` with user profile and token pair.

---

### 5.2 Module 2: User Profile Management (`/users`)

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| **B-01** | `PATCH` | `/users/profile-setup` | `Bearer <accessToken>` | Partial update of user profile fields, lifestyles, locations, and images. Auto-verifies `isUserVerified` when all required fields are complete. |
| **B-02** | `GET` | `/users/profile` | `Bearer <accessToken>` | Fetch the current authenticated user's complete profile. |

#### B-01: Setup Profile (`PATCH /users/profile-setup`)
- **Headers**: `Authorization: Bearer <accessToken>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "firstName": "Jane",
    "lastName": "Doe",
    "username": "janedoe",
    "birthDate": "2000-01-01T00:00:00.000Z",
    "occupation": "Software Engineer",
    "gender": "FEMALE",
    "interestedIn": "MALE",
    "smoker": "NONE",
    "alcohol": "OCCASIONALLY",
    "kids": "DONT_HAVE",
    "wantsKids": true,
    "lookingFor": "REAL_RELATIONSHIP",
    "locations": ["Dhaka"],
    "lastLocation": "Dhaka",
    "latitude": 23.8103,
    "longitude": 90.4125,
    "heightCm": 165,
    "weightKg": 55,
    "creativity": ["Art", "Photography"],
    "sports": ["Gym", "Tennis"],
    "moviesAndDramas": ["Romance", "Comedy"],
    "images": [
      {
        "url": "http://localhost:3000/uploads/jane.png",
        "isMain": true,
        "sortOrder": 0
      }
    ],
    "selfieUrl": "http://localhost:3000/uploads/selfie.png",
    "notificationsEnabled": true
  }
  ```
- **Business Logic**:
  - Validates username uniqueness if altered.
  - Ensures exactly one image is marked with `isMain: true`.
  - Automatically flips `isUserVerified: true` once name, username, birthDate, gender, interestedIn, lookingFor, locations, and images are provided.
- **Response**: `200 OK` with updated categorized user profile.

#### B-02: Get Profile (`GET /users/profile`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK` with categorized profile data.

---

### 5.3 Module 3: Image Management (`/images`)

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| **C-01** | `POST` | `/images/upload` | `Bearer <accessToken>` | Uploads photo file via multipart/form-data. Stores to Cloudflare R2 (or local `/uploads` in dev) and returns public URL & key. |

#### C-01: Upload Image (`POST /images/upload`)
- **Headers**: `Authorization: Bearer <accessToken>`, `Content-Type: multipart/form-data`
- **Form Data**:
  - `file`: Binary file (Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`; Max size: 10MB).
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "message": "Image uploaded successfully",
    "messages": [],
    "data": {
      "url": "http://localhost:3000/uploads/6e088a8d-b0ad-4d43-a616-86c3d9ef961e-1724395600000.png",
      "key": "local/uploads/6e088a8d-b0ad-4d43-a616-86c3d9ef961e-1724395600000.png"
    }
  }
  ```

---

### 5.4 Module 4: Discovery & Matching Engine (`/discovery`)

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| **D-01** | `GET` | `/discovery` | `Bearer <accessToken>` | Retrieve a shuffled pool of candidate profiles matching user preferences, excluding previously swiped or blocked users. |
| **D-02** | `GET` | `/discovery/preferences` | `Bearer <accessToken>` | Retrieve current discovery preferences (auto-creates default if not set). |
| **D-03** | `PATCH` | `/discovery/preferences` | `Bearer <accessToken>` | Update discovery criteria (min/max age, distance radius, preferred gender). |
| **D-04** | `GET` | `/discovery/:id` | `Bearer <accessToken>` | Retrieve detailed public profile of a specific candidate user. |
| **D-05** | `POST` | `/discovery/swipe` | `Bearer <accessToken>` | Record a swipe (`LIKE`, `PASS`, `SUPER_LIKE`). Automatically creates `Match` and `Conversation` upon mutual like. |

#### D-01: Get Discovery Candidates (`GET /discovery`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK` with array of candidate user profiles.

#### D-02: Get Preferences (`GET /discovery/preferences`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK` with `{ id, userId, minAge: 18, maxAge: 60, maxDistanceKm: 50, preferredGender: null, updatedAt }`.

#### D-03: Update Preferences (`PATCH /discovery/preferences`)
- **Request Body**:
  ```json
  {
    "minAge": 21,
    "maxAge": 32,
    "maxDistanceKm": 30,
    "preferredGender": "FEMALE"
  }
  ```
- **Response**: `200 OK` with updated preference record.

#### D-04: Get Profile Details (`GET /discovery/:id`)
- **Path Param**: `id` — Target user's UUID.
- **Response**: `200 OK` with candidate's categorized profile.

#### D-05: Swipe (`POST /discovery/swipe`)
- **Request Body**:
  ```json
  {
    "targetUserId": "cd9c425f-2daa-4a55-9b00-b0a470a86727",
    "action": "LIKE"
  }
  ```
  *(Action options: `LIKE`, `PASS`, `SUPER_LIKE`)*
- **Response (No Mutual Match)**: `201 Created`
  ```json
  {
    "success": true,
    "message": "Swipe recorded successfully",
    "messages": [],
    "data": { "isMatch": false }
  }
  ```
- **Response (Mutual Match Created)**: `201 Created`
  ```json
  {
    "success": true,
    "message": "It's a match!",
    "messages": [],
    "data": {
      "isMatch": true,
      "match": {
        "id": "match_uuid",
        "conversationId": "conversation_uuid",
        "matchedUser": { ... }
      }
    }
  }
  ```

---

### 5.5 Module 5: Matches Management (`/matches`)

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| **E-01** | `GET` | `/matches` | `Bearer <accessToken>` | List all active mutual matches with matched user details, match timestamp, and linked conversation ID. |
| **E-02** | `DELETE` | `/matches/:id` | `Bearer <accessToken>` | Unmatch a user, marking the match status as `UNMATCHED`. |

#### E-01: Get Active Matches (`GET /matches`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK` with list of active matches:
  ```json
  {
    "success": true,
    "message": "Matches retrieved successfully",
    "messages": [],
    "data": [
      {
        "matchId": "match_uuid",
        "conversationId": "conversation_uuid",
        "matchedUser": { ... },
        "matchedAt": "2026-08-23T06:12:00.000Z",
        "status": "ACTIVE"
      }
    ]
  }
  ```

#### E-02: Unmatch (`DELETE /matches/:id`)
- **Path Param**: `id` — Match UUID.
- **Response**: `200 OK` with `{ "message": "Unmatched successfully" }`.

---

### 5.6 Module 6: Real-Time Chat (`/chat` & WebSockets Gateway)

#### 5.6.1 REST Endpoints

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| **F-01** | `GET` | `/chat/conversations` | `Bearer <accessToken>` | Get active conversation rooms for the user, with last message preview and partner info. |
| **F-02** | `GET` | `/chat/conversations/:id/messages` | `Bearer <accessToken>` | Fetch paginated chat history for a conversation (`?limit=50&offset=0`). |

#### F-01: Get Conversations (`GET /chat/conversations`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK` with active conversation list.

#### F-02: Get Message History (`GET /chat/conversations/:id/messages`)
- **Query Params**: `limit` (default 50), `offset` (default 0).
- **Response**: `200 OK` with chronological list of message entities.

#### 5.6.2 Socket.io WebSocket Gateway Specification

- **Connection URL**: `ws://localhost:3000` (or `wss://api.48date.com`)
- **Handshake Authentication**:
  - Option A (Header): `Authorization: Bearer <accessToken>`
  - Option B (Query): `?token=<accessToken>`
- **Presence Tracking**: Active sockets are indexed in-memory and in Redis under the `online_users` hash.

##### Client-to-Server Events:
1. `joinRoom`:
   - **Payload**: `{"conversationId": "conv_uuid"}`
   - **Behavior**: Verifies participation in match, joins socket room `conversationId`.
2. `sendMessage`:
   - **Payload**:
     ```json
     {
       "conversationId": "conv_uuid",
       "content": "Hey! Looking forward to our date.",
       "type": "TEXT"
     }
     ```
   - **Behavior**: Persists message to DB, broadcasts `newMessage` to all sockets in `conversationId`, and queues background push notification if partner is offline.
3. `typing`:
   - **Payload**: `{"conversationId": "conv_uuid", "isTyping": true}`
   - **Behavior**: Relays typing indicator to partner in the room.

##### Server-to-Client Events:
- `newMessage`: Broadcasts newly received message object (`id`, `conversationId`, `senderId`, `content`, `type`, `createdAt`).
- `typing`: Emits `{"userId": "sender_uuid", "isTyping": boolean}`.
- `gameStarted`: Broadcasts game session initialization.
- `partnerAnswered`: Alerts user that their match has chosen an answer.
- `roundResult`: Reveals round outcome once both participants have answered.
- `gameCompleted`: Emits final compatibility percentage and summary.

---

### 5.7 Module 7: In-Chat Interactive Games (`/games`)

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| **G-01** | `GET` | `/games` | `Bearer <accessToken>` | List active games and question templates (auto-seeded on server boot). |
| **G-02** | `POST` | `/games/sessions` | `Bearer <accessToken>` | Start a new game session or resume active session for a match. |
| **G-03** | `GET` | `/games/sessions/:id` | `Bearer <accessToken>` | Retrieve game session state, active questions, and submitted answers. |
| **G-04** | `POST` | `/games/sessions/:id/answers` | `Bearer <accessToken>` | Submit an answer for a question round. Calculates compatibility and posts system message when complete. |

#### G-01: Get Active Games (`GET /games`)
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK` with list of games (*This or That*, *Icebreaker Games*) and questions.

#### G-02: Start Game Session (`POST /games/sessions`)
- **Request Body**:
  ```json
  {
    "matchId": "match_uuid",
    "gameId": "game_uuid"
  }
  ```
- **Response**: `201 Created` with session record and emits `gameStarted` over WebSockets.

#### G-03: Get Game Session State (`GET /games/sessions/:id`)
- **Path Param**: `id` — Session UUID.
- **Response**: `200 OK` with game configuration, current round answers, and completion status.

#### G-04: Submit Answer (`POST /games/sessions/:id/answers`)
- **Request Body**:
  ```json
  {
    "questionId": "question_uuid",
    "selectedOption": "Coffee"
  }
  ```
- **Behavior & Workflow**:
  1. Upserts `GameAnswer` for user.
  2. If partner hasn't answered yet, emits `partnerAnswered` event and returns `{ answered: true, waitingForPartner: true }`.
  3. If partner has answered, emits `roundResult` with both answers revealed.
  4. If all questions answered, marks session `COMPLETED`, calculates compatibility percentage, inserts a `SYSTEM` message into the conversation, and emits `gameCompleted`.
- **Response**: `201 Created` with session state and match percentage.

---

### 5.8 Module 8: Notifications & Background Processing (`BullMQ`)

The backend implements BullMQ workers processing jobs asynchronously through Redis:

- **Queue Name**: `notifications`
- **Processor**: `NotificationProcessor` (`src/modules/notifications/processors/notification.processor.ts`)

#### Supported Background Job Types:
1. `super_like`:
   - Triggered on `SUPER_LIKE` swipe.
   - Creates in-app notification in PostgreSQL.
   - Dispatches FCM Push notification to all active devices of target user.
   - Dispatches fallback Email (via SMTP) and SMS (via Twilio) if enabled.
2. `match`:
   - Triggered on mutual match.
   - Creates in-app notifications for both users.
   - Sends real-time FCM push notifications: *"It's a Match! ❤️ You matched with..."*.
3. `message`:
   - Triggered when a chat message is sent to a partner who is not connected to the Socket.io gateway.
   - Dispatches FCM push notification with preview text.

---

## 6. Complete API Master Reference Table

| Serial | Domain | Method | Path | Auth Required | Description |
|---|---|---|---|---|---|
| **A-01** | Auth | `POST` | `/auth/register` | None | Create account with phone or email + password |
| **A-02** | Auth | `POST` | `/auth/login` | None | Login with phone or email + password |
| **A-03** | Auth | `POST` | `/auth/request-otp` | None | Request OTP verification code |
| **A-04** | Auth | `POST` | `/auth/verify-otp` | None | Verify OTP and activate verification flags |
| **A-05** | Auth | `POST` | `/auth/forgot-password` | None | Request password reset code |
| **A-06** | Auth | `POST` | `/auth/verify-forgot-password` | None | Verify reset OTP and receive `resetToken` |
| **A-07** | Auth | `POST` | `/auth/reset-password` | None | Set new password using `resetToken` |
| **A-08** | Auth | `POST` | `/auth/refresh` | None | Exchange refresh token for new JWT token pair |
| **A-09** | Auth | `POST` | `/auth/logout` | Bearer Token | Invalidate session client-side |
| **A-10** | Auth | `GET` | `/auth/me` | Bearer Token | Get authenticated user's categorized profile |
| **A-11** | Auth | `POST` | `/auth/google` | None | Authenticate with Google OAuth ID token |
| **B-01** | Users | `PATCH` | `/users/profile-setup` | Bearer Token | Partial update of user profile and media |
| **B-02** | Users | `GET` | `/users/profile` | Bearer Token | Fetch authenticated user's complete profile |
| **C-01** | Images | `POST` | `/images/upload` | Bearer Token | Upload image (multipart/form-data) to R2/Local |
| **D-01** | Discovery | `GET` | `/discovery` | Bearer Token | Fetch filtered discovery candidate profiles |
| **D-02** | Discovery | `GET` | `/discovery/preferences` | Bearer Token | Get current discovery filters |
| **D-03** | Discovery | `PATCH` | `/discovery/preferences` | Bearer Token | Update discovery age/distance/gender filters |
| **D-04** | Discovery | `GET` | `/discovery/:id` | Bearer Token | Get public detail view of another user's profile |
| **D-05** | Discovery | `POST` | `/discovery/swipe` | Bearer Token | Swipe LIKE, PASS, or SUPER_LIKE |
| **E-01** | Matches | `GET` | `/matches` | Bearer Token | List all active mutual matches |
| **E-02** | Matches | `DELETE` | `/matches/:id` | Bearer Token | Unmatch user and archive match |
| **F-01** | Chat | `GET` | `/chat/conversations` | Bearer Token | List active conversation rooms and last messages |
| **F-02** | Chat | `GET` | `/chat/conversations/:id/messages`| Bearer Token | Paginated message history for a conversation |
| **WS-01**| Chat WS | `WSS` | `joinRoom` | Socket Handshake | Join conversation room |
| **WS-02**| Chat WS | `WSS` | `sendMessage` | Socket Handshake | Send real-time chat message |
| **WS-03**| Chat WS | `WSS` | `typing` | Socket Handshake | Broadcast typing status |
| **G-01** | Games | `GET` | `/games` | Bearer Token | List active interactive games & questions |
| **G-02** | Games | `POST` | `/games/sessions` | Bearer Token | Start/resume game session for a match |
| **G-03** | Games | `GET` | `/games/sessions/:id` | Bearer Token | Get game session details and answers |
| **G-04** | Games | `POST` | `/games/sessions/:id/answers` | Bearer Token | Submit answer and compute compatibility |

---

## 7. Security, Guards & Middleware Architecture

1. **Stateless JWT Authentication**:
   - Access Token: Short-lived (15 minutes), payload `{ sub: userId, role }`.
   - Refresh Token: Long-lived (7 days), strictly validated on `/auth/refresh`.
2. **Role-Based Access Control (RBAC)**:
   - `@Roles(Role.ADMIN)` decorator paired with `RolesGuard` to guard admin endpoints against unauthorized standard users.
3. **Global Input Sanitization & Type Safety**:
   - `ValidationPipe` with `whitelist: true` (strips untyped body parameters) and `transform: true` (auto-casts types).
4. **Error Masking & Data Leakage Prevention**:
   - `AllExceptionsFilter` catches all uncaught exceptions, transforms validation errors into clean arrays, and prevents raw database query logs or stack traces from reaching clients.
   - `formatUser` whitelist prevents sensitive properties (`passwordHash`) from ever escaping the backend.
5. **CORS & Static Assets**:
   - Enabled globally in `src/main.ts` with prefix `/uploads/` for serving local images during development.

---

## 8. Upcoming Modules & Architecture Roadmap

The database schema and directory architecture already provide scaffolding for the remaining planned modules:

1. **Date Planner & Mapbox Engine (`src/modules/dates`)**:
   - Scheduling physical date venues using Mapbox place lookups, sending `DATE_INVITE` message cards, and tracking date confirmations and status transitions.
2. **Server-Side Face Verification (`src/modules/face-verification`)**:
   - Server-side comparison of raw selfie uploads against profile photos to verify identity and update `selfieVerified: true`.
3. **Trust Score Computation (`src/modules/trust-score`)**:
   - BullMQ automated worker updating composite trust ratings (0–100) based on phone verification (+20), selfie verification (+30), reports (-25), and completed dates (+10).
4. **In-App Subscriptions (`src/modules/subscriptions`)**:
   - RevenueCat webhook listener syncing Apple App Store and Google Play subscriptions, updating `subscriptions` table.
5. **Moderation & Reporting (`src/modules/reports`)**:
   - Automated flagging, admin review queues, and automatic shadow-banning for malicious accounts.
6. **AI Date & Chat Suggestions (`src/modules/ai`)**:
   - LLM integration (OpenAI / Anthropic) generating personalized conversation starters and date recommendations based on mutual user interests.

---

## 9. Local Development & Operational Runbook

### Environment Configuration (`.env`)
```bash
# Core
PORT=3000

# Database (Postgres)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/date48?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT Secrets
JWT_ACCESS_SECRET="generate_32_byte_secret"
JWT_REFRESH_SECRET="generate_32_byte_secret"

# Storage (Optional in dev - defaults to local uploads)
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET=""

# Services (Optional in dev - dummy fallbacks available)
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
FCM_SERVICE_ACCOUNT_JSON=""
```

### Essential CLI Commands
```bash
# 1. Start local infrastructure
docker compose up -d

# 2. Database validation & migration
npx prisma validate
npx prisma migrate dev --name init
npx prisma generate

# 3. Start development server
npm run start:dev

# 4. Compile & build check
npm run build

# 5. Lint & format
npm run lint
npm run format
```
