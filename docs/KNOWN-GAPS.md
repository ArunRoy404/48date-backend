# 48Date Backend — Known Gaps & Deferred Work

**Last updated:** 2026-09-28 · **Branch:** `roy`

This file tracks everything that was **deliberately skipped, deferred, or simplified** during the security-hardening pass — plus the longer-term issues identified in the full project analysis that are not yet fixed. Read this before assuming any feature is production-complete.

Companion documents: [`docs/BACKEND-STATUS.md`](./BACKEND-STATUS.md) (full module-by-module status), [`docs/DEVELOPER-DOC-DISCREPANCIES.md`](./DEVELOPER-DOC-DISCREPANCIES.md) (fact-check of the handoff docs).

---

## 1. What the hardening passes fixed (2026-09-28)

**Pass 1 — auth & config:**

| Issue | Fix |
|---|---|
| Dummy OTP `123456` accepted unconditionally, even in production | `otp.service.ts` rewritten: dummy code only accepted in **development** when the channel's provider is missing; production **fails closed** with 503; dummy rejected whenever the provider is configured |
| Google ID token signature never verified (account takeover) | `auth.service.ts` verifies signature via Google's JWKS (`jose`), checks issuer, audience (`GOOGLE_CLIENT_ID`), expiry, and `email_verified` |
| JWT access/refresh tokens structurally identical | Both carry `tokenType` + `jti` claims; refresh endpoint rejects non-refresh tokens; JWT strategy rejects non-access tokens; expiry driven by `JWT_*_EXPIRES_IN` env vars; production refuses to boot with `changeme` secrets |
| No rate limiting | `@nestjs/throttler` wired globally via `RateLimitGuard`, armed by `RATE_LIMIT_ENABLED` (default **false**); auth endpoints get a stricter cap (`RATE_LIMIT_AUTH_PER_MINUTE`) |
| Email OTP had no real delivery path | Real flow: crypto-generated 6-digit code → hashed in Redis (10 min TTL, 5 attempts) → SMTP email. Responds with a readable, masked-destination message — never the code itself |
| `.env` did not exist; `.env.example` wrong port, stray `[TEMPLATE]`, missing `TWILIO_PHONE_NUMBER` | `.env` created with generated secrets (gitignored); `.env.example` corrected (port **5433**, all vars documented) |

**Pass 2 — P0 correctness & safety bugs (see §5 for the fixed list):** chat closed after unmatch/block, swipe-race 500, upload content-spoofing (magic-byte sniffing), Windows test scripts.

---

## 2. Deliberately deferred (by decision, this pass)

| # | Item | Why deferred | What must happen before production |
|---|---|---|---|
| 1 | **RevenueCat webhook authentication** | Per decision: "keep as is for now, do after production planning" | Set `REVENUECAT_WEBHOOK_SECRET` in production env. **Until then anyone can POST a fake purchase and grant themselves premium.** The code already supports the check — it is skipped only while the secret is unset |
| 2 | **CORS lockdown** | Per decision: "keep as is, we are in development" | `main.ts` (`app.enableCors()`) and `chat.gateway.ts` (`origin: '*'`) must be restricted to the real app/admin domains |
| 3 | **Socket.IO `?token=` query auth** | Kept for Flutter client compatibility | Move the gateway to the `auth` handshake payload only; query-string tokens leak into logs/proxies |
| 4 | **Local-upload URL hardcoding** | Dev-only path | `images.service.ts` builds `http://localhost:${port}/uploads/...` — must use the real origin/CDN base in any deployed environment |
| 5 | **Logout is stateless** | Acceptable for MVP | Redis JWT blacklist / token revocation if "log out everywhere" is ever required |

---

## 3. Dead-ended features — blocked until the admin API exists

These work exactly as far as their current endpoints allow, then stop. All are unblocked by building the admin module (currently a commented-out, unregistered stub):

1. **Reports** — created `PENDING`; no endpoint can transition status. Moderation is impossible.
2. **Success stories** — created `PENDING`; no endpoint can publish/reject. `GET /success-stories` defaults to `PUBLISHED`, so new stories are invisible forever.
3. **`isUserVerified` badge** — schema says admin-granted; no setter exists anywhere, not even for admins. The Flutter app gates discovery on it.
4. **Device/FCM registration** — the `Device` table and FCM sending code exist, but **no endpoint writes a device token**. Push notifications have no production path.
5. **In-app notifications** — rows are written by the processor and date flows, but there is no `GET /notifications` and `readAt` is never set. Unreadable by clients.

---

## 4. Architecture-rule violations (per AGENTS.md, still open)

| Rule | Status |
|---|---|
| #1 Image pipeline: BullMQ optimize/dedup → R2, DB stores hash+metadata only | ❌ Not built. Upload streams straight to R2/local; no hash, no dedup, no DB metadata write |
| #2 Face verification: server-side detection/comparison | ❌ Not built. `face-verification` module uploads a selfie and sets `selfieVerified: true` — no face analysis of any kind |
| Trust score via background jobs | ⚠️ Updates run synchronously in request paths; only notifications use BullMQ |
| 48-hour match expiry | ❌ Does not exist in schema or code — decide: build it or remove it from the product spec |

---

## 5. Known bugs / gaps still open (from the full analysis)

**Fixed since the last revision of this file (2026-09-28, P0 pass):**
- ✅ Chat/games now **closed after unmatch or block** — `chat.service.ts` and the gateway require match `status === 'ACTIVE'`; history becomes unreadable and sends fail with 403. Regression tests added.
- ✅ **Swipe race no longer 500s** — `createMatch` recovers from the P2002 unique-violation by returning the winner's row (with a `created` flag so re-likes don't re-announce); `discoveryAction` upsert race is tolerated.
- ✅ **Upload content-spoofing fixed** — extension/ContentType now derive from sniffed magic bytes (`common/utils/image-type.ts`), not the client-declared MIME or original filename; a renamed `.html` is rejected. Tests added. (R2 and local paths both covered; face-verification uploads inherit the fix via `uploadImage`.)
- ✅ **`npm test` works on Windows** — scripts use `cross-env`.

**Still open:**

**Reliability:**
- `npm run test:e2e` fails — scaffold expects `GET /` → `Hello World!`, which doesn't exist.
- No `enableShutdownHooks()` in `main.ts` — SIGTERM skips Prisma disconnect / BullMQ worker close.
- Local-upload URLs are hardcoded `http://localhost:${port}` (dev-only path; matters if uploads/ fallback is ever used in a deployed env).

**Scalability (fine for MVP, will bite later):**
- Discovery: bounding box + in-memory Haversine over `take: 200` — needs PostGIS (`ST_DWithin`) once the candidate pool grows.
- Socket.IO: single instance only — Redis presence is written but never read; no socket.io-redis adapter.
- Subscription plan inference substring-matches product IDs and defaults unknowns to `MONTHLY`.
- No health-check endpoint (important on a single self-hosted VPS).
- Abandoned game sessions stay `IN_PROGRESS` forever (no TTL job).
- Refresh tokens: no rotation, no reuse detection (rotation on refresh is the standard fix).

**Environment notes:**
- `FCM_SERVICE_ACCOUNT_JSON` is read via raw `process.env` in two services, bypassing `env.config.ts` — consolidate when touched next.
- Two lockfiles exist (`package-lock.json` + `pnpm-lock.yaml`); pick one package manager.
- `test/app.e2e-spec.ts` warning (`no-unsafe-argument`) is pre-existing scaffold noise.

---

## 6. Test coverage status

- `api-response.util.spec.ts` — response envelope (4 tests, passing)
- `otp.service.spec.ts` — **new**: cooldown, dispatch stamping, and the dev/prod/provider dummy-code matrix
- Everything else — **untested**. Priority when adding coverage: auth flows, chat authorization (incl. the block/unmatch gap), dates state machine, trust-score math.

---

## 7. Production launch checklist (condensed)

1. Set `NODE_ENV=production` + real `JWT_*` secrets (boot fails on `changeme` — by design).
2. Set `REVENUECAT_WEBHOOK_SECRET` (deferred above — the one security hole knowingly left open).
3. Restrict CORS in `main.ts` + `chat.gateway.ts`.
4. `STRICT_URL_VALIDATION=true`.
5. `RATE_LIMIT_ENABLED=true`.
6. Set `GOOGLE_CLIENT_ID` (Google sign-in rejects all tokens without it in production).
7. Set Twilio/SMTP credentials — missing providers **fail closed** in production; sign-in/verification return 503 rather than dummy codes.
8. Build admin moderation (reports/stories/badge) before onboarding real users — otherwise safety reports go nowhere.
9. Add device-token registration + `GET /notifications` before relying on push.
