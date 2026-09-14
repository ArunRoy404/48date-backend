# 48Date Backend

Backend API for the **48Date** dating app — NestJS (TypeScript, ESM), PostgreSQL + Prisma, Redis, JWT auth. A Flutter user app and a React admin panel consume this API.

> **Status:** 13 modules and **54 endpoints** are implemented and serving — auth, profile, images, face verification, discovery, matches, chat (REST + WebSocket), games, dates, trust score, blocks, reports, subscriptions and success stories.
>
> **Not implemented:** the **admin API**. `AdminModule` is a commented-out stub that is not imported into `app.module.ts`, and `@Roles()` / `RolesGuard` are applied to zero controllers. Every endpoint below is user-facing.

## Stack

| Layer | Tech |
|---|---|
| Framework | NestJS 11 (TypeScript, ESM) |
| Database | PostgreSQL 16 (local via Docker Compose) |
| ORM | Prisma 7 (multi-file schema, migrations) |
| Cache / queues | Redis 7 + BullMQ (notification jobs, socket presence) |
| Realtime | Socket.IO (`ChatGateway`, JWT handshake auth) |
| Auth | JWT (`@nestjs/passport`) — access + refresh tokens |
| OTP (dev) | Dummy code `123456` — real Twilio Verify only when `TWILIO_*` is set |

## Quick start

**Prerequisites:** Node.js 22 (`.nvmrc`), Docker.

```bash
# 1. Start Postgres + Redis (the compose file also defines an `app` service — skip it for dev)
docker compose up -d postgres redis
docker compose ps             # both should be "Up (healthy)"

# 2. Install dependencies
npm install

# 3. Create .env from the template
cp .env.example .env          # then edit — see "Environment" below

# 4. Apply migrations + generate the Prisma client
npx prisma migrate deploy
npx prisma generate           # required in Prisma 7 (migrate doesn't auto-generate)

# 5. Seed the games catalogue + demo accounts and relational data
npm run db:seed

# 6. Run the dev server (watch mode, port 3000)
npm run start:dev
```

> ⚠️ **Postgres is on host port `5433`, not 5432.** `docker-compose.yml` maps `5433:5432` to avoid clashing with a local Postgres install. Your `DATABASE_URL` must use `5433`.

## Environment

Copy `.env.example` to `.env`. Only **four** variables are actually required to boot:

| Variable | Why it's required |
|---|---|
| `DATABASE_URL` | Prisma datasource — the app cannot start without it |
| `REDIS_URL` | `BullModule.forRoot()` in the root module |
| `JWT_ACCESS_SECRET` | Signing + verifying access tokens |
| `JWT_REFRESH_SECRET` | Signing + verifying refresh tokens |

`PORT` is optional and defaults to `3000`.

`STRICT_URL_VALIDATION` controls how image URLs are validated. Keep it **`false`** locally: the local upload fallback returns `http://localhost:3000/uploads/…`, and `@IsUrl()`'s default rejects `localhost` because it has no TLD — which breaks `P-01 → P-02`. Set it to **`true`** in production, where every image URL comes from R2.

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/date48?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
```

### Optional integrations — all degrade gracefully

Every third-party integration is wired up but falls back to a no-op when its variables are absent, so the whole API runs locally with no external accounts:

| Service | Variables | Behaviour when unset |
|---|---|---|
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Saves to local `uploads/`, served at `/uploads/` |
| Twilio Verify | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Dummy OTP `123456` |
| Twilio SMS | `TWILIO_PHONE_NUMBER` | Logs the SMS to the console |
| Firebase FCM | `FCM_SERVICE_ACCOUNT_JSON` | Logs the push payload to the console |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Logs the email to the console |
| Mapbox | `MAPBOX_ACCESS_TOKEN` | `GET /dates/places/search` returns `[]` |
| RevenueCat | `REVENUECAT_WEBHOOK_SECRET` | ⚠️ Webhook auth is **skipped entirely** — set this before deploying |

> `TWILIO_PHONE_NUMBER` is read by `notifications.service.ts` but is **missing from `.env.example`**.

### Declared but unused

`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `REVENUECAT_API_KEY` appear in `env.config.ts` but are never read anywhere. `AiModule` is an empty stub and isn't imported into `app.module.ts`. Leave them blank.

