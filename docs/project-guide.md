# 48Date Backend — Project Guide

> Written for developers coming from **MongoDB / Mongoose / Express**. It explains the stack, then walks through **the auth flow** end to end (what's needed before it, what happens when it's hit, which files do what), plus the **database / Prisma** workflow, **commands**, and **.env**.
>
> Companion files: [`README.md`](../README.md) (quick start + **all 57 endpoints** in tables) · [`AGENTS.md`](../AGENTS.md) (rules & conventions, read this too) · [`BACKEND-STATUS.md`](./BACKEND-STATUS.md) (verified audit: done / partial / missing) · `postman/48date-backend.postman_collection.json` (API tester — 57 USER requests + the 80-request ADMIN contract).

---

## 0. Stack translation (what you already know vs this project)

| You know (Mongo/Express) | This project |
|---|---|
| MongoDB database | **PostgreSQL** (relational, tables) |
| Mongoose (schema + queries) | **Prisma 7** — schema lives in `.prisma` files; a **generated typed client** replaces `Model.find()` |
| Express routes (`app.get('/x')`) | **NestJS controllers** — a class with `@Controller('auth')` + `@Get()/@Post()` decorators |
| Middleware (`app.use(...)`) | **Guards** (auth checks), **Pipes** (validation), **Filters** (error handling) |
| `req.body`, `res.json(...)` | **DTO classes** (validated body) + **envelope helpers** (uniform `{ success, message, messages, data }`) |
| `app.listen(port)` | `main.ts` → `NestFactory.create(AppModule)` |
| `bcrypt`, password login | **Not used — there are no passwords.** Login is phone number + OTP; tokens come from `@nestjs/jwt` + Passport |
| Socket.io | same (Socket.IO — live chat, typing, game events, Redis-backed presence) |
| Bull / agenda | **BullMQ** on Redis — currently one queue: notification fan-out (FCM + SMS/email fallback) |

**One request, top to bottom:** HTTP request → `main.ts` global **ValidationPipe** (validates DTO) → Controller route → Guard (if JWT-protected) → **Service** (business logic) → **PrismaService** → PostgreSQL → response wrapped in the envelope. Any error is caught by the global **AllExceptionsFilter** and returned as `{ success: false, ... }`.

---

## 1. Project structure (what each folder is for)

```
prisma/                     # DATABASE LAYER (Prisma 7, multi-file schema)
├── schema.prisma           # main file: generator + datasource ONLY
├── models/*.prisma         # 24 models — user, image, match, message, conversation,
│                           #   date_plan, date_rating, game*, trust_score*, block,
│                           #   report, subscription*, success_story*, notification,
│                           #   device, discovery_*
├── enums/*.prisma          # 22 enums — role, gender, match_status, message_type,
│                           #   date_status, game_type, story_status, subscription_*,
│                           #   report_status, trust_event_type, notification_type,
│                           #   location_permission, the 3 interest enums, ...
├── migrations/             # SQL change history — every schema change = one folder
├── seed.ts                 # entry point: runs the three seeds below in order
└── seeds/                  # games.seed.ts · users.seed.ts · social.seed.ts

prisma.config.ts            # Prisma CLI config: schema dir + DATABASE_URL

src/
├── main.ts                 # bootstrap: dotenv first, CORS, /uploads static, pipes, filter, listen
├── app.module.ts           # root module: ConfigModule + PrismaModule + OtpModule +
│                           #   BullModule (Redis) + 15 feature modules
├── config/
│   ├── env.config.ts       # central typed access to process.env (every module reads this)
│   └── database.config.ts
├── common/                 # SHARED pieces used by every module
│   ├── prisma/             # PrismaModule (global) + PrismaService (DB connection)
│   ├── otp/                # OtpService — the ONE place OTPs are sent/verified
│   │                       #   (Twilio Verify when configured, dummy 123456 otherwise)
│   ├── response/           # envelope types + successResponse/errorResponse helpers
│   ├── filters/            # AllExceptionsFilter — wraps EVERY error in the envelope
│   ├── guards/             # JwtAuthGuard (Bearer token) + RolesGuard (admin — currently unused)
│   ├── decorators/         # @Roles(...) decorator (currently unused)
│   ├── validators/         # IsContactValue (phone/email depends on sibling `type`),
│   │                       #   IsPublicUrl (STRICT_URL_VALIDATION-aware image URLs)
│   ├── utils/              # user-formatter.ts (categorized profile), geo.ts (Haversine + bbox)
│   └── types/express.d.ts  # tells TypeScript that req.user exists
└── modules/                # 15 registered feature modules + 2 unregistered stubs
    ├── auth/               # phone-OTP login, Google login, onboarding, tokens
    ├── users/              # profile setup, location, contact verification
    ├── images/             # multipart upload → R2 (or local uploads/ fallback)
    ├── face-verification/  # ⚠️ selfie upload + flag only — no real face matching yet
    ├── discovery/          # preferences, distance-filtered feed, swipe → match
    ├── matches/            # list, unmatch
    ├── chat/               # REST read/send + Socket.IO gateway (Redis presence)
    ├── games/              # catalogue, sessions, answers, live partner events
    ├── dates/              # Mapbox places, state machine, ratings
    ├── trust-score/        # score/tier/history; addEvent() consumed by reports + dates
    ├── blocks/  reports/   # safety — reports can never leave PENDING (no admin yet)
    ├── subscriptions/      # plan catalogue, /me, RevenueCat webhook
    ├── success-stories/    # stories can never leave PENDING (no admin yet)
    ├── notifications/      # BullMQ worker: FCM push + SMS/email fallback (no REST endpoints)
    ├── admin/              # ⚠️ empty stub, NOT registered — contract in Postman ADMIN folder
    └── ai/                 # ⚠️ empty stub, NOT registered
```

