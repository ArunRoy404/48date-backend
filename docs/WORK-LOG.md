# 48Date Backend — Work Log & Handoff

**Last updated:** 2026-09-28 · **Branch:** `roy` · **All work pushed to `origin roy`** (working tree clean as of `7a693c7`)

This file is the handoff between machines/sessions. It records what was done, why, what was deliberately *not* done, and what to check first on a new machine. Read it together with [`docs/KNOWN-GAPS.md`](./KNOWN-GAPS.md) (open/deferred items) and [`docs/BACKEND-STATUS.md`](./BACKEND-STATUS.md) (module-by-module audit).

---

## 1. Session summary — four passes, all complete

| Pass | Scope | Commits | State |
|---|---|---|---|
| **Analysis** | Full project audit → `docs/BACKEND-STATUS.md`, `docs/DEVELOPER-DOC-DISCREPANCIES.md`, `docs/KNOWN-GAPS.md` | `76fab2d` (gaps doc) | ✅ |
| **P0 — security hardening** | Fail-closed OTP, Google JWKS verification, JWT pair hardening, opt-in rate limiting, chat closed after unmatch/block, swipe-race 500, magic-byte upload validation, Windows test scripts | `178f856`…`cd8069f` | ✅ |
| **P1 — dead-ended features** | Devices/FCM, notifications inbox, admin moderation core (reports/stories/badge) | `05dcdfd`, `bd48366`, `af61081` | ✅ |
| **P2 — architecture gaps** | Graceful shutdown + `/health`, real e2e smoke test, image pipeline (sharp + dedup + metadata), 48h match expiry, face verification deferred by decision | `9823be1`…`7a693c7` | ✅ |

**Final verification state (on this machine):** `npm run lint` → 0 problems · `npm run build` → clean · `npm test` → **9 suites / 69 tests, all passing** · `npx prisma validate` → valid.

---

## 2. Commit-by-commit (newest first)

| Commit | What it did |
|---|---|
| `7a693c7` | docs: P2 pass — README image-pipeline/expiry/health sections + stale known-gap bullets removed; KNOWN-GAPS §1/§2/§4/§5/§6/§7 updated; **face verification deferred by product decision** (§2 item 6) |
| `6fbe922` | **48h match expiry**: `Match.expiresAt` set at creation and on re-like; the **first message clears it in the same transaction** (chat.service `saveMessage`); repeatable `match-expiry` BullMQ sweep (5 min) flips lapsed matches to `UNMATCHED`; `M-01` returns `expiresAt`; chat/games guards already refuse non-ACTIVE matches so expiry is enforced even between sweeps |
| `92fca6f` | **Image pipeline**: `sharp` → WebP (1600px long edge, EXIF stripped, orientation baked; GIF passthrough), `images` BullMQ queue with inline fallback when no queue is registered, SHA-256-of-processed-bytes dedup, `Image` metadata rows (hash/width/height/bytes) — uploads now write rows at all (previously only the seed did); URL building centralized in `image-metadata.util.ts`; profile-setup preserves stored metadata when images are re-pointed by URL |
| `92cb0dc` | Schema + migration `20260928120000_image_hash_and_match_expiry` (hand-authored — no local DB available; style-matched to existing migrations) + `sharp` dependency |
| `9823be1` | **Ops**: `enableShutdownHooks()` (HTTP → BullMQ worker → sockets → Prisma drain), `GET /health` (Postgres+Redis ping, 3s timeout, 503 naming the dead dependency), e2e scaffold replaced with a real bootstrap smoke test |
| `af61081` | **Admin moderation core**: 6 routes under `JwtAuthGuard + RolesGuard + @Roles(Role.ADMIN)` — report review (REVIEWING/RESOLVED/DISMISSED, reviewer stamping, dismissal refunds the −10 trust penalty), story approval (PENDING-only), moderation view, idempotent badge. Built against the schema's real enums, not the Postman ADMIN spec's invented ones. Also registered `DevicesModule` + docs |
| `bd48366` | **Notifications inbox**: `GET /notifications` (limit/offset/unread/type + unreadCount/total), mark-read, mark-all-read, delete — all ownership-checked, `isRead` derived from `readAt` |
| `05dcdfd` | **Devices/FCM**: `POST /devices` (upsert keyed on fcmToken, reassigns ownership), `DELETE /devices/:token` (identical 404 for foreign/missing), `GET /devices` (tokens masked to 8-char preview) |
| Earlier (`178f856`…`cd8069f`) | Security pass — see §1 and KNOWN-GAPS §1 |

---

## 3. Decisions made (record them — they drove the code)