## Demo data

`npm run db:seed` is idempotent and populates every endpoint with something real:

| | |
|---|---|
| **7 accounts** | all verified, full profiles, images and preferences |
| **1 blank account** | `+8801811000008` — phone-verified but with an empty profile and `locationPermission: NOT_ASKED`, so `A-03 Verify user information` has a real target. Reset to blank on every seed run. |
| **1 far-away account** | Rafiq Das, ~190 km away in Sylhet. Filtered out of Ava's feed at the default `maxDistanceKm` of 50; raise it past 200 with `D-02` and he appears. |
| **2 matches** | `ava ↔ liam` (6 chat messages, a finished game, a completed date + ratings) and `ava ↔ noah` (a **PENDING** invitation addressed to ava, so `DT-06` accept works) |
| **plus** | trust scores and events, a block, a report, an active and an expired subscription, a PUBLISHED success story with likes and comments, notifications |

Sign in as **`+8801811000001`** (Ava Stone) with OTP `123456` — the Postman collection's defaults already point at this account. There are no passwords anywhere in this API. `ethan` and `kabir` are left unswiped so the discovery feed is never empty.

Re-running the seed also **prunes** swipes, matches, and the half-finished accounts that `POST /auth/login` creates for unknown identifiers, so a `db:seed` always restores the documented state.

## API

All 56 endpoints, grouped as they appear in the Postman collection. Serials run in **integration order** — anything numbered lower is either a dependency of, or independent from, what follows.

Every response — success or error — uses the same envelope:

```json
{ "success": true, "message": "Operation successful", "messages": [], "data": { } }
{ "success": false, "message": "Validation failed", "messages": ["phone must be ..."], "statusCode": 400 }
```

Profiles are returned categorized (`auth`, `basicProfile`, `lifestyle`, `location`, `body`, `interests`, `media`, `meta`). There is no password field on the user model.

### Auth

There is **no register endpoint and no passwords.** `POST /auth/login` takes a **phone number
and nothing else** — no `channel`, no email login — finds *or creates* that account, and sends
an OTP on **every** login. The profile is submitted afterwards in one shot. Email reaches an
account only through Google sign-in (A-01.2).

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| A-01.1 | POST | `/auth/login` | — | Phone only. Find or create the account, always send an OTP. **Never returns tokens.** |
| A-01.2 | POST | `/auth/google` | — | Google ID token → find or create → tokens, no OTP (⚠️ signature not verified) |
| A-01.3 | POST | `/auth/resend-otp` | — | Re-send the OTP for an existing account. 30s cooldown → `429` |
| A-02 | POST | `/auth/verify-otp` | — | Verify OTP → tokens, sets `isPhoneVerified` |
| A-03 | POST | `/auth/verify-user-information` | Bearer | Submit the whole profile — **every field required** → sets `isUserVerified`, routes to `MAIN_APP` |
| A-04 | POST | `/auth/refresh` | — | Refresh token → new token pair |
| A-05 | POST | `/auth/logout` | Bearer | Stateless — client discards tokens |

```
                                                       ┌── PROFILE_SETUP ──> A-03 verify-user-information ──> MAIN_APP
A-01.1 login ──> A-02 verify-otp ──> tokens ──> nextStep
                                                       └── MAIN_APP

A-01.2 google ─────────────────────> tokens ──> nextStep  (same two branches, no OTP step)
```

### Verification flags

Three flags that are easy to confuse:

| Flag | Set by | Meaning |
|---|---|---|
| `isPhoneVerified` | `A-02` for a phone signup, or `P-09` for a Google user who adds a number | This number has been proven |
| `isEmailVerified` | `A-01.2` Google sign-in, or `P-09` for a phone user who adds an address | This address has been proven |
| `isProfileComplete` | `A-03 Verify user information` | Onboarding is done — drives `nextStep` and Discovery visibility |
| `isUserVerified` | **admin only** | Trust badge. No user-facing endpoint sets it |

`A-03` takes no email field, so a phone signup still reports `isEmailVerified: false` after
completing the whole profile. That is not a bug — proving an address is a deliberate second
step:

```
P-07 add phone/email  →  P-08 request code  →  P-09 verify  →  flag flips
```

Whatever `P-07` writes lands unverified, and replacing an already-verified value resets its
flag, since the new one has proven nothing.

`isUserVerified` used to be set automatically the moment a profile looked complete, which
conflated "filled in the form" with "vouched for by an admin". It no longer is; **Discovery
now gates on `isProfileComplete`**, so a complete profile is what makes an account visible
and the badge is a separate signal.

### OTP resend cooldown

`POST /auth/login` and `POST /auth/resend-otp` both refuse to dispatch another OTP within
**30 seconds** of the last one, tracked by `users.lastOtpSentAt`. `P-08` has the same window
on its own timer (`users.lastContactOtpSentAt`) — sharing one would mean logging in blocks you
from verifying an email you added seconds later. The refusal is a `429`
carrying the exact seconds remaining, both in the message and in the standard `Retry-After`
header, so the app can render a countdown rather than a flat "try again later":

```
429  Please wait 18 seconds before requesting another code.
     Retry-After: 18
```

A successful send returns `data.resendCooldownSeconds` so the OTP screen knows how long to
disable its resend button. A brand-new account created by `A-01.1` has never been sent
anything, so its first OTP is never held back.

The two differ on unknown numbers: `A-01.1` **creates** the account, `A-01.3` returns `404` —
resending implies something was sent in the first place.

`nextStep` is the app's router: `PROFILE_SETUP` means `isUserVerified` is still false and A-03
has not been sent yet; `MAIN_APP` means onboarding is done.

**A-03 requires every field.** The onboarding screens collect all of it, so a missing field
means a screen was skipped, and the response names each one in `messages[]` with a sentence
that can be shown to the user as-is. A 2xx therefore always means the account is verified.
The one conditional is location: `lastLocation`, `latitude` and `longitude` are required only
when `locationPermission` is `WHILE_IN_USE`, `ONE_TIME` or `ALWAYS` — someone who taps *Deny*
must still be able to finish onboarding. Later edits go through `PATCH /users/profile-setup`
(P-02), which accepts any subset.

Validation returns **one message per field**: the global `ValidationPipe` runs with
`stopAtFirstError`, so a single missing value no longer trips `@IsString`, `@IsNotEmpty` and
`@Matches` and report the same thing three ways.

### Profile field changes

| Removed | Replacement |
|---|---|
| `name` | Derived from `firstName` + `lastName`, returned as `basicProfile.displayName`. |
| `locations` (string array) | `lastLocation` plus `latitude` / `longitude`. |

| Enum | Values |
|---|---|
| `LookingFor` | `REAL_RELATIONSHIP` · `SOMETHING_MEANINGFUL` · `SEE_WHERE_IT_GOES` · `NEW_FRIENDS_FIRST` — the four options on the "What Are You Looking For?" screen |
| `HabitFrequency` | `NEVER` · `SOMETIMES` · `DAILY` — `OFTEN` removed |
| `CreativityInterest` | `ART` · `DESIGN` · `MAKEUP` · `PHOTOGRAPHY` · `SINGING` |
| `SportInterest` | `RUNNING` · `GYM` · `SOCCER` · `CRICKET` · `TENNIS` · `BASKETBALL` |
| `MovieAndDramaInterest` | `TV_SHOWS` · `ROMANCE` · `COMEDY` · `K_DRAMA` · `HORROR` · `THRILLER` · `SCI_FI` · `FANTASY` · `ANIME` · `ZOMBIE` |

