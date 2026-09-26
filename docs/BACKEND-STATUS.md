# 48Date Backend — Verified Status & Handoff Report

**Branch:** `roy` · **Report date:** 2026-09-26 · **Verified against:** actual source code (`src/`, `prisma/`, `docker-compose.yml`, `.env.example`), not against prior documentation.

This document supersedes the two earlier handoff documents ("48Date Backend API — Comprehensive Features & Routes" and "48Date Super Admin Backend API — Specification"). Corrections to those documents are listed in **§8 — Corrections**.

---

## 1. Progress Summary

| Area | Status |
|---|---|
| User-facing REST API | **~95% done** — 57 REST endpoints across 14 modules + 1 Socket.IO real-time gateway |
| Database | **Done** — 24 models, 22 enums, 11 migrations (Prisma 7, multi-file schema) |
| Background jobs (BullMQ) | **Partial** — one queue only (notifications). No image-processing or trust-score queues |
| Third-party integrations | **6 of 9 wired** — Twilio, FCM, SMTP, R2, Mapbox, RevenueCat webhook all functional when credentials are set; all degrade to safe fallbacks when unset |
| **Admin API** | **0% — nothing implemented.** `AdminModule` is an empty, commented-out stub, not even registered in `app.module.ts` |
| AI module | **0%** — empty stub, not registered. `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are declared but read by nothing |
| Face verification (real) | **0%** — see §2. Current "verification" only uploads a selfie and flips a flag |
| Tests | **~0%** — 2 files total (`api-response.util.spec.ts`, scaffold `app.e2e-spec.ts`) |

**Endpoint count note:** the README says 54; the actual count is **57** (the REST chat-send endpoint `POST /chat/conversations/:id/messages` was added after the README's last count, plus rounding differences). The Postman collection documents 51.

---

## 2. Module-by-Module Status (User API)

### ✅ Fully implemented & active (14 modules, 57 endpoints)

| Module | Endpoints | Notes |
|---|---|---|
| **auth** | 7 | Phone-only OTP login (find-or-create), Google login, resend-OTP with 30s cooldown (429 + `Retry-After`), verify-OTP → JWT pair, one-shot onboarding, refresh, **stateless** logout |
| **users** | 6 | Profile setup (subset update), categorized profile, location update with permission model, add phone/email + contact OTP verification (separate cooldown timer) |
| **images** | 1 | Multipart upload 1–6 files → Cloudflare R2 (or local `uploads/` fallback). ⚠️ No dedup/hashing/BullMQ pipeline |
| **face-verification** | 2 | ⚠️ **Uploads selfie + sets `selfieVerified: true`. No face detection, no comparison, no confidence score — see §8 correction #1 |
| **discovery** | 5 | Two-stage distance filtering (DB bounding box → Haversine), preferences CRUD, swipe LIKE/PASS/SUPER_LIKE → match creation |
| **matches** | 2 | List active matches, unmatch. ⚠️ **No 48-hour expiry exists** — see §8 correction #2 |
| **chat** | 3 REST + WS | REST read (conversations, paginated history) + REST send; Socket.IO gateway: JWT handshake auth, join/leave room, send, typing, Redis presence |
| **games** | 4 | Catalog, session lifecycle, validated answers, live partner sync (`partnerAnswered`, `roundResult`, `gameCompleted`), compatibility % → SYSTEM chat message |
| **dates** | 11 | Full state machine (PENDING → ACCEPTED → COMPLETED, + DECLINED/CANCELLED), Mapbox venue search, ratings feeding trust score |
| **trust-score** | 2 | Score/tier/badge, history, transactional `addEvent()` consumed by reports + dates. Tiers: **EXCELLENT / GOOD / AVERAGE / NEEDS_ATTENTION** |
| **blocks** | 3 | Block / list / unblock |
| **reports** | 2 | File report, list own. ⚠️ Reports are created `PENDING` and **no endpoint can ever review them** |
| **subscriptions** | 3 | Static plan catalog, `/me` premium status, RevenueCat webhook with secret check + idempotency |
| **success-stories** | 6 | Submit, public list/detail, like, comments. ⚠️ Stories are created `PENDING` and **no endpoint can publish them** |
| **notifications** | worker only | BullMQ queue + processor: match / super-like / message jobs → in-app `Notification` rows + FCM push + SMS/email fallback |

### ⚠️ Partially implemented

1. **Face verification** — no actual face analysis (see §8 #1).
2. **Image pipeline** — upload goes straight to R2/local. No BullMQ optimization/dedup job, no content hash, and the `Image` table is only populated later via `PATCH /users/profile-setup` nested writes. The upload endpoint itself writes no DB metadata.
3. **Device/FCM registration** — the `Device` table exists and the notification processor consumes `fcmToken`, but **no endpoint exists for a client to register a device token**. Push notifications therefore have no production path until this is built.
4. **Notification reading** — the processor writes `Notification` rows; **no `GET /notifications` endpoint exists** for the app to display them.
5. **Image management** — upload only. No list/delete endpoints.
6. **Dead-end state machines** — reports (PENDING forever) and success stories (PENDING forever); both need admin endpoints (see §5).
7. **Logout** — stateless only; no token revocation/blacklist.

### ❌ Not implemented

- Entire admin API (§5)
- Real face matching / anti-spoof (non-negotiable per AGENTS.md)
- AI suggestions (OpenAI/Anthropic)
- Image dedup/optimization BullMQ pipeline
- 48-hour match countdown (does not exist in any form — see §8 #2)
- Device registration API, notifications list API
- Rate limiting beyond OTP cooldown, health-check endpoint, token revocation
- Socket.IO Redis adapter for multi-instance scaling (presence is written to Redis but never read)

---

## 3. Environment Variables & Credentials — Complete List

Copy `.env.example` → `.env`. **Only the first four are required to boot.** Everything else is optional and degrades gracefully.

### Required (app will not start without these)

| Variable | Used by | How to set |
|---|---|---|
| `DATABASE_URL` | Prisma (`src/common/prisma/prisma.service.ts`) | Local dev: `postgresql://postgres:postgres@localhost:5433/date48?schema=public` — **note port 5433**, see §7. Production: the VPS Postgres instance |
| `REDIS_URL` | BullMQ root config, chat-gateway presence | Local dev: `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | auth.service, jwt.strategy, chat gateway | `openssl rand -hex 32`. ⚠️ `.env.example` ships with `changeme` — must be replaced |
| `JWT_REFRESH_SECRET` | auth.service (refresh tokens) | `openssl rand -hex 32`, different from access secret |

### Optional integrations (inactive until credentials are provided)

| Variable(s) | Service | Used by | State when unset | How to activate |
|---|---|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 | images.service | Saves to local `uploads/`, served at `/uploads/` | Create R2 bucket + S3 API token in Cloudflare dashboard → fill all 4 vars → restart |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify | otp.service | Dummy OTP **`123456`** accepted for any phone | Twilio Console → create Verify Service → fill 3 vars |
| `TWILIO_PHONE_NUMBER` | Twilio SMS | notifications.service | SMS logs to console | Buy a Twilio number. ⚠️ **This variable is missing from `.env.example`** even though the code reads it |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase Cloud Messaging | notifications.service + processor | Push payloads log to console | Firebase Console → Project Settings → Service Accounts → generate JSON → paste as one line |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Hostinger SMTP | notifications.service | Emails log to console | hPanel → Email → create mailbox → use its credentials. Port 587 (or 465 for implicit TLS) |
| `MAPBOX_ACCESS_TOKEN` | Mapbox Places | dates.service (`GET /dates/places/search`) | Returns `[]` — **not mock venues** (see §8 #4) | mapbox.com account → tokens page |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat webhook auth | subscriptions.service | ⚠️ **Webhook auth is skipped entirely** — must be set before production | RevenueCat Dashboard → Integrations → Webhooks |
| `STRICT_URL_VALIDATION` | URL validation | is-public-url validator | `false` in dev (allows `localhost` image URLs) | Set `true` in production |

### Declared but **not used by any code** — leave blank, don't pay for them yet

| Variable | Reality |
|---|---|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Read by nothing. `AiModule` is an empty stub not registered in `app.module.ts` |
| `REVENUECAT_API_KEY` | Read by nothing. The code never calls RevenueCat's REST API — it only validates the webhook signature header (see §8 #6) |

---

## 4. Services Inventory — Active / Inactive

| # | Service | Active today? | Trigger to activate |
|---|---|---|---|
| 1 | PostgreSQL (Prisma 7 + pg adapter) | ✅ Always required | Set `DATABASE_URL` |
| 2 | Redis (BullMQ + presence) | ✅ Always required | Set `REDIS_URL` |
| 3 | JWT auth (access + refresh) | ✅ Active | Secrets required at boot |
| 4 | Socket.IO gateway | ✅ Active | None (needs JWT secret) |
| 5 | BullMQ notification worker | ✅ Active | None (needs Redis) |
| 6 | Cloudflare R2 storage | ⬜ Fallback: local disk | Set 4 `R2_*` vars |
| 7 | Twilio Verify (OTP) | ⬜ Fallback: dummy `123456` | Set 3 `TWILIO_*` vars |
| 8 | Twilio SMS | ⬜ Fallback: console log | Set `TWILIO_*` + `TWILIO_PHONE_NUMBER` |
| 9 | Firebase FCM push | ⬜ Fallback: console log | Set `FCM_SERVICE_ACCOUNT_JSON` |
| 10 | Hostinger SMTP email | ⬜ Fallback: console log | Set 4 `SMTP_*` vars |
| 11 | Mapbox Places | ⬜ Fallback: empty list | Set `MAPBOX_ACCESS_TOKEN` |
| 12 | RevenueCat webhook | ⚠️ Active but **unauthenticated** without secret | Set `REVENUECAT_WEBHOOK_SECRET` |
| 13 | Google Sign-in | ⚠️ Active but **token signature is never verified** — only base64-decoded (§8 #7) | Fix in code, not config |
| 14 | AI (OpenAI/Anthropic) | ❌ Stub, never imports | Build the module first |
| 15 | Admin API | ❌ Stub, never imports | Build the module first |

---

## 5. Modules Aligned with Admin vs. User Roles

### Current reality: **zero admin endpoints exist**

- `src/modules/admin/` contains an empty module file and an empty types file. It is **commented out and not imported** into `app.module.ts`.
- `@Roles()` decorator and `RolesGuard` exist in `src/common/` and work — but are **applied to zero controllers**.
- The `Role` enum has only **`USER` | `ADMIN`**. The admin spec's `SUPER_ADMIN`, `MODERATOR`, `SUPPORT` roles **do not exist** and would require enum migration + staff-management tables.
- `isUserVerified` (the trust badge) is designed to be admin-granted, but **no endpoint anywhere can set it** — including for admins.

### Endpoints the admin panel can reuse today (no build needed)

| Endpoint | Why it's reusable |
|---|---|
| `POST /images/upload` | Generic authenticated upload to R2 — works for any logged-in user, admin included |
| `GET /dates/places/search` | Generic Mapbox proxy |
| `GET /subscriptions/plans` | Public catalog read |
| `POST /subscriptions/webhook` | Shared infrastructure (RevenueCat targets it directly) |
| Socket.IO gateway | Support/monitoring connections with a valid JWT |

### Admin functionality that must be built (from the 68-endpoint spec)

Priority order based on what is currently **broken without it**:

1. **Report moderation** — reports can never leave `PENDING` today. Highest priority.
2. **Success-story approval** — stories can never leave `PENDING` today.
3. **Verification badge (`isUserVerified`)** — the badge exists in the schema and the Flutter app gates discovery partially on it, but nobody can grant it.
4. **Selfie review workflow** — meaningful only after real face comparison is built (§2).
5. User management (suspend/delete/edit), dashboard KPIs, analytics, broadcasts, audit logs, staff/roles, settings — all greenfield.

### Schema conflicts between the admin spec and the actual database

The developer's admin spec assumes values that **do not exist** in the schema. These must be reconciled before building:

| Admin spec assumes | Actual schema |
|---|---|
| Roles: `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `SUPPORT` | `Role` enum: `USER`, `ADMIN` only |
| Trust tiers: `BRONZE`, `SILVER`, `GOLD` | Tiers are computed: `EXCELLENT`, `GOOD`, `AVERAGE`, `NEEDS_ATTENTION` |
| Plans: `PREMIUM`, `VIP` | `SubscriptionPlan`: `WEEKLY`, `MONTHLY`, `YEARLY` |
| Subscription status incl. `PAST_DUE` | `SubscriptionStatus`: `ACTIVE`, `EXPIRED`, `CANCELLED` |
| Match status incl. `EXPIRED`, `UNLINKED`, `DATE_PLANNED` | `MatchStatus`: `ACTIVE`, `UNMATCHED` |
| Report status `PENDING`, `RESOLVED`, `DISMISSED` | `ReportStatus`: `PENDING`, `REVIEWING`, `RESOLVED`, `DISMISSED` |
| Story status `APPROVED` | `StoryStatus`: `PENDING`, `PUBLISHED`, `REJECTED` |
| Game types incl. `TRUTH_OR_DARE`, `COMPATIBILITY` | `GameType`: `THIS_OR_THAT`, `ICEBREAKER` |
| 48h match `expiresAt` / `remainingMinutes` | **No expiry field exists on Match at all** (§8 #2) |
| New tables needed | `AdminAuditLog`, `SystemSetting`, `StaffPermission` — spec is correct that these don't exist |

---

## 6. Database Seeds — What Exists & How to Manage

**There are no seed "modes".** There is one command and three seed files, run in order:

```bash
npm run db:seed
```

| File (in `prisma/seeds/`) | What it creates |
|---|---|
| `games.seed.ts` | Icebreaker games + question decks |
| `users.seed.ts` | 7 demo accounts with full verified profiles, images, preferences + **1 blank account** (`+8801811000008`, for testing first-time onboarding) + **1 far-away account** (~190 km, for testing distance filtering) |
| `social.seed.ts` | The relational data: 2 matches (one with messages, a finished game, a completed date + ratings; one with a pending date invite), trust scores + events, a block, a report, an active + an expired subscription, a published success story with likes and comments, notifications |

Properties (worth knowing before demoing):

- **Idempotent** — safe to re-run; restores the documented demo state.
- **Prunes** — removes swipes, matches, and half-created accounts that `POST /auth/login` generates for unknown identifiers, so a re-seed always restores the clean state.
- Demo login: phone `+8801811000001` (Ava Stone), OTP `123456` (dummy mode).
- Reset everything (⚠️ wipes all local data): `npx prisma migrate reset --force`.

To add new seed data: add a new file under `prisma/seeds/` and register it in `prisma/seed.ts` (order matters for foreign keys). The earlier handoff doc's claim of "two seeds" was wrong — it's three (§8 #5).

---

## 7. Docker — What Runs Where

`docker-compose.yml` defines **three** services:

| Service | Image | Host port | Notes |
|---|---|---|---|
| `postgres` | postgres:16-alpine | **5433** (not 5432!) | Health-checked. `DATABASE_URL` must use port **5433** locally — both the dev doc and `.env.example` say 5432, which is wrong for this compose file |
| `redis` | redis:7-alpine | 6379 | Health-checked |
| `app` | built from `Dockerfile` | 3000 | Production-style container (runs `prisma migrate deploy` then starts). **Not used for daily dev** |

**The documented development workflow runs only the first two in Docker;** the API itself runs on the host via `npm run start:dev`. The dev doc's claim that "all core backend services are running together inside Docker" describes the optional `app` service, not the normal dev setup.

**Verification status of this machine (2026-09-26):** the `docker` CLI is not available in this environment (`command not found`), so it could not be confirmed whether any containers are currently up. To check on your machine:

```bash
docker compose ps        # or: docker ps
```

Expected for dev: `date48-postgres` and `date48-redis` Up (healthy), and the API running via `npm run start:dev` on port 3000.

```bash
docker compose up -d postgres redis   # start just the dev dependencies
```

---

## 8. Corrections to the Developer's Documents

The two handoff documents mix real facts with **materially false statements**. Each item below was verified directly against the code:

| # | Claim in developer's docs | Reality (verified in code) |
|---|---|---|
| 1 | "Facial recognition/verification… compares a live user selfie against profile pictures to verify identity" and "confidence score" | **False.** `face-verification.service.ts` uploads the file and sets `selfieVerified: true`. A code search for face-api / tensorflow / compare / similarity / confidence / detect in the module returns **zero matches**. No face analysis of any kind exists. The admin spec's `similarityConfidence` field would be invented data. |
| 2 | "Enforces the 48-hour expiration rule" / match "countdown" / `expiresAt` on matches | **False.** The `Match` model has only `matchedAt` / `unmatchedAt` — **no expiry field** — and no countdown logic exists anywhere in `src/`. "48" is the brand name only. Any admin UI showing `remainingMinutes` would display fiction. |
| 3 | "Handles image uploads, **deduplication**" and "saves image metadata and URLs in PostgreSQL" (images module) | **False.** Upload writes the file to R2/local and returns a URL. No hashing, no dedup, no BullMQ image job. `Image` rows are only created later via `PATCH /users/profile-setup` nested writes. This also violates AGENTS.md's non-negotiable image-handling rule. |
| 4 | Mapbox fallback "returns simulated mock venues for testing" | **False.** `dates.service.ts` `searchPlaces()` returns an **empty array** `[]` when no token is set (explicitly logged: "Returning empty places list"). |
| 5 | "We have currently created **two** main seeds: User Seed, Game Seed" | **Wrong.** There are **three**: `games.seed.ts`, `users.seed.ts`, and `social.seed.ts` — the third creates matches, messages, dates, ratings, trust scores, subscriptions, stories, blocks, reports, and notifications. |
| 6 | RevenueCat: "queries RevenueCat live APIs for customer subscription entitlements" | **False.** The service never calls RevenueCat's API. It validates the webhook's `Authorization` header (and only if `REVENUECAT_WEBHOOK_SECRET` is set) and stores events. `REVENUECAT_API_KEY` is read by nothing. |
| 7 | "Authenticates or registers a user via Google OAuth ID token" | **Misleading.** The ID token's **signature is never verified** — the code base64-decodes the payload and reads `email`. Any well-formed JWT with an email claim is accepted. This is an account-takeover hole and is flagged in the README's known gaps. |
| 8 | "Logout… securely logs out the user and invalidates the session" | **False.** Logout is stateless: it verifies the token and returns. Nothing is invalidated server-side. |
| 9 | Login "sends OTP to the user's phone number **or email address**" | **False.** Login is **phone-only** (`LoginDto` accepts just `phone`). Email reaches an account only through Google sign-in. The Postman collection and README both state this explicitly. |
| 10 | Trust badge tiers "e.g. BRONZE, SILVER, GOLD" (both docs) | **False.** Tiers are `EXCELLENT` / `GOOD` / `AVERAGE` / `NEEDS_ATTENTION` (computed in `trust-score.service.ts`). |
| 11 | Admin doc's "REUSABLE USER-SIDE APIS" section | **Mostly accurate**, with one error: it says `POST /images/upload` "processes images" — it does not process anything; it validates MIME/size and stores the file. |
| 12 | FAQ: "all core backend services are running together inside Docker containers… When Docker Desktop is running, all services are active" | **Misleading.** Dev workflow is 2 containers (Postgres + Redis) + host-run API. The `app` container is an optional production-style service. Also unverified on this machine — Docker CLI not present here (§7). |
| 13 | Auth endpoint inventory omits nothing important | Mostly accurate — but note `POST /chat/conversations/:id/messages` (REST send) **does exist now**; some older sections of the docs describe chat send as WebSocket-only. |

### Security gaps the docs failed to mention (must be fixed before any production launch)

1. **Dummy OTP `123456` is accepted unconditionally** — *before* Twilio is consulted and with no environment guard. Even with Twilio fully configured, `123456` verifies any phone number. This is the single most dangerous line in the codebase.
2. **Google ID token signatures are not verified** (see §8 #7).
3. **RevenueCat webhook auth is skipped entirely** when `REVENUECAT_WEBHOOK_SECRET` is unset.
4. **JWT secrets ship as `changeme`** in `.env.example` — fine for placeholders, but there is no startup validation that rejects them in production.
5. **No rate limiting** anywhere except the OTP 30-second cooldown.

---

## 9. Recommended Next Steps (priority order)

1. Fix the three security holes above (env-guard the dummy OTP, verify Google signatures, require the RevenueCat secret).
2. Build **admin report moderation + story approval + badge granting** — three features are currently dead-ended by their absence.
3. Add device-token registration and a notifications-list endpoint (push notifications are otherwise unreachable in production).
4. Implement the real face-verification pipeline (non-negotiable per project requirements).
5. Implement the BullMQ image optimization/dedup pipeline per the architecture rules.
6. Decide the 48-hour match countdown — it is central to the product concept and the admin spec, but does not exist in the schema or code.
7. Reconcile the admin spec's enum assumptions with the actual schema (§5 table) before writing any admin code.
8. Add real test coverage (currently 2 files).

---

## 10. Quick Reference

```bash
# Local dev
docker compose up -d postgres redis
npm install
cp .env.example .env          # DATABASE_URL must use port 5433
npx prisma migrate deploy && npx prisma generate
npm run db:seed
npm run start:dev             # http://localhost:3000

# Verify / maintain
npm run lint && npm run build
npm run test
npx prisma validate
```

Demo login: `+8801811000001` · OTP `123456` (dummy mode).