1. **Face verification is deferred by product decision** (user, 2026-09-28). `P-04` still sets `selfieVerified: true` unconditionally — the flag is **self-declared/cosmetic**. Real server-side comparison (`@vladmandic/face-api` or Python microservice) is post-MVP. Documented in KNOWN-GAPS §2 item 6.
2. **48h expiry semantics (user-confirmed):** a match expires 48h after creation *unless a message is sent*; the first message makes it **permanent** (no timer reset). Re-like after expiry = fresh 48h window.
3. **Image pipeline stays self-hosted on R2** — user asked whether Cloudinary/AWS would remove the need; answer was no (S3/R2 are dumb byte stores; Cloudinary solves optimization but is a paid vendor + lock-in). `sharp` is the only new dependency.
4. **Admin built against actual schema enums** (PENDING/REVIEWING/RESOLVED/DISMISSED; PENDING/PUBLISHED/REJECTED), not the Postman ADMIN spec's invented ones.
5. **Dismissing a report refunds** the −10 trust penalty via `trustScoreService.addEvent(...)`; RESOLVED keeps the penalty. Terminal reports/stories cannot be re-reviewed (400).
6. **Device upsert reassigns ownership** when a token moves between accounts; unregister 404s identically for foreign/missing tokens (no probing).
7. Badge granting is idempotent; the false→true flip records a `VERIFICATION` trust event.
8. **Creating an admin:** no bootstrap endpoint by design — `UPDATE "User" SET role='ADMIN' WHERE id='…'` directly in the DB.

---

## 4. ⚠️ Do these first on the new machine

1. **Setup:** Node 22 (`nvm use`), `npm install`, `cp .env.example .env`, `docker compose up -d postgres redis`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run db:seed`.
2. **Verify the hand-authored migration applies cleanly:** `npx prisma migrate dev` (or `migrate deploy`) — migration `20260928120000_image_hash_and_match_expiry` was written without a live DB (Docker wasn't available in that session). SQL is simple (`ADD COLUMN … NULL`, two `CREATE INDEX`), and `npx prisma validate` passes, but it has never run against a real database.
3. **Run the e2e smoke test once:** `npm run test:e2e` — needs Docker Postgres (:5433) + Redis (:6379). It boots the real AppModule and asserts `/health` 200 + a guarded route 401. (Unit tests don't cover DB/Redis wiring.)
4. **`sharp` is a native dependency** — if the new machine is Linux, `npm install` will rebuild it; no extra system packages needed for the prebuilt binaries, but a failed `npm install` points here first.
5. **Smoke the running app:** `npm run start:dev` → `GET http://localhost:3000/health` should return `200 {status:"ok", checks:{database:"up", redis:"up"}}`.

---

## 5. Not verified on real infrastructure (know before deploying)

- The P2 migration and the e2e smoke test (see §4.2/4.3) — no live DB/Redis existed in the finishing session.
- `sharp` WebP output inside the Docker image (Dockerfile doesn't install any new OS packages; prebuilt binaries should cover it).
- BullMQ repeatable scheduling across restarts (the `match-expiry` sweep re-adds itself idempotently on boot by name, but it hasn't been observed on a long-running instance).
- FCM push end-to-end (needs real `FCM_SERVICE_ACCOUNT_JSON`), Twilio, SMTP, R2 upload path with real credentials.
- `R2_PUBLIC_URL` **must** be set in production or image URLs fall back to `http://localhost` (centralized in `image-metadata.util.ts`).

---

## 6. Where the work is (file map for the new stuff)

| Feature | Files |
|---|---|
| Health | `src/common/health/health.{controller,module}.ts` (registered in `app.module.ts`) |
| Image pipeline | `src/modules/images/image-pipeline.util.ts` (+ spec), `image-metadata.util.ts`, `processors/image.processor.ts`, rewritten `images.service.ts`, wired in `images.module.ts` (`attachQueue` pattern) |
| Match expiry | `src/modules/matches/match-expiry.processor.ts` (+ spec), `matches.module.ts` (schedules the repeat), `matches.service.ts` (`EXPIRY_MS`, `expiresAt` writes), `chat.service.ts` (first-message clears it) |
| Devices | `src/modules/devices/*` |
| Notifications inbox | `src/modules/notifications/user-notifications.*`, `dto/get-notifications-query.dto.ts` |
| Admin core | `src/modules/admin/*` (+ `dto/moderation.dto*.ts`) |
| Schema/migration | `prisma/models/image.prisma`, `prisma/models/match.prisma`, `prisma/migrations/20260928120000_image_hash_and_match_expiry/` |
| Docs | `README.md` (71 endpoints, pipeline/expiry/health sections), `docs/KNOWN-GAPS.md` (§1 pass record, §2 item 6 face deferral, §4 rule status, §5/§6/§7) |

**Conventions that matter when extending this work:** ESM (`"type": "module"`) — relative imports need `.js`; tests must `import { jest } from '@jest/globals'` and hoist `expect.any(...)` into a typed variable (`as unknown as T`) to satisfy the typed ESLint config; response envelope via `successResponse()`; DTO validation with `whitelist` + `stopAtFirstError`.

---

## 7. Suggested next work (P3 candidates, in rough priority)

1. **Trust-score updates via BullMQ** — the last open architecture-rule item (§4 of KNOWN-GAPS).
2. **Refresh-token rotation + reuse detection.**
3. **Abandoned game sessions TTL job** (stay `IN_PROGRESS` forever today).
4. **Remaining ~74 admin routes** (dashboard, user management, broadcasts) per the Postman ADMIN contract.
5. **PostGIS for discovery** once the candidate pool outgrows the bounding-box + Haversine approach.
6. **Socket.IO Redis adapter** before ever running more than one instance.
7. **Face verification** when product is ready (see decision #1).