The three interest lists used to be free-form `String[]` whose allowed values lived only in a
DTO. They are now real Postgres enums, so the database rejects a value the interests screen
never offered, and they follow the same `UPPERCASE_UNDERSCORE` convention as every other enum —
`K_DRAMA`, not `K-Drama`.

`A-03` takes the selfie as `selfieVerificationImageUrl`; it is stored on the user as
`selfieUrl`, the same column `P-04 Verify selfie` writes.

### Profile & Media

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| P-01 | POST | `/images/upload` | Bearer | Upload 1–6 images (multipart) |
| P-02 | PATCH | `/users/profile-setup` | Bearer | Update any subset of profile fields |
| P-03 | GET | `/users/profile` | Bearer | Categorized profile + images |
| P-04 | POST | `/face-verification/verify` | Bearer | Submit selfie → `selfieVerified` |
| P-05 | GET | `/face-verification/status` | Bearer | Verification flags + what's missing |
| P-06 | PATCH | `/users/location` | Bearer | Coordinates and/or permission state — see **Location and distance** below |
| P-07 | PATCH | `/users/contact` | Bearer | Add or replace the phone/email — lands **unverified** |
| P-08 | POST | `/users/contact/request-otp` | Bearer | Send a code to the stored phone/email. 30s cooldown |
| P-09 | POST | `/users/contact/verify-otp` | Bearer | Confirm the code → flips that one flag |

### Discovery

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| D-01 | GET | `/discovery/preferences` | Bearer | Current filters (creates defaults on first call) |
| D-02 | PATCH | `/discovery/preferences` | Bearer | Age range, distance, preferred gender |
| D-03 | GET | `/discovery` | Bearer | Candidate feed, distance-filtered, each entry carries `distanceKm` |
| D-04 | GET | `/discovery/:id` | Bearer | Single candidate detail |
| D-05 | POST | `/discovery/swipe` | Bearer | LIKE / PASS / SUPER_LIKE → may create a match |

### Location and distance

The "Set Your Location" screen can end three ways, and all three are storable:

| App outcome | Send to `PATCH /users/location` |
|---|---|
| *While using the app* / *Only this time* | `latitude`, `longitude`, `city`, `permission` |
| *Not Now* / *Deny* | `permission` alone — no coordinates |
| Never prompted | nothing; the column defaults to `NOT_ASKED` |

`permission` maps 1:1 onto Flutter `geolocator`'s `LocationPermission`, plus `ONE_TIME` for
iOS's *"Only this time"*. `DENIED` and `DENIED_FOREVER` **clear** any stored coordinates and
null `locationUpdatedAt` — the API will not keep matching on a position the user withdrew
consent for.

Location gets its own endpoint rather than riding along with `P-02` because it refreshes on
almost every app open, and pushing a whole profile to move a coordinate risks clobbering
unrelated fields. `A-03` and `P-02` still accept `latitude` / `longitude` / `locationPermission`
for the onboarding submission, and stamp `locationUpdatedAt` whenever they write a coordinate.

**Distance filtering** (`maxDistanceKm` in `D-02`) is enforced in two stages: a bounding box the
database serves from `@@index([latitude, longitude])`, then exact Haversine over that pool in
memory ([geo.ts](src/common/utils/geo.ts)). Deliberately no PostGIS — when a bounding box stops
being selective enough, only `buildBoundingBox` and its one caller need to change.

Two behaviours worth knowing before the app relies on them:

- **Viewer has no coordinates** → no distance filtering at all. An unfiltered feed beats an
  empty screen the user cannot explain. `distanceKm` comes back `null`.
- **Candidate has no coordinates** → excluded while filtering is active, because an unknown
  distance cannot satisfy a distance preference. A user who refuses location is therefore
  undiscoverable to users who granted it.

Other users' raw coordinates are never returned — only `distanceKm`, rounded to one decimal.

