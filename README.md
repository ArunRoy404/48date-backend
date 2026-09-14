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

# 5. Seed the games catalogue (4 games / 18 questions)
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

## API

All 54 endpoints, grouped as they appear in the Postman collection. Serials run in **integration order** — anything numbered lower is either a dependency of, or independent from, what follows.

Every response — success or error — uses the same envelope:

```json
{ "success": true, "message": "Operation successful", "messages": [], "data": { } }
{ "success": false, "message": "Validation failed", "messages": ["phone must be ..."], "statusCode": 400 }
```

Profiles are returned categorized (`auth`, `basicProfile`, `lifestyle`, `location`, `body`, `interests`, `media`, `meta`) and never include `passwordHash`.

### Auth

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| A-01 | POST | `/auth/register` | — | Create account, returns profile + tokens |
| A-02 | POST | `/auth/verify-otp` | — | Verify OTP → sets `isPhoneVerified` / `isEmailVerified` |
| A-03 | POST | `/auth/login` | — | Phone/email + password → tokens |
| A-04 | POST | `/auth/google` | — | Google ID token → tokens (⚠️ signature not verified) |
| A-05 | POST | `/auth/refresh` | — | Refresh token → new token pair |
| A-06 | POST | `/auth/logout` | Bearer | Stateless — client discards tokens |
| A-07 | POST | `/auth/forgot-password` | — | Request dummy reset OTP |
| A-08 | POST | `/auth/verify-forgot-password` | — | Verify reset OTP → `resetToken` (15 min) |
| A-09 | POST | `/auth/reset-password` | — | Set new password with `resetToken` |

### Profile & Media

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| P-01 | POST | `/images/upload` | Bearer | Upload 1–6 images (multipart) |
| P-02 | PATCH | `/users/profile-setup` | Bearer | Update any subset of profile fields |
| P-03 | GET | `/users/profile` | Bearer | Categorized profile + images |
| P-04 | POST | `/face-verification/verify` | Bearer | Submit selfie → `selfieVerified` |
| P-05 | GET | `/face-verification/status` | Bearer | Verification flags + what's missing |

### Discovery

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| D-01 | GET | `/discovery/preferences` | Bearer | Current filters (creates defaults on first call) |
| D-02 | PATCH | `/discovery/preferences` | Bearer | Age range, distance, preferred gender |
| D-03 | GET | `/discovery` | Bearer | Candidate feed |
| D-04 | GET | `/discovery/:id` | Bearer | Single candidate detail |
| D-05 | POST | `/discovery/swipe` | Bearer | LIKE / PASS / SUPER_LIKE → may create a match |

### Matches

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| M-01 | GET | `/matches` | Bearer | Active matches + linked conversation |
| M-02 | DELETE | `/matches/:id` | Bearer | Unmatch |

### Chat

REST endpoints **read only** — sending is WebSocket-only, see [Realtime chat](#realtime-chat).

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

## Realtime chat

Socket.IO on the same origin as the REST API, with the JWT passed in the handshake (`ChatGateway`).

| Direction | Event | Payload |
|---|---|---|
| → emit | `joinRoom` | `{ conversationId }` |
| → emit | `sendMessage` | `{ conversationId, content, type? }` — type = `TEXT` \| `IMAGE` \| `DATE_INVITE` \| `SYSTEM` |
| → emit | `typing` | `{ conversationId, isTyping }` |
| ← listen | `newMessage` | the saved message |
| ← listen | `typing` | `{ userId, isTyping }` |

## Postman

Import `postman/48date-backend.postman_collection.json`. Two root folders:

- **USER** — all 54 endpoints across 11 subfolders, numbered `01 · Auth` → `11 · Success Stories` in integration order. Each folder carries its own serial prefix: `A` Auth, `P` Profile, `D` Discovery, `M` Matches, `C` Chat, `G` Games, `DT` Dates, `T` Trust Score, `S` Safety, `SB` Subscriptions, `SS` Success Stories — numbered `01..n` inside the folder.
- **ADMIN** — an intentionally empty placeholder. No admin endpoints exist; nothing has been stubbed or invented.

Auth is set collection-wide to `Bearer {{accessToken}}`, with public endpoints overriding to *No Auth*. Every request that returns an id captures it into a collection variable (`accessToken`, `matchId`, `datePlanId`, `storyId`, …), so the folders are runnable top-to-bottom without editing variables by hand. A pre-request script generates a unique `phone` and `email` on first run so `A-01` doesn't collide with a previous run.

Id variables default to `REPLACE_ME` so an unset id fails loudly with a clear 404, rather than silently collapsing to a different route (`/dates/` would otherwise hit the list endpoint).

**Running the whole collection with one fresh account gives 27 passes and 27 expected failures** — the rest need a file picked for upload, a real Google token, or a second account to match with. The USER folder description contains a step-by-step recipe for producing a real `matchId`, which unlocks folders 04–07.

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
- **`POST /auth/request-otp` and `GET /auth/me` do not exist** — earlier versions of this README documented them. Registration and login already return tokens plus the user object, and `GET /users/profile` (P-03) replaces `/auth/me`.
- **Google login does not verify the ID token signature** — it only base64-decodes the payload to read `email`.
- **The RevenueCat webhook skips auth entirely** when `REVENUECAT_WEBHOOK_SECRET` is unset.
- **Success stories can never be published** — `SS-01` creates them as `PENDING` and no endpoint can approve them.
- **Reports can never be actioned** — `S-04` creates them as `PENDING` with no review endpoint.
- Several DTO validation messages in `register.dto.ts` still name removed enum values (`PREFER_NOT_TO_SAY`, `REGULAR`/`OCCASIONALLY`/`NONE`, `HAVE`/`DONT_HAVE`). The messages are stale; the enums enforced are the ones listed in `setup-profile.dto.ts`.

## Docs

- `docs/project-guide.md` — read this first if you're new to NestJS/Postgres/Prisma.
- `AGENTS.md` — project rules and conventions (authoritative).
- `docs/48Date-Backend-Tech-Stack.docx` — canonical requirements & tech-stack decisions.

## Notes for contributors

- The project runs **ESM** (`"type": "module"`) because Prisma 7's client is ESM-only — keep `.js` extensions on relative imports.
- Import Prisma from `src/generated/prisma/` (gitignored, regenerated), not `@prisma/client`.
- Run `npm run lint` + `npm run build` (and relevant tests) before finishing changes.
