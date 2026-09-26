# 48Date Backend — Developer Handoff Discrepancy Report

**Branch:** `roy` · **Report date:** 2026-09-26 · **Scope:** fact-check of the two documents provided by the developer ("48Date Backend API — Comprehensive Features & Routes" and "48Date Super Admin Backend API — Specification") against the actual source code.

Every item below was verified directly against files in this repository (`src/`, `prisma/`, `docker-compose.yml`, `.env.example`, `README.md`, `postman/`). Companion document: [`docs/BACKEND-STATUS.md`](./BACKEND-STATUS.md) (full verified status & handoff report).

---

## ❌ FALSE information (claims contradicted by the code)

| # | What your developer wrote | What the code actually does |
|---|---|---|
| 1 | **"Facial recognition/verification… compares a live user selfie against profile pictures… confidence score"** | **No face analysis exists at all.** `src/modules/face-verification/face-verification.service.ts` uploads the file and sets `selfieVerified: true`. Searching the module for `face-api`, `tensorflow`, `compare`, `similarity`, `confidence`, `detect` returns **zero matches**. This is the single biggest false claim — the admin spec's entire verification-review module (with its `similarityConfidence` field) is built on a feature that doesn't exist. |
| 2 | **"Enforces the 48-hour expiration rule" / match "countdown" / `expiresAt`, `remainingMinutes`** | The `Match` model (`prisma/models/match.prisma`) has only `matchedAt` / `unmatchedAt` — **no expiry field** — and no countdown logic exists anywhere in `src/`. The admin spec's matches module would display fiction. |
| 3 | **"Handles image uploads, deduplication… saves image metadata in PostgreSQL"** | **No dedup, no hashing, no processing, no DB write on upload.** `src/modules/images/images.service.ts` validates MIME/size and writes the file to R2/local. (Also violates the project's own non-negotiable architecture rule #1 in `AGENTS.md`.) `Image` rows are only created later via `PATCH /users/profile-setup` nested writes. |
| 4 | **Mapbox fallback "returns simulated mock venues"** | Returns an **empty array `[]`** — `src/modules/dates/dates.service.ts` explicitly logs *"MAPBOX_ACCESS_TOKEN not configured. Returning empty places list."* |
| 5 | **"We have currently created two main seeds: User Seed, Game Seed"** | There are **three** in `prisma/seeds/`: `games.seed.ts`, `users.seed.ts`, and **`social.seed.ts`** — the one that creates matches, messages, dates, ratings, trust scores, subscriptions, stories, blocks and reports. They forgot the most important one. |
| 6 | **RevenueCat "queries RevenueCat live APIs for customer subscription entitlements"** | `subscriptions.service.ts` **never calls RevenueCat's API**. It only checks the webhook's `Authorization` header (and only if the secret is set). `REVENUECAT_API_KEY` is read by **nothing** in the codebase. |
| 7 | **"Logout… invalidates the session"** | Logout is **stateless** — it verifies the token and returns. Nothing is invalidated server-side. |
| 8 | **"Login sends OTP to the user's phone number or email address"** | Login is **phone-only** — `LoginDto` accepts exactly one field, `phone`. Email reaches an account only via Google sign-in (`POST /auth/google`). |
| 9 | **Trust tiers "BRONZE, SILVER, GOLD"** (in both docs) | Actual computed tiers in `trust-score.service.ts`: **EXCELLENT / GOOD / AVERAGE / NEEDS_ATTENTION**. |
| 10 | **"All core backend services are running together inside Docker containers… When Docker Desktop is running, all services are active"** | Misleading. The dev workflow is **2 containers** (Postgres + Redis) with the API running on the host via `npm run start:dev`. The `app` container is an optional production-style service. Also note: Docker CLI is not available on the machine where this was verified, so nothing could be confirmed as running. |

---

## ⚠️ INCONSISTENT information (docs contradict the code, each other, or themselves)

1. **Endpoint counts don't match anything:** features doc says **52**, README says **54**, Postman says **51**, actual count is **57** (the REST chat-send endpoint `POST /chat/conversations/:id/messages` exists in code now — some sections of the docs still describe sending as WebSocket-only).
2. **The admin spec invents enums that don't exist in the schema** — none of these can be used without migrations:
   - Roles `SUPER_ADMIN` / `MODERATOR` / `SUPPORT` → actual `Role` enum (`prisma/enums/role.prisma`): `USER`, `ADMIN` only
   - Trust tiers `BRONZE` / `SILVER` / `GOLD` → contradicts the code **and** the developer's own features doc
   - Plans `PREMIUM` / `VIP`, status `PAST_DUE` → actual: `WEEKLY` / `MONTHLY` / `YEARLY`; `ACTIVE` / `EXPIRED` / `CANCELLED`
   - Match status `EXPIRED` / `UNLINKED` / `DATE_PLANNED` → actual: `ACTIVE` / `UNMATCHED`
   - Story status `APPROVED` → actual: `PENDING` / `PUBLISHED` / `REJECTED`
   - Game types `TRUTH_OR_DARE` / `COMPATIBILITY` → actual: `THIS_OR_THAT` / `ICEBREAKER`
3. **`DATABASE_URL` port:** the developer's doc and `.env.example` say **5432**, but `docker-compose.yml` maps Postgres to **5433** (`README.md` correctly says 5433). Copying their config breaks the database connection.
4. **Admin doc claims "100% Non-Breaking: Zero changes made to existing application code"** — yet its own appendix requires new tables (`AdminAuditLog`, `SystemSetting`, `StaffPermission`), role-enum extensions, and tier rework. Not zero-change.
5. **"Admin Module (Architecture Scaffolded)"** — overstated. It's a **commented-out empty file that isn't even registered** in `src/app.module.ts`. "Scaffolded" implies something usable exists.
6. **The reusable-APIs section says `POST /images/upload` "processes images"** — it only validates and stores; contradicts itself with reality.

---

## 🕳️ MISSING from the handoff (things you were not told)

### Security holes — completely unmentioned

1. **Dummy OTP `123456` is accepted unconditionally** — *before* Twilio is ever consulted, with no environment guard (`src/common/otp/otp.service.ts`). Even with Twilio fully configured, `123456` verifies any phone number. Most dangerous line in the codebase.
2. **Google ID token signatures are never verified** — only base64-decoded (`auth.service.ts` `googleLogin`). Any well-formed JWT with an `email` claim logs you in. Account-takeover hole.
3. **RevenueCat webhook auth is skipped entirely** when `REVENUECAT_WEBHOOK_SECRET` is unset.
4. **JWT secrets ship as `changeme`** in `.env.example` with no startup validation rejecting them in production.
5. **No rate limiting** anywhere except the OTP 30-second cooldown.

### Broken/dead-end features — not flagged

6. **Reports can never be reviewed** — created `PENDING`, no endpoint can change it.
7. **Success stories can never be published** — same dead end.
8. **Nobody can grant the `isUserVerified` badge** — not even an admin. The badge is a core product concept with no setter anywhere in the codebase.
9. **Push notifications have no production path** — the `Device` table and FCM sending exist, but there is **no endpoint to register a device token**.
10. **In-app notifications are written but unreadable** — the processor saves `Notification` rows, but there is no `GET /notifications`.
11. **The 48-hour countdown doesn't exist** — central to the product concept and the developer's entire admin matches module; it was claimed as done rather than flagged as missing.

### Other omissions

12. **Test coverage is ~0%** — 2 spec files in the whole repo. Never mentioned.
13. **`TWILIO_PHONE_NUMBER` is read by `notifications.service.ts` but missing from `.env.example`** — not flagged.
14. No health-check endpoint, no token revocation/blacklist, no Socket.IO multi-instance scaling (presence is written to Redis but never read).
15. The Docker FAQ gave no way to verify container state and didn't mention that running the API in a container is optional.

---

## Verdict

The **user-side feature inventory is broadly accurate** — the 14 modules and their routes genuinely exist and work. The admin spec is a reasonable *plan*. However, the documents **dress up missing work as done**: face verification, the 48-hour countdown, and image dedup are either absent or cosmetic, and the security holes that block any production launch were omitted entirely.

**Recommendation:** treat every "implemented" claim from that handoff as unverified until checked against the code — or have the developer re-verify against [`docs/BACKEND-STATUS.md`](./BACKEND-STATUS.md), which documents each of these points with file-level evidence.

---

## Before production launch — the blocking list

1. Env-guard the dummy OTP (fail closed when `TWILIO_*` is configured).
2. Verify Google ID token signatures (Google's public keys / JWKS).
3. Require `REVENUECAT_WEBHOOK_SECRET` in production.
4. Build admin report moderation + story approval + badge granting (three dead-ended features).
5. Add device-token registration + `GET /notifications`.
6. Implement real face verification and the image dedup pipeline (non-negotiable per `AGENTS.md`).
7. Decide on and build the 48-hour match countdown, or remove it from the spec.
8. Replace `changeme` JWT secrets and add startup validation.
9. Add real test coverage.
