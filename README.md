# 48Date Backend

Backend API for the **48Date** dating app — NestJS (TypeScript), PostgreSQL + Prisma, Redis, JWT auth. Flutter user app and React admin panel consume this API.

> **Status:** auth module is implemented and tested (register → OTP verify → login → refresh → logout → password reset). Next up: users/profile, images, matches, chat…

## Stack

| Layer | Tech |
|---|---|
| Framework | NestJS 11 (TypeScript, ESM) |
| Database | PostgreSQL 16 (local via Docker Compose) |
| ORM | Prisma 7 (multi-file schema, migrations) |
| Cache/queue store | Redis 7 (running locally; used by future modules) |
| Auth | JWT (`@nestjs/passport`) — access + refresh tokens, role-based guards |
| OTP (dev) | Dummy code `123456` — Twilio/SMTP integration comes later |

## Quick start

**Prerequisites:** Node.js 22 LTS (`nvm use 22`), Docker.

```bash
# 1. Start Postgres + Redis
docker compose up -d
docker ps                     # both containers should be "Up"

# 2. Install dependencies
npm install

# 3. Create .env from the template and fill in the two JWT secrets
cp .env.example .env          # then edit .env (see "Environment" below)

# 4. Create the database tables + generate the Prisma client
npx prisma migrate dev --name init
npx prisma generate           # required in Prisma 7 (migrate doesn't auto-generate)

# 5. Run the dev server (watch mode, port 3000)
npm run start:dev
```

## Auth endpoints

All responses use the envelope `{ success, message, messages, data }` (errors: `{ success: false, message, messages, statusCode }`). User profiles are returned categorized (`auth`, `basicProfile`, `lifestyle`, `location`, `body`, `interests`, `media`, `meta`) and never include `passwordHash`.

| Serial | Method | Path | Auth | Description |
|---|---|---|---|---|
| A-01 | POST | `/auth/register` | — | Create account (all profile fields required), returns profile + tokens |
| A-02 | POST | `/auth/login` | — | Phone + password → profile + tokens |
| A-03 | POST | `/auth/request-otp` | — | Request dummy OTP (phone/email + channel) |
| A-04 | POST | `/auth/verify-otp` | — | Verify OTP → sets `isPhoneVerified`/`isEmailVerified` + `isUserVerified` |
| A-05 | POST | `/auth/forgot-password` | — | Request dummy reset OTP |
| A-06 | POST | `/auth/verify-forgot-password` | — | Verify reset OTP → `resetToken` (15 min) |
| A-07 | POST | `/auth/reset-password` | — | Set new password with `resetToken` |
| A-08 | POST | `/auth/refresh` | — | Refresh token → new token pair |
| A-09 | POST | `/auth/logout` | Bearer | Log out (client discards tokens) |
| A-10 | GET | `/auth/me` | Bearer | Categorized profile + images |

Try them instantly in Postman: import `postman/48date-backend.postman_collection.json` — it auto-captures tokens and includes success/error examples for every endpoint.

## Common commands

```bash
npm run start:dev      # dev server (watch)
npm run build          # type-check + compile to dist/
npm run start:prod     # run compiled dist/main.js
npm run lint           # eslint (auto-fix)
npm run test           # unit tests
npm run test:e2e       # e2e tests
npx prisma validate    # check schema syntax
npx prisma migrate dev --name <desc>   # create + apply a migration (local)
npx prisma migrate deploy              # apply committed migrations (prod/CI)
npx prisma generate    # regenerate client after schema changes (Prisma 7)
```

> ⚠️ `npx prisma migrate reset --force` wipes all local data — dev only, never production.

## Project structure

```
prisma/            # schema (models/, enums/), migrations/, prisma.config.ts
src/
├── main.ts        # bootstrap: global validation pipe + error filter
├── app.module.ts  # root module (Config + Prisma)
├── common/        # prisma service, response envelope, guards, filters, user-formatter
└── auth/          # auth module: controller, service, DTOs, JWT strategy
docs/              # project-guide.md (deep dive), 48Date-Backend-Tech-Stack.docx
```

## Environment

`cp .env.example .env` — the only variables needed **now** are `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (fill the two secrets with long random strings). The rest (Twilio, R2, SMTP, Mapbox, RevenueCat…) are placeholders for future modules.

## Docs

- `docs/project-guide.md` — **read this first if you're new to NestJS/Postgres/Prisma**: stack translation (Mongo/Express → here), file-by-file explanation, every auth endpoint end to end, Prisma/migration workflow, commands, .env.
- `AGENTS.md` — project rules and conventions (authoritative).
- `docs/48Date-Backend-Tech-Stack.docx` — canonical requirements & tech-stack decisions.

## Notes for contributors

- The project runs **ESM** (`"type": "module"`) because Prisma 7's client is ESM-only — keep `.js` extensions on relative imports.
- Import Prisma from `src/generated/prisma/` (gitignored, regenerated), not `@prisma/client`.
- Run `npm run lint` + `npm run build` (and relevant tests) before finishing changes.
