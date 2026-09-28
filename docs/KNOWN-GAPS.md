# 48Date Backend — Known Gaps & Deferred Work

**Last updated:** 2026-09-28 · **Branch:** `roy`

This file tracks everything that was **deliberately skipped, deferred, or simplified** during the hardening passes — plus the longer-term issues identified in the full project analysis that are not yet fixed. Read this before assuming any feature is production-complete.

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

**Pass 3 — P1 dead-ended features (see §3):** devices/FCM, notifications inbox, admin moderation core.

**Pass 4 — P2 architecture gaps (see §4/§5):**

| Item | What was built |
|---|---|
| Graceful shutdown | `main.ts` enables shutdown hooks — SIGTERM drains the HTTP server, stops the BullMQ worker, disconnects sockets, closes Prisma last |
| Health check | `GET /health` (public) pings Postgres + Redis with a 3s timeout; `200 { status, uptimeSeconds, checks }` or `503` naming the down dependency |
| Image pipeline (rule #1) | `sharp` WebP optimization (1600px cap, EXIF strip, orientation bake) via the `images` BullMQ queue; SHA-256 of processed bytes → dedup; `Image` rows now carry hash/width/height/bytes. Uploads succeed even when the queue is down (just unoptimized) |
| 48h match expiry | `Match.expiresAt` set at creation; the **first message clears it** (same transaction) making the match permanent; a repeatable `match-expiry` sweep (5 min) flips lapsed matches to `UNMATCHED`; `M-01` returns `expiresAt` for the app's countdown banner |
| e2e scaffold | Replaced the `Hello World!` relic with a real smoke test: boots AppModule against Docker Postgres/Redis, asserts `/health` 200 + guarded-route 401 |
| Face verification | **Deferred by product decision** — see §2 item 6. `selfieVerified` is self-declared for now |

⚠️ **Deploy note:** this pass ships a Prisma migration (`20260928120000_image_hash_and_match_expiry`) and a new native dependency (`sharp`) — run `npx prisma migrate deploy` and rebuild the Docker image on deploy.

---

## 2. Deliberately deferred (by decision, this pass)

| # | Item | Why deferred | What must happen before production |
|---|---|---|---|
| 1 | **RevenueCat webhook authentication** | Per decision: "keep as is for now, do after production planning" | Set `REVENUECAT_WEBHOOK_SECRET` in production env. **Until then anyone can POST a fake purchase and grant themselves premium.** The code already supports the check — it is skipped only while the secret is unset |
| 2 | **CORS lockdown** | Per decision: "keep as is, we are in development" | `main.ts` (`app.enableCors()`) and `chat.gateway.ts` (`origin: '*'`) must be restricted to the real app/admin domains |
| 3 | **Socket.IO `?token=` query auth** | Kept for Flutter client compatibility | Move the gateway to the `auth` handshake payload only; query-string tokens leak into logs/proxies |
| 4 | **Local-upload URL fallback** | Dev-only path; P2 pass centralized all URL building in `image-metadata.util.ts` (`buildImageUrl`/`urlToStorageKey`) driven by `R2_PUBLIC_URL` | Configure `R2_PUBLIC_URL` in any deployed environment; without it URLs still point at `http://localhost` |
| 5 | **Logout is stateless** | Acceptable for MVP | Redis JWT blacklist / token revocation if "log out everywhere" is ever required |
| 6 | **Face verification (rule #2)** | **Deferred by product decision (2026-09-28):** no face analysis now; `P-04` stores the selfie and sets `selfieVerified: true` unconditionally — the flag is **self-declared/cosmetic**. The trust system leans on phone/email verification + admin badges until then | Server-side selfie-vs-photos comparison (`@vladmandic/face-api` or a Python microservice) in a BullMQ worker, threshold tuning, and honest client copy before marketing any "verified" badge |

---

## 3. Dead-ended features — ✅ all five resolved in the P1 pass (2026-09-28)

These worked exactly as far as their current endpoints allowed, then stopped. All five are now built and registered in `app.module.ts` (devices module, notifications read API, admin module — the previously commented-out stub is now live):

1. ✅ **Reports** — `GET /admin/reports` (+ status filter) and `POST /admin/reports/:id/review` (`REVIEWING` / `RESOLVED` / `DISMISSED`, `resolution` note, `reviewedBy`/`reviewedAt` stamped). Terminal reports cannot be re-reviewed. Dismissing a report refunds the −10 trust penalty; RESOLVED keeps it.
2. ✅ **Success stories** — `GET /admin/stories` (oldest-first FIFO) and `POST /admin/stories/:id/review` (`PUBLISHED` / `REJECTED`, PENDING-only). New stories are finally visible in `SS-02`.
3. ✅ **`isUserVerified` badge** — `PUT /admin/users/:id/verification-badge` grants/revokes (idempotent); the false→true flip records a `VERIFICATION` trust event. `RolesGuard` + `@Roles(Role.ADMIN)` guard every `/admin/*` route — their first real use.
4. ✅ **Device/FCM registration** — new `DevicesModule`: `POST /devices` (upsert keyed on `fcmToken`, reassigning ownership when a token moves between accounts), `DELETE /devices/:token` (ownership-checked, 404s identically for foreign/missing tokens), `GET /devices` (token masked to an 8-char preview). Push now has a production path.
5. ✅ **In-app notifications** — `GET /notifications` (limit/offset/unread/type + `unreadCount`/`total`), `POST /notifications/:id/read`, `POST /notifications/read-all`, `DELETE /notifications/:id`. Rows expose `isRead` (`readAt !== null`); all ownership-checked.

Admin routes are built against the enums the schema actually accepts (see §5 of [`BACKEND-STATUS.md`](./BACKEND-STATUS.md)), not the invented ones in the Postman ADMIN spec — the remaining ~74 admin requests (dashboard, user management, broadcasts, …) are still unbuilt.

> ⚠️ To actually create an admin: `UPDATE "User" SET role = 'ADMIN' WHERE id = '…'` — there is no bootstrap endpoint or CLI, by design (no self-service privilege escalation).

---

## 4. Architecture-rule status (per AGENTS.md)

| Rule | Status |
|---|---|
| #1 Image pipeline: BullMQ optimize/dedup → R2, DB stores hash+metadata only | ✅ **Built in the P2 pass.** Validate (magic bytes) → optimize (`sharp` → WebP, 1600px, EXIF stripped) via the `images` queue → dedup (SHA-256 of processed bytes) → `Image` row with hash/width/height/bytes. Blobs only in R2/local; queue-down degrades to unoptimized, never to failure |
| #2 Face verification: server-side detection/comparison | ⏸️ **Deferred by product decision** (§2 item 6). `selfieVerified` is set unconditionally — self-declared, not verified |
| Trust score via background jobs | ⚠️ Trust updates still run synchronously in request paths; the async jobs that exist are notifications, image optimization and match expiry |
| 48-hour match expiry | ✅ **Built in the P2 pass** — `Match.expiresAt` + first-message permanence + 5-minute sweep (see §1) |

---

## 5. Known bugs / gaps still open (from the full analysis)

**Fixed since the last revision of this file (2026-09-28, P0 pass):**
- ✅ Chat/games now **closed after unmatch or block** — `chat.service.ts` and the gateway require match `status === 'ACTIVE'`; history becomes unreadable and sends fail with 403. Regression tests added.
- ✅ **Swipe race no longer 500s** — `createMatch` recovers from the P2002 unique-violation by returning the winner's row (with a `created` flag so re-likes don't re-announce); `discoveryAction` upsert race is tolerated.
- ✅ **Upload content-spoofing fixed** — extension/ContentType now derive from sniffed magic bytes (`common/utils/image-type.ts`), not the client-declared MIME or original filename; a renamed `.html` is rejected. Tests added. (R2 and local paths both covered; face-verification uploads inherit the fix via `uploadImage`.)
- ✅ **`npm test` works on Windows** — scripts use `cross-env`.

**Fixed in the P1 pass (dead-ended features, see §3):**
- ✅ Devices/FCM registration module (`devices.service.spec.ts` — 6 tests: upsert, reassignment, ownership-checked unregister, list)
- ✅ Notifications read API (`user-notifications.service.spec.ts` — 7 tests: list filters/pagination, markRead ownership, markAllRead, delete)
- ✅ Admin moderation core (`admin.service.spec.ts` — 13 tests: report lifecycle + trust refund, story approval, badge idempotency, moderation view)

**Fixed in the P2 pass (architecture gaps, see §1/§4):**
- ✅ Graceful shutdown — `enableShutdownHooks()`; SIGTERM now drains HTTP → BullMQ worker → sockets → Prisma instead of killing mid-request
- ✅ `GET /health` — Postgres + Redis ping with timeouts; the uptime-monitor target for the single VPS
- ✅ Image pipeline — sharp WebP optimization + hash dedup + metadata rows (rule #1)
- ✅ 48h match expiry — first-message permanence + repeatable sweep; expired matches go dark immediately via the existing chat guards
- ✅ e2e scaffold — replaced `Hello World!` with a real bootstrap smoke test (`npm run test:e2e`, needs Docker Postgres/Redis)

**Still open:**

**Reliability:**
- Local-upload URL fallback still `http://localhost:${port}` when R2 is unset (dev-only; `R2_PUBLIC_URL` covers every deployed environment — see §2 item 4).

**Scalability (fine for MVP, will bite later):**
- Discovery: bounding box + in-memory Haversine over `take: 200` — needs PostGIS (`ST_DWithin`) once the candidate pool grows.
- Socket.IO: single instance only — Redis presence is written but never read; no socket.io-redis adapter.
- Subscription plan inference substring-matches product IDs and defaults unknowns to `MONTHLY`.
- Abandoned game sessions stay `IN_PROGRESS` forever (no TTL job).
- Refresh tokens: no rotation, no reuse detection (rotation on refresh is the standard fix).

**Environment notes:**
- `FCM_SERVICE_ACCOUNT_JSON` is read via raw `process.env` in two services, bypassing `env.config.ts` — consolidate when touched next.
- Two lockfiles exist (`package-lock.json` + `pnpm-lock.yaml`); pick one package manager.

---

## 6. Test coverage status

- `api-response.util.spec.ts` — response envelope (4 tests, passing)
- `otp.service.spec.ts` — cooldown, dispatch stamping, and the dev/prod/provider dummy-code matrix
- `image-type.spec.ts` — magic-byte sniffing (upload spoofing fix)
- `chat.service.spec.ts` — chat/games closed after unmatch/block (P0 fix) + first message clears the 48h timer (P2)
- `devices.service.spec.ts` — **P1 pass**: device upsert/reassignment/unregister/list (6 tests)
- `user-notifications.service.spec.ts` — **P1 pass**: inbox list/mark-read/delete (7 tests)
- `admin.service.spec.ts` — **P1 pass**: report review lifecycle + trust refund, story approval, badge granting (13 tests)
- `image-pipeline.util.spec.ts` — **P2 pass**: WebP conversion, 1600px cap, EXIF strip + orientation bake, GIF passthrough, hash determinism (9 tests)
- `match-expiry.processor.spec.ts` — **P2 pass**: sweep filter (ACTIVE + lapsed), UNMATCHED flip, countdown cleared (3 tests)
- `app.e2e-spec.ts` — **P2 pass**: bootstrap smoke test (`/health` 200, guarded route 401) — needs Docker Postgres/Redis
- Everything else — **untested** (9 unit suites / 69 tests, all passing). Priority when adding coverage: auth flows, discovery/swipe, dates state machine, trust-score math.

---

## 7. Production launch checklist (condensed)

1. Set `NODE_ENV=production` + real `JWT_*` secrets (boot fails on `changeme` — by design).
2. Set `REVENUECAT_WEBHOOK_SECRET` (deferred above — the one security hole knowingly left open).
3. Restrict CORS in `main.ts` + `chat.gateway.ts`.
4. `STRICT_URL_VALIDATION=true`.
5. `RATE_LIMIT_ENABLED=true`.
6. Set `GOOGLE_CLIENT_ID` (Google sign-in rejects all tokens without it in production).
7. Set Twilio/SMTP credentials — missing providers **fail closed** in production; sign-in/verification return 503 rather than dummy codes.
8. ~~Build admin moderation (reports/stories/badge)~~ ✅ Done in the P1 pass — promote a user to `ADMIN` directly in the DB (no bootstrap endpoint exists) before onboarding real users.
9. ~~Add device-token registration + `GET /notifications`~~ ✅ Done in the P1 pass — set `FCM_SERVICE_ACCOUNT_JSON` for real push delivery.
10. On deploy: `npx prisma migrate deploy` (P2 ships `20260928120000_image_hash_and_match_expiry`) and rebuild the image — `sharp` is a native dependency.
11. Point the uptime monitor at `GET /health` (P2) — it 503s naming the down dependency.
12. `R2_PUBLIC_URL` **must** be set in production — without it image URLs fall back to `http://localhost` (§2 item 4).
