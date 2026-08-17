# AGENTS.md — 48Date Backend

Instructions for AI agents (and humans) working in this repository.

## Project Overview

**48Date** is a dating app consisting of a **Flutter user app**, a **React admin panel**, and this **NestJS backend** (TypeScript). The backend is a solo build, self-hosted on a single **Hostinger VPS**.

The canonical requirements document is `docs/48Date-Backend-Tech-Stack.docx` — read it before making architecture-level decisions. This file summarizes it.

**Current repo state:** fresh NestJS 11 scaffold (default `AppController`/`AppService`). `docker-compose.yml` added for local Postgres + Redis. No domain modules, Prisma schema, or services are implemented yet. Follow this guide when adding them.

## Requirements

- **Node.js 22 LTS** — required. Do not use odd-numbered "Current" releases (e.g. 23, 25) — Prisma and several dependencies are tested against LTS only. The version is pinned in `.nvmrc` (source of truth); use `nvm` to manage it:
```bash
  nvm install   # reads .nvmrc
  nvm use       # reads .nvmrc
  nvm alias default 22
```
- **Docker** (Docker Desktop or Docker Engine) — runs local Postgres + Redis.
- **Nest CLI** (global): `npm install -g @nestjs/cli`

## Commands

```bash
npm install          # install dependencies
npm run start:dev    # dev server with watch mode (default port 3000)
npm run build        # compile (nest build)
npm run start:prod   # run compiled dist/main.js
npm run lint         # eslint with --fix
npm run format       # prettier on src/ and test/
npm run test         # jest unit tests
npm run test:e2e     # jest e2e tests (test/jest-e2e.json)
npm run test:cov     # coverage
```

Rules: always run `npm run lint` + `npm run build` (and relevant tests) before finishing changes. TypeScript config is strict-null-checked (`strictNullChecks: true`) — verify this in `tsconfig.json` if unsure.

## Local Development Setup

The app depends on Postgres and Redis, run locally via Docker Compose (`docker-compose.yml` in repo root):

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: date48
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

**Before running `npm run start:dev`, start the containers:**
```bash
docker compose up -d
docker ps   # confirm both postgres:16 and redis:7 show "Up"
```

Once Prisma is wired up, `DATABASE_URL` in `.env` should point at this local Postgres instance (`postgresql://postgres:postgres@localhost:5432/date48?schema=public`) for local dev — production uses the Hostinger VPS's own Postgres instance instead.

If `npm run start:dev` fails with a database or Redis connection error, the containers are very likely not running — check `docker ps` first before debugging application code.

## Tech Stack (decided — do not swap without discussion)

| Layer | Technology | Notes |
|---|---|---|
| Framework | NestJS (TypeScript) | Modular, feature-first structure |
| Database | PostgreSQL | Users, matches, chats, dates, subscriptions, reports, image metadata/hashes — **no blobs** |
| ORM | Prisma | Type-safe access + migrations |
| Cache / queue store | Redis | Caching, session store, chat presence, backs BullMQ |
| Background jobs | BullMQ | Image processing, AI calls, notifications, trust score updates |
| Real-time | Socket.io | Chat messaging, live presence |
| Image storage | Cloudflare R2 | Actual photo files; Postgres stores only hash + metadata |
| Face verification | Self-hosted (face-api.js / TensorFlow.js or Python microservice) | Server-side detection/comparison at registration |
| AI suggestions | OpenAI or Anthropic API | Chat suggestions, matching text generation |
| Maps / places | Mapbox | Date planner location + place suggestions |
| Push notifications | Firebase Cloud Messaging (FCM) | Match alerts, messages, admin broadcasts |
| Subscriptions / IAP | RevenueCat | Apple/Google IAP receipt validation + entitlement sync |
| Auth | JWT (`@nestjs/passport`) | Access + refresh tokens; role-based guards for admin |
| Phone verification | Twilio Verify | Global OTP at registration (SMS + voice fallback) |
| Transactional email | Hostinger Email Hosting (SMTP) | Verification emails, password resets, admin notifications |
| Hosting | Hostinger VPS (recommend VPS3+, ~$12.99/mo) | Runs app, Postgres, Redis, BullMQ workers, face verification |
| Domain + SSL | — | SSL via Let's Encrypt |

## Non-Negotiable Architecture Decisions