### Matches

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| M-01 | GET | `/matches` | Bearer | Active matches + linked conversation |
| M-02 | DELETE | `/matches/:id` | Bearer | Unmatch |

### Chat

REST endpoints **read only** — sending is WebSocket-only, see [Realtime chat](#realtime-chat-socketio).

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| C-01 | GET | `/chat/conversations` | Bearer | Conversations with last message + unread count |
| C-02 | GET | `/chat/conversations/:id/messages` | Bearer | Paginated history (`limit`, `offset`) |

### Games

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| G-01 | GET | `/games` | Bearer | Active games + questions |
| G-02 | POST | `/games/sessions` | Bearer | Open (or resume) a session for a match |
| G-03 | GET | `/games/sessions/:id` | Bearer | Session state and both players' answers |
| G-04 | POST | `/games/sessions/:id/answers` | Bearer | Submit one answer |

### Dates

Status machine: `PENDING` → `ACCEPTED` → `COMPLETED`, with `DECLINED` / `CANCELLED` / `NO_SHOW` as terminal branches.

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| DT-01 | GET | `/dates/places/search` | Bearer | Mapbox venue autocomplete (`[]` without a token) |
| DT-02 | POST | `/dates` | Bearer | Send a date invitation → `PENDING` |
| DT-03 | GET | `/dates` | Bearer | List dates (filter by status, match, upcoming) |
| DT-04 | GET | `/dates/:id` | Bearer | Date plan detail |
| DT-05 | PATCH | `/dates/:id` | Bearer | Reschedule / edit |
| DT-06 | POST | `/dates/:id/accept` | Bearer | Invitee accepts → `ACCEPTED` |
| DT-07 | POST | `/dates/:id/decline` | Bearer | Invitee declines → `DECLINED` |
| DT-08 | POST | `/dates/:id/cancel` | Bearer | Either party cancels → `CANCELLED` |
| DT-09 | POST | `/dates/:id/complete` | Bearer | Mark `COMPLETED` (required before rating) |
| DT-10 | POST | `/dates/:id/ratings` | Bearer | 4 scores 1–5, optional comment, feeds trust score |
| DT-11 | GET | `/dates/:id/ratings` | Bearer | Ratings for a date |

### Trust Score

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| T-01 | GET | `/trust-score` | Bearer | Score, badge tier, aggregate stats |
| T-02 | GET | `/trust-score/history` | Bearer | Paginated log of scoring events |

### Safety

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| S-01 | POST | `/blocks/:userId` | Bearer | Block a user |
| S-02 | GET | `/blocks` | Bearer | Blocked users (paginated) |
| S-03 | DELETE | `/blocks/:userId` | Bearer | Unblock |
| S-04 | POST | `/reports` | Bearer | File a report (optionally block in the same call) |
| S-05 | GET | `/reports/my-reports` | Bearer | Reports filed by the caller |

### Subscriptions

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| SB-01 | GET | `/subscriptions/plans` | — | Static plan catalogue (public, for the paywall) |
| SB-02 | GET | `/subscriptions/me` | Bearer | Subscription state + premium flag |
| SB-03 | POST | `/subscriptions/webhook` | Secret | RevenueCat server-to-server callback |

### Success Stories

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| SS-01 | POST | `/success-stories` | Bearer | Submit a story → `PENDING` |
| SS-02 | GET | `/success-stories` | — | List published stories (public) |
| SS-03 | GET | `/success-stories/:id` | — | Story + comments (public) |
| SS-04 | POST | `/success-stories/:id/like` | Bearer | Toggle like |
| SS-05 | POST | `/success-stories/:id/comments` | Bearer | Add a comment |
| SS-06 | DELETE | `/success-stories/:id/comments/:commentId` | Bearer | Delete own comment |

## Realtime chat (Socket.IO)

Messages are **sent over Socket.IO and read over REST** — `C-01`/`C-02` are read-only and there is no REST send endpoint.

Connect to `ws://localhost:3000` (default namespace, path `/socket.io`) and authenticate with **either** an `Authorization: Bearer <accessToken>` header **or** `?token=<accessToken>` in the URL. Both are verified working. An invalid token connects and is then immediately disconnected by the server.

| Direction | Event | Payload |
|---|---|---|
| → send | `joinRoom` | `{ conversationId }` — required before sending or receiving |
| → send | `sendMessage` | `{ conversationId, content, type? }` — `TEXT` \| `IMAGE` \| `DATE_INVITE` \| `SYSTEM` |
| → send | `typing` | `{ conversationId, isTyping }` |
| ← receive | `newMessage` | the persisted message |
| ← receive | `typing` | `{ userId, isTyping }` |
| ← receive | `gameStarted` / `partnerAnswered` / `roundResult` / `gameCompleted` | game session updates |

Folder **12 · Realtime (Socket.IO)** in the Postman collection documents the full contract, including acks and every error string.

## Postman

Import `postman/48date-backend.postman_collection.json`. Two root folders:

- **USER** — all 54 endpoints across 11 subfolders, numbered `01 · Auth` → `11 · Success Stories` in integration order. Each folder carries its own serial prefix: `A` Auth, `P` Profile, `D` Discovery, `M` Matches, `C` Chat, `G` Games, `DT` Dates, `T` Trust Score, `S` Safety, `SB` Subscriptions, `SS` Success Stories — numbered `01..n` inside the folder.
- **ADMIN** — an intentionally empty placeholder. No admin endpoints exist; nothing has been stubbed or invented.

Auth is set collection-wide to `Bearer {{accessToken}}`, with public endpoints overriding to *No Auth*.

**Every request is documented.** Each carries a description with a parameter table — type, required, and the **exact case-sensitive** values every enum accepts — plus the constraints the DTOs enforce (`heightCm` 50–250, `story` 20–5000 chars, and so on). JSON bodies have a `//` comment above each field (Postman strips them before sending); multipart bodies use per-field descriptions.

**120 response examples, all captured from the running API** — not hand-written. Every endpoint has a filled success example, and 53 of 54 also carry their real error responses (400 validation with the actual `messages[]`, 401, 404, and the 409s for duplicate registration and for a second active date on one match). `SB-01` is the exception: a static public catalogue with no failure mode.

**27 variables**, deliberately limited to values that flow *between* requests — ids, tokens, and login identity. Everything else is literal text you can read and edit in place. Each variable's description says which request fills it and which consume it:

- `accessToken` / `refreshToken` / `userId` — captured on verify-otp, google login, refresh
- **`otp` is captured automatically** — the API returns the dev OTP in the body while Twilio is unset, so `A-02` never needs it typed in
- list → detail: `D-03` → `targetUserId`, `M-01` → `matchId` + `conversationId`, `G-01` → `gameId` + `questionId` + `selectedOption`, `DT-01` → `placeName`/`placeAddress`/lat/lng, `DT-03` → `datePlanId`, `S-02` → `blockedUserId`, `SS-02` → `storyId`
- `G-03` advances `questionId` to the first **unanswered** question, so `G-04` can be run repeatedly

`userPhone` / `userEmail` have stable defaults pointing at the seeded Ava Stone account. Re-running `A-01.1` is always safe — there is no uniqueness conflict to hit, because login finds the existing account instead of creating a second one. To walk the genuine first-time onboarding path, set `userPhone` to `{{onboardingPhone}}` (`+8801811000008`), whose profile the seed leaves blank.

> A clean run against a freshly seeded database passes **48/52**. The other 4 are expected: `P-01` needs a file picked in the GUI, and `DT-07`/`DT-09`/`DT-10` conflict with the date state machine when the folder is run top-to-bottom — `DT-06` has already accepted the date and `DT-08` has cancelled it. Each of those three says so in its description.

## Common commands

```bash
npm run start:dev      # dev server (watch)
npm run build          # type-check + compile to dist/
npm run start:prod     # run compiled dist/src/main.js
npm run lint           # eslint (auto-fix)
npm run test           # unit tests
npm run test:e2e       # e2e tests
npm run db:seed        # seed games + questions (idempotent)
npx prisma validate    # check schema syntax
npx prisma migrate dev --name <desc>   # create + apply a migration (local)
npx prisma migrate deploy              # apply committed migrations (prod/CI)
npx prisma generate    # regenerate client after schema changes (Prisma 7)
```

> ⚠️ `npx prisma migrate reset --force` wipes all local data — dev only, never production.

## Project structure

```
prisma/            # schema: models/ + enums/, migrations/, seed.ts, seeds/
src/
├── main.ts        # bootstrap: CORS, static /uploads, validation pipe, error filter
├── app.module.ts  # root module: Config, Prisma, BullMQ + 15 feature modules
├── config/        # env.config.ts (central env access), database.config.ts
├── common/        # prisma service, response envelope, guards, filters, user-formatter
└── modules/       # auth, users, images, face-verification, discovery, matches,
                   # chat, games, dates, trust-score, blocks, reports,
                   # subscriptions, success-stories, notifications, ai*, admin*
docs/              # project-guide.md (deep dive), 48Date-Backend-Tech-Stack.docx
postman/           # Postman v2.1 collection
```

`*` = empty stub, not registered in `app.module.ts`.

## Docker

`docker-compose.yml` defines three services. For development run only the first two:

```bash
docker compose up -d postgres redis   # Postgres on :5433, Redis on :6379
```

The `app` service builds the Dockerfile and runs `prisma migrate deploy` before starting. It reads `.env` but overrides `DATABASE_URL` / `REDIS_URL` to use the internal service names. Note it mounts no volume for `uploads/`, so locally-stored images do not survive a rebuild — configure R2 for any real deployment.

## Known gaps

Verified against the running server:

- **No admin API.** `AdminModule` is commented out and unregistered; `@Roles()` / `RolesGuard` exist but are unused.
- **`POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/verify-forgot-password`, `POST /auth/reset-password`, `POST /auth/request-otp` and `GET /auth/me` do not exist.** Registration was folded into `POST /auth/login` (which creates the account for an unknown identifier), the password-reset chain went away with passwords themselves, and `GET /users/profile` (P-03) replaces `/auth/me`.
- **Google login does not verify the ID token signature** — it only base64-decodes the payload to read `email`.
- **The RevenueCat webhook skips auth entirely** when `REVENUECAT_WEBHOOK_SECRET` is unset.
- **Fixed:** every `env.*` value sourced from `.env` used to be `undefined` at runtime. `env.config.ts` reads `process.env` when it is imported, which happens while resolving `AppModule` — before Nest's `ConfigModule` loads `.env`. Socket.IO auth failed outright (`secret or public key must be provided`), and Twilio, R2, SMTP, Mapbox, the RevenueCat secret and `REDIS_URL` all silently fell back to their no-op paths even when configured. `main.ts` now imports `dotenv/config` first.
- **Success stories can never be published** — `SS-01` creates them as `PENDING` and no endpoint can approve them.
- **Reports can never be actioned** — `S-04` creates them as `PENDING` with no review endpoint.
- `verifyOtpCode()` in `auth.service.ts` returns `true` for the dummy code `123456` **before** it consults Twilio, and there is no environment check around it. With `TWILIO_*` configured in production, `123456` would still verify any phone number.

## Docs

- `docs/project-guide.md` — read this first if you're new to NestJS/Postgres/Prisma.
- `AGENTS.md` — project rules and conventions (authoritative).
- `docs/48Date-Backend-Tech-Stack.docx` — canonical requirements & tech-stack decisions.

## Notes for contributors

- The project runs **ESM** (`"type": "module"`) because Prisma 7's client is ESM-only — keep `.js` extensions on relative imports.
- Import Prisma from `src/generated/prisma/` (gitignored, regenerated), not `@prisma/client`.
- Run `npm run lint` + `npm run build` (and relevant tests) before finishing changes.