`src/generated/prisma/` is the **Prisma client** generated from your schema (gitignored, do not edit).

---

## 2. The plumbing files (read once, understand the whole app)

### `src/main.ts` — the entry point
What it does, in order:
1. **`import 'dotenv/config'` first** — `env.config.ts` reads `process.env` while `AppModule` resolves, *before* Nest's `ConfigModule` loads `.env`. Without this line every env-derived value (JWT secret for the chat gateway, `REDIS_URL`, Twilio, R2, SMTP, Mapbox) is silently `undefined` and the app falls back to its no-op paths.
2. Creates the Nest app from `AppModule` and enables CORS.
3. Serves `uploads/` at `/uploads/` (the local fallback when R2 isn't configured).
4. Adds a **global `ValidationPipe`** with `whitelist: true` (strips unknown body fields), `transform: true` (plain JSON → DTO class instances) and `stopAtFirstError: true` (**one message per field** — a single missing value no longer trips `@IsString`, `@IsNotEmpty` and `@Matches` and reports the same thing three ways). This is why **every endpoint validates automatically** — you only write the DTO.
5. Adds the **global `AllExceptionsFilter`** (it also turns a 429's `retryAfterSeconds` into the standard `Retry-After` header).
6. Listens on `PORT` (default 3000).

### `src/app.module.ts` — the root module
Imports `ConfigModule.forRoot({ isGlobal: true })`, the global `PrismaModule`, the global `OtpModule`, and `BullModule.forRoot({ connection: { url: REDIS_URL } })` — which is why **Redis must be running for the app to boot at all**. Then the 15 feature modules listed in §1.

### `src/common/prisma/prisma.module.ts` + `prisma.service.ts` — the DB bridge
- `@Global()` module → any service can inject `PrismaService` without importing it.
- `PrismaService extends PrismaClient` (from `src/generated/prisma/client.js`) and connects using the **`PrismaPg` adapter** (Prisma 7 no longer bundles a DB driver; it uses `@prisma/adapter-pg`) with `DATABASE_URL`.
- Connects on app start (`onModuleInit`) and disconnects on shutdown.
- **This replaces Mongoose's `mongoose.connect()` + models.** Usage in code: `this.prisma.user.create({...})`, `this.prisma.user.findUnique({...})` — like Mongoose but fully typed.

### `src/common/otp/otp.service.ts` — every OTP goes through here
One service owns the whole OTP lifecycle so the Twilio wiring, the dummy code and the cooldown exist exactly once:
- `dispatchForUser()` → sends via **Twilio Verify** when `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` are all set; otherwise returns the **development dummy code `123456`** in the response body (so Postman can auto-capture it). Then stamps the cooldown column.
- `assertCooldown()` → throws **429** with the exact seconds remaining; the filter turns it into a `Retry-After` header. Cooldown is **30 seconds**, tracked per purpose: `users.lastOtpSentAt` for login/resend (`AUTH`) and `users.lastContactOtpSentAt` for contact verification (`CONTACT`) — separate on purpose, so logging in never blocks verifying an email you just added.
- ⚠️ `verify()` accepts `123456` **before** Twilio is consulted, with no environment guard — see Known gaps in the README and §9 of `BACKEND-STATUS.md`.

### `src/common/response/` — the response envelope
- `api-response.interface.ts` — TypeScript shapes: `ApiSuccessResponse<T>` (`{ success, message, messages, data }`) and `ApiErrorResponse` (`{ success, message, messages, statusCode }`).
- `api-response.util.ts` — `successResponse(data, message, messages?)` and `errorResponse(message, messages?, statusCode?)`.
- Controllers return `successResponse(data, 'OTP sent successfully')`; the filter builds error envelopes. **You never hand-roll a response shape.**

### `src/common/filters/all-exceptions.filter.ts` — every error becomes an envelope
Catches everything: validation errors become `400 { success:false, message:"Validation failed", messages:[...each field...] }`; `HttpException`s keep their status + message (and 429s gain the `Retry-After` header); unknown errors → `500` with details logged server-side (not leaked to the client).

### `src/common/guards/` + `decorators/` — protection
- `jwt-auth.guard.ts` — `@UseGuards(JwtAuthGuard)` on a route = the request must carry `Authorization: Bearer <accessToken>`. The strategy (below) runs, and `req.user` becomes `{ userId, role }`.
- `roles.guard.ts` + `roles.decorator.ts` — `@Roles('ADMIN')` on a route = only admins. **Exists but guards zero controllers today** — the whole admin API is still unbuilt (the ADMIN folder in Postman documents the agreed contract).

### `src/common/validators/` + `src/common/utils/`
- `is-contact-value.validator.ts` — `IsContactValue` validates a contact `value` against the sibling `type` field (E.164 phone or email). One validator instead of two `@ValidateIf`s, because class-validator ANDs conditions.
- `is-public-url.validator.ts` — image-URL validation; honours `STRICT_URL_VALIDATION` (off locally so `http://localhost:3000/uploads/…` passes, on in production where every URL comes from R2).
- `user-formatter.ts` — `formatUser(user)` returns the profile **grouped into sections**: `auth`, `basicProfile`, `lifestyle`, `location`, `body`, `interests`, `media`, `meta`. It **picks fields explicitly, so sensitive columns can never leak**. Every endpoint that returns a user calls this.
- `geo.ts` — `buildBoundingBox` (served by the DB index) + exact Haversine over the pool, used by Discovery's distance filter.

### `src/modules/auth/`
- `auth.controller.ts` — one thin method per route: takes the validated DTO, calls the service, wraps the result in `successResponse`. Guards (`@UseGuards(JwtAuthGuard)`) mark protected routes.
- `auth.service.ts` — all logic lives here: find-or-create login, resend, OTP verification, Google login, the one-shot onboarding submission, token refresh, stateless logout. Injects `PrismaService`, `JwtService`, `ConfigService`, `UsersService`, `OtpService`.
- `strategies/jwt.strategy.ts` — tells Passport how to verify a token: read `Authorization: Bearer`, verify with `JWT_ACCESS_SECRET`, don't ignore expiry. `validate()` converts the JWT payload `{ sub, role }` into `req.user = { userId, role }`.
- `dto/` — request bodies (validated automatically):

| File | Used by | Notes |
|---|---|---|
| `login.dto.ts` | A-01.1 | **One field: `phone`** (E.164). No email, no password, no channel. |
| `resend-otp.dto.ts` | A-01.3 | `phone` |
| `verify-otp.dto.ts` | A-02 | `phone` + `otp` (exactly 6 digits) |
| `google-login.dto.ts` | A-01.2 | `idToken` — ⚠️ base64-decoded only, signature not verified |
| `verify-user-information.dto.ts` | A-03 | **Every profile field required** — full onboarding in one shot, including `selfieVerificationImageUrl` and the 3 interest enums |
| `refresh.dto.ts` | A-04 | `refreshToken` |

---

## 3. The auth flow, one endpoint at a time

There is **no register endpoint and no passwords.** `POST /auth/login` takes a phone number and nothing else, finds *or creates* the account, and sends an OTP on **every** login. The profile is submitted afterwards in one shot. Email reaches an account only through Google sign-in.

```
                                                       ┌── PROFILE_SETUP ──> A-03 verify-user-information ──> MAIN_APP
A-01.1 login ──> A-02 verify-otp ──> tokens ──> nextStep
                                                       └── MAIN_APP

A-01.2 google ─────────────────────> tokens ──> nextStep  (same two branches, no OTP step)
```

### A-01.1 · POST `/auth/login` — login or sign-up
**Needed before this endpoint works:** `LoginDto`, the `User` model (migrated), `JwtModule`, `OtpService`. All exist.
**What happens when hit:**
1. `ValidationPipe` checks `phone` against E.164 → `400 Validation failed` otherwise.
2. `prisma.user.findFirst({ where: { phone } })` — if unknown, **creates the account on the spot** (`isPhoneVerified: false`). A race between two first-time logins is caught and surfaces as the field-specific 409.
3. An existing account hits `assertCooldown()` — a second OTP within **30s** is a `429` with `Retry-After`. A brand-new account has never been sent anything, so it skips the wait.
4. `otp.dispatchForUser()` → Twilio Verify, or the dummy code `123456` in the response body when Twilio is unset.
5. Returns `data: { requiresOtp: true, isNewAccount, phone, verification flags, resendCooldownSeconds, message, otp? }`. **Never returns tokens.**

### A-01.3 · POST `/auth/resend-otp`
Same dispatch as A-01.1 but **never creates** an account — an unknown phone is `404 "No account found with this phone number"` (resending implies something was sent in the first place). Same 30s cooldown.

### A-01.2 · POST `/auth/google`
Takes a Google `idToken`, **base64-decodes the payload** to read `email` + `name` (⚠️ the signature is *not* verified — Known gap), finds or creates the account with `isEmailVerified: true` (Google already proved the address — the only path that can set that flag without our own OTP), and issues a full token pair immediately. No OTP step. `nextStep` routes the same two branches as above.

### A-02 · POST `/auth/verify-otp`
Finds the user by `phone` → unknown is `404`; `otp.verify()` fails is `401 "Invalid OTP"`. On success: `isPhoneVerified: true`, `lastLoginAt` stamped, **token pair issued** (`accessToken` 15 min + `refreshToken` 7 days, payload `{ sub, role }`), and `nextStep` returned: `PROFILE_SETUP` or `MAIN_APP`.

### A-03 · POST `/auth/verify-user-information` — one-shot onboarding (Bearer)
Called once the client holds tokens and `nextStep === 'PROFILE_SETUP'`. The DTO requires **every** profile field — a missing field means a screen was skipped, and the response names each one in `messages[]` with a sentence that can be shown to the user as-is. Flow:
1. `selfieVerificationImageUrl` (wire name) is stored as `selfieUrl` — the same column P-04 writes.
2. Delegates to `UsersService.setupProfile()`, which recomputes `isProfileComplete`.
3. Still incomplete → `400 "Profile is still incomplete…"`. Complete → returns the categorized user, `nextStep: 'MAIN_APP'`.
4. The one conditional is location: `lastLocation`, `latitude`, `longitude` are required only when `locationPermission` is `WHILE_IN_USE`, `ONE_TIME` or `ALWAYS` — someone who taps *Deny* must still be able to finish onboarding.
5. `isUserVerified` is **not** touched: it stays `false` until an admin vouches for the account. Today that setter does not exist anywhere (Discovery gates on `isProfileComplete`).

Later edits go through `PATCH /users/profile-setup` (P-02), which accepts any subset.

### A-04 · POST `/auth/refresh`
Verifies `refreshToken` with `JWT_REFRESH_SECRET` → user must still exist → fresh token pair. Invalid/expired → `401`.

### A-05 · POST `/auth/logout` (Bearer)
**Stateless** — the guard confirms the token is valid, then the client discards its tokens. Nothing is revoked server-side yet (a Redis blacklist can make this server-enforced later).

---

## 4. Database & Prisma

### Where the schema lives (multi-file)
- `prisma/schema.prisma` — only `generator` + `datasource` (no `url` here anymore; it moved to `prisma.config.ts`).
- 24 models in `prisma/models/*.prisma`, 22 enums in `prisma/enums/*.prisma`. Relations can cross files — no imports needed.

### Current tables (grouped)
- **Identity & profile** — `users` (auth flags `isPhoneVerified` / `isEmailVerified` / `isProfileComplete` / `isUserVerified`, basicProfile, lifestyle, location incl. `latitude`/`longitude`/`locationPermission`/`locationUpdatedAt`, body, the 3 interest enums, `selfieUrl`, OTP cooldown stamps), `images` (R2 key + `isPrimary` + `sortOrder` — metadata only, **no blobs**), `devices` (FCM tokens — written by nothing yet).
- **Matching & chat** — `discovery_preferences`, `discovery_actions` (swipes), `matches` (`matchedAt`/`unmatchedAt` — **no 48h expiry column**), `conversations`, `messages` (`MESSAGE_TYPE` TEXT/IMAGE/DATE_INVITE/SYSTEM).
- **Dates** — `date_plans` (PENDING → ACCEPTED → COMPLETED + DECLINED/CANCELLED/NO_SHOW), `date_ratings` (4 scores 1–5, feed the trust score).
- **Games** — `games`, `game_questions`, `game_sessions`, `game_answers` (THIS_OR_THAT / ICEBREAKER).
- **Trust** — `trust_scores` (tiers EXCELLENT / GOOD / AVERAGE / NEEDS_ATTENTION), `trust_score_events`.
- **Safety** — `blocks`, `reports` (PENDING/REVIEWING/RESOLVED/DISMISSED + `reviewedBy`/`reviewedAt`/`resolution` columns ready for the admin API).
- **Monetisation & stories** — `subscriptions` + `subscription_events` (plans WEEKLY/MONTHLY/YEARLY), `success_stories` + comments + likes (PENDING/PUBLISHED/REJECTED).
- **Notifications** — `notifications` (written by the worker; no REST read endpoint yet).

### Migrations — how schema changes travel to the DB
A migration = a folder in `prisma/migrations/` containing the SQL diff. `_prisma_migrations` table in Postgres tracks which are applied.

**When you change a `.prisma` file (add a field, new model, rename…):**
1. Edit the schema files.
2. `npx prisma validate` — syntax/relation check before touching the DB.
3. `npx prisma migrate dev --name what_changed` — creates the migration SQL, **applies it to your local DB**, and records it.
4. `npx prisma generate` — **required in Prisma 7** (unlike v6, migrate doesn't auto-generate) — regenerates the typed client in `src/generated/prisma/`.
5. Update DTOs/services to use the new fields, run lint/build.
6. **Commit the migration folder** — teammates/production apply it with `npx prisma migrate deploy`.

### Prisma 7 things that differ from older tutorials
- `prisma.config.ts` holds `DATABASE_URL` + schema dir (the CLI reads it).
- The client needs a driver adapter (`@prisma/adapter-pg`) — passed in `PrismaService`.
- The generated client is **ESM-only**, so the project runs ESM: `"type": "module"` in `package.json` and **`.js` extensions on relative imports** (`./auth.service.js`). Don't "fix" these — they're required.
- Import from `src/generated/prisma/client.js`, not `@prisma/client`.

---

## 5. Commands — when & why

| Command | When / why |
|---|---|
| `docker compose up -d postgres redis` | Start local Postgres (**host port 5433**) + Redis. **Do this before running the server** (first setup or after reboot). |
| `docker compose ps` | Confirm both containers are `Up (healthy)` — the usual fix for "DB connection refused". |
| `npm install` | Install dependencies (after clone / after package.json changes). |
| `npm run start:dev` | Run the dev server with auto-reload (default port 3000). |
| `npm run build` | Type-check + compile to `dist/`. Run before finishing changes. |
| `npm run start:prod` | Run the compiled `dist/src/main.js` (what a server/PM2 would run). |
| `npm run lint` / `npm run format` | ESLint (auto-fix) / Prettier. |
| `npm test` / `npm run test:e2e` | Unit tests / end-to-end tests. |
| `npm run db:seed` | Idempotent seed: games catalogue + 8 demo accounts + relational data (matches, messages, dates, ratings, trust scores, subscriptions, stories, blocks, reports). |
| `npx prisma validate` | Dry-check the schema for errors (no DB touch). |
| `npx prisma migrate dev --name <desc>` | **Local dev:** create + apply a migration for your schema change. |
| `npx prisma migrate deploy` | **Prod/CI:** apply migrations that are already committed (never generates). |
| `npx prisma migrate reset --force` | **Local only, wipes data:** drop everything and re-apply all migrations. Used when your DB drifts from migration history. Never on production. |
| `npx prisma generate` | Regenerate the typed client after any schema change (Prisma 7 does this manually). |

**Common fix:** "drift detected" → you deleted a migration file but the DB still has it applied → run `npx prisma migrate reset --force`, then `npx prisma migrate dev --name init` (or your new migration).

### Seed & demo data
`prisma/seed.ts` runs three seeds in order — `games.seed.ts`, `users.seed.ts`, `social.seed.ts` (the one that creates the relational data). It is idempotent and **prunes** swipes, matches and half-finished accounts that login created, so a re-run always restores the documented state.

Sign in as **`+8801811000001`** (Ava Stone) with OTP `123456`. A blank profile lives at `+8801811000008` for walking the genuine A-03 onboarding path.

---

## 6. `.env` explained

`cp .env.example .env`, then fill secrets. Never commit `.env`.

Only **four** variables are required to boot:

| Variable | Used now? | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string — **`postgresql://postgres:postgres@localhost:5433/date48?schema=public`** for local Docker (**port 5433**, not 5432). Read by `prisma.config.ts` + `PrismaService`. |
| `REDIS_URL` | ✅ | `BullModule.forRoot()` in the root module — the app cannot start without it. |
| `JWT_ACCESS_SECRET` | ✅ | Access tokens (15 min). |
| `JWT_REFRESH_SECRET` | ✅ | Refresh tokens (7 days). |

| Variable | Used now? | Purpose |
|---|---|---|
| `PORT` | ✅ (optional) | HTTP port (default 3000). |
| `STRICT_URL_VALIDATION` | ✅ | Keep **`false`** locally (accepts `http://localhost:3000/uploads/…`), **`true`** in production (every image URL must be a real public URL). |
| `R2_*` | ⏳ optional | Cloudflare R2. Unset → files save to local `uploads/` served at `/uploads/`. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` | ⏳ optional | Twilio Verify OTP. Unset (or on dispatch error) → dummy OTP `123456`. |
| `TWILIO_PHONE_NUMBER` | ⏳ optional | Read by `notifications.service.ts` for SMS fallback — ⚠️ **missing from `.env.example`**. |
| `FCM_SERVICE_ACCOUNT_JSON` | ⏳ optional | Firebase push. Unset → payload logged to console. |
| `SMTP_*` | ⏳ optional | Email fallback. Unset → logged to console. (No provider is wired for email OTP — those are always dummy.) |
| `MAPBOX_ACCESS_TOKEN` | ⏳ optional | Date-place search. Unset → `GET /dates/places/search` returns `[]`. |
| `REVENUECAT_WEBHOOK_SECRET` | ⏳ optional | Webhook auth. ⚠️ Unset → **auth is skipped entirely**. Set before deploying. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `REVENUECAT_API_KEY` | ❌ never read | Declared in `env.config.ts`, read by nothing (`AiModule` is an unregistered stub). Leave blank. |

Generate strong secrets locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (run twice, one per JWT secret).

---

## 7. Response envelope & errors (quick reference)

Success (2xx): `{ "success": true, "message": "...", "messages": [], "data": { } }`
Error: `{ "success": false, "message": "...", "messages": ["..."], "statusCode": 4xx }`

| Status | Typical message |
|---|---|
| 400 | `Validation failed` (each field in `messages`) · `Exactly one image must be marked as main` · `Profile is still incomplete…` |
| 401 | `Invalid OTP` · `Unauthorized` · `Invalid or expired refresh token` |
| 404 | `No account found with this phone number` · `User not found` |
| 409 | `Phone number is already registered` / `Email is already registered` / `Username is already taken` |
| 429 | `Please wait 18 seconds before requesting another code.` + `Retry-After: 18` |
| 500 | generic — details logged server-side |

**User profiles are always categorized** (`auth`, `basicProfile`, `lifestyle`, `location`, `body`, `interests`, `media`, `meta`) and contain **no password field at all** — the model has none.

---

## 8. Where to go next

- [`README.md`](../README.md) — quick start, every endpoint in tables (serials A → SS), Postman walkthrough, known gaps.
- [`BACKEND-STATUS.md`](./BACKEND-STATUS.md) — the full audit: what is done, partial, or missing, module by module, with corrections to the handoff documents.
- [`DEVELOPER-DOC-DISCREPANCIES.md`](./DEVELOPER-DOC-DISCREPANCIES.md) — the fact-check of the developer's two handoff docs against this code.
- The Postman collection — 57 runnable USER requests with captured response examples, plus the 80-request ADMIN contract.