1. **Image handling:** images are optimized and deduplicated on upload via a **BullMQ job**, then the processed file is stored in **Cloudflare R2**. PostgreSQL stores only the **hash and metadata** (dimensions, R2 key, timestamp). Keep the DB free of blobs.
2. **Face verification runs server-side** on raw uploaded images — never on client-submitted embeddings. This is required for the app's **trust score system** and spoof resistance.
3. **RevenueCat** handles Apple/Google IAP receipt validation and entitlement sync — do not hand-roll store integrations.
4. **Single self-hosted VPS:** Postgres, Redis, the app, background jobs, and face verification compute all share one server. Backup, patching, and uptime are the team's responsibility.
5. **Twilio Verify** for phone verification (global carrier coverage). Unlike the rest of the stack, this cost **scales per verified user** (~$0.05+/check) — treat it as a per-user cost, not flat.
6. **Email goes through Hostinger SMTP** (consolidated billing). Sending limits are tier-dependent (~100–3,000 emails/day). Monitor volume; if daily sends approach the cap, upgrade the mailbox or move to a dedicated transactional service.

## Domain Model

Core entities: **User**, **Match**, **Chat/Message**, **Date** (date planner), **Subscription**, **Report**, **Image** (hash + metadata only), **Trust Score** (updated via background jobs).

Two client surfaces:
- **Flutter user app** — full user-facing API.
- **React admin panel** — admin-scoped API, protected by **role-based guards** on top of JWT.

## Suggested Module Layout

Organize as NestJS feature modules, e.g.:
src/
├── main.ts
├── app.module.ts
├── auth/ # JWT access/refresh, passport strategies, guards, roles
├── users/ # profiles, registration (incl. Twilio Verify OTP)
├── images/ # upload -> optimize/dedupe (BullMQ) -> R2, hash + metadata to Postgres
├── face-verification/ # server-side detection/comparison; feeds trust score
├── matches/
├── chat/ # Socket.io gateway, presence (Redis), message persistence
├── dates/ # date planner, Mapbox place suggestions
├── subscriptions/ # RevenueCat webhooks/entitlements
├── reports/ # moderation
├── notifications/ # FCM + BullMQ fan-out
├── trust-score/ # background score updates
├── admin/ # admin-panel endpoints, role-guarded
├── ai/ # OpenAI/Anthropic suggestions
└── common/ # prisma, redis, queue modules, shared DTOs/decorators


## Conventions

- **Unified response envelope** — every endpoint returns `{ success: boolean, message: string, messages: string[], data? }` on success and `{ success: false, message, messages, statusCode }` on error. Use `successResponse()` / `errorResponse()` from `src/common/response/api-response.util.ts`; errors are wrapped automatically by the global `AllExceptionsFilter` (`src/common/filters/`), so controllers only wrap success payloads. `message` must be a short, non-technical summary.
- **ESM project** — `package.json` has `"type": "module"` (Prisma 7's generated client requires ESM). All relative imports must use `.js` extensions (e.g. `import { AppModule } from './app.module.js'`). Jest is configured for ESM via `NODE_OPTIONS=--experimental-vm-modules` in the test scripts; keep the `moduleNameMapper`/`extensionsToTreatAsEsm` entries in both Jest configs if you touch them.
- **Feature-first modules** — each domain gets its own NestJS module with controller, service, and (where relevant) gateway/processor.
- **Use libraries already in the project** before pulling in new dependencies; the stack above is fixed unless explicitly changed.
- **Prisma for all DB access and migrations** — no raw SQL unless necessary.
- **DTO validation** for all request bodies.
- **Secrets via environment variables** — never commit real credentials or `.env`. (`.env` is gitignored by default in the NestJS scaffold — verify this in `.gitignore` before adding real secrets.)
- Match existing code style (Prettier + ESLint configs are already present).

## Environment Variables

`.env.example` (committed) is the canonical list of every variable name with placeholder values — copy it to `.env` and fill in real values. Never commit `.env` (it is gitignored).
PORT
DATABASE_URL # PostgreSQL
REDIS_URL
JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID
FCM_SERVICE_ACCOUNT_*
MAPBOX_ACCESS_TOKEN
OPENAI_API_KEY # or ANTHROPIC_API_KEY
REVENUECAT_API_KEY / REVENUECAT_WEBHOOK_SECRET
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS


## Cost Awareness

This project is budget-sensitive (MVP ~$15–65/mo flat + ~$0.05/verified user). When designing, prefer:
- Self-hosted, free, or open-source options already chosen above.
- Avoiding new paid services unless the doc (or explicit discussion) calls for them.
- Deferring paid-tier usage: RevenueCat and Mapbox stay free until real usage thresholds; R2 has a 10 GB free tier.

## Useful Sources

- `docs/48Date-Backend-Tech-Stack.docx` — canonical requirements, tech stack, pricing.
- `README.md` — standard NestJS scaffold README (outdated vs. this project; treat this file as authoritative for project specifics).