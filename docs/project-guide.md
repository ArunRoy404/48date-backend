# 48Date Backend — Project Guide

> Written for developers coming from **MongoDB / Mongoose / Express**. It explains the stack, then walks through **every auth endpoint** end to end (what's needed before it, what happens when it's hit, which files do what), plus the **database / Prisma** workflow, **commands**, and **.env**.
>
> Companion files: [`AGENTS.md`](../AGENTS.md) (rules & conventions, read this too) · [`README.md`](../README.md) (quick start) · `postman/48date-backend.postman_collection.json` (API tester, request serials A-01…A-10).

---

## 0. Stack translation (what you already know vs this project)

| You know (Mongo/Express) | This project |
|---|---|
| MongoDB database | **PostgreSQL** (relational, tables) |
| Mongoose (schema + queries) | **Prisma** — schema lives in `.prisma` files; a **generated typed client** replaces `Model.find()` |
| Express routes (`app.get('/x')`) | **NestJS controllers** — a class with `@Controller('auth')` + `@Get()/@Post()` decorators |
| Middleware (`app.use(...)`) | **Guards** (auth checks), **Pipes** (validation), **Filters** (error handling) |
| `req.body`, `res.json(...)` | **DTO classes** (validated body) + **envelope helpers** (uniform `{ success, message, messages, data }`) |
| `app.listen(port)` | `main.ts` → `NestFactory.create(AppModule)` |
| `bcrypt`, `jsonwebtoken` | same idea — `bcrypt`, `@nestjs/jwt` + Passport strategy |
| Socket.io | same (Socket.io — used later for chat) |

**One request, top to bottom:** HTTP request → `main.ts` global **ValidationPipe** (validates DTO) → Controller route → Guard (if JWT-protected) → **Service** (business logic) → **PrismaService** → PostgreSQL → response wrapped in the envelope. Any error is caught by the global **AllExceptionsFilter** and returned as `{ success: false, ... }`.

---

## 1. Project structure (what each folder is for)

```
prisma/                     # DATABASE LAYER (Prisma 7, multi-file schema)
├── schema.prisma           # main file: generator + datasource ONLY
├── models/user.prisma      # User model (the users table)
├── models/image.prisma     # Image model (user photos — URL only, no blobs)
├── enums/role.prisma       # Role enum (USER, ADMIN)
├── enums/profile.prisma    # Gender, HabitFrequency, KidsStatus, LookingFor
└── migrations/             # SQL change history — every schema change = one folder

prisma.config.ts            # Prisma CLI config: schema dir + DATABASE_URL

src/
├── main.ts                 # app bootstrap: pipes, filter, listen
├── app.module.ts           # root module: imports ConfigModule + PrismaModule
├── app.controller.ts/.service.ts   # scaffold "Hello World" (GET /) — not part of auth
├── common/                 # SHARED pieces used by every module
│   ├── prisma/             # PrismaModule (global) + PrismaService (DB connection)
│   ├── response/           # envelope types + successResponse/errorResponse helpers
│   ├── filters/            # AllExceptionsFilter — wraps EVERY error in the envelope
│   ├── guards/             # JwtAuthGuard (Bearer token) + RolesGuard (admin)
│   ├── decorators/         # @Roles(...) decorator for admin endpoints
│   ├── types/express.d.ts  # tells TypeScript that req.user exists
│   └── utils/user-formatter.ts  # formats a User row into categorized sections
└── auth/                   # AUTH MODULE (the only domain module so far)
    ├── auth.module.ts      # wires controller + service + JWT + strategy
    ├── auth.controller.ts  # routes: /auth/register, /auth/login, ... (A-01…A-10)
    ├── auth.service.ts     # all business logic (register, OTP, tokens, ...)
    ├── strategies/jwt.strategy.ts  # how Bearer tokens are verified
    └── dto/                # validated request bodies (one class per request)
```

`src/generated/prisma/` is the **Prisma client** generated from your schema (gitignored, do not edit).

---

## 2. The plumbing files (read once, understand the whole app)

### `src/main.ts` — the entry point
What it does:
1. Creates the Nest app from `AppModule`.
2. Enables CORS.
3. Adds a **global `ValidationPipe`** with `whitelist: true` (strips unknown body fields) and `transform: true` (converts plain JSON → DTO class instances). This is why **every endpoint validates automatically** — you only write the DTO.
4. Adds the **global `AllExceptionsFilter`**.
5. Listens on `PORT` (default 3000).

### `src/app.module.ts` — the root module
Imports `ConfigModule.forRoot({ isGlobal: true })` (loads `.env`, gives `ConfigService` everywhere) and `PrismaModule` (global). Future modules (users, chat, matches…) get listed here.

### `src/common/prisma/prisma.module.ts` + `prisma.service.ts` — the DB bridge
- `@Global()` module → any service can inject `PrismaService` without importing it.
- `PrismaService extends PrismaClient` (from `src/generated/prisma/client.js`) and connects using the **`PrismaPg` adapter** (Prisma 7 no longer bundles a DB driver; it uses `@prisma/adapter-pg`) with `DATABASE_URL`.
- Connects on app start (`onModuleInit`) and disconnects on shutdown.
- **This replaces Mongoose's `mongoose.connect()` + models.** Usage in code: `this.prisma.user.create({...})`, `this.prisma.user.findUnique({...})` — like Mongoose but fully typed.

### `src/common/response/` — the response envelope
- `api-response.interface.ts` — TypeScript shapes: `ApiSuccessResponse<T>` (`{ success, message, messages, data }`) and `ApiErrorResponse` (`{ success, message, messages, statusCode }`).
- `api-response.util.ts` — `successResponse(data, message, messages?)` and `errorResponse(message, messages?, statusCode?)`.
- Controllers return `successResponse(data, 'Account created successfully')`; the filter builds error envelopes. **You never hand-roll a response shape.**

### `src/common/filters/all-exceptions.filter.ts` — every error becomes an envelope
Catches everything: validation errors become `400 { success:false, message:"Validation failed", messages:[...each field...] }`; `HttpException`s keep their status + message; unknown errors → `500` with details logged server-side (not leaked to the client).

### `src/common/guards/` + `decorators/` — protection
- `jwt-auth.guard.ts` — `@UseGuards(JwtAuthGuard)` on a route = the request must carry `Authorization: Bearer <accessToken>`. The strategy (below) runs, and `req.user` becomes `{ userId, role }`.
- `roles.guard.ts` + `roles.decorator.ts` — `@Roles('ADMIN')` on a route = only admins. Reads metadata set by the decorator via `Reflector`.

### `src/common/types/express.d.ts`
TypeScript augmentation so `req.user` is known to exist (Express doesn't know about it by default).

### `src/common/utils/user-formatter.ts`
`formatUser(user)` → returns the profile **grouped into sections**: `auth`, `basicProfile`, `lifestyle`, `location`, `body`, `interests`, `media`, `meta`. It **picks fields explicitly, so `passwordHash` can never leak**. Every endpoint that returns a user calls this.

### `src/auth/auth.module.ts`
Declares the module: imports `PassportModule` + `JwtModule` (configured with `JWT_ACCESS_SECRET`), registers the controller and providers (`AuthService`, `JwtStrategy`).

### `src/auth/strategies/jwt.strategy.ts`
Tells Passport how to verify a token: read `Authorization: Bearer`, verify with `JWT_ACCESS_SECRET`, don't ignore expiry. `validate()` converts the JWT payload `{ sub, role }` into `req.user = { userId, role }`.

### `src/auth/dto/` — request bodies (validated automatically)
| File | Used by | Notes |
|---|---|---|
| `register.dto.ts` | A-01 Register | **Every field required** (full profile + `images[]` 1–6, exactly one `isMain` checked in service). Contains the fixed interest lists (Creativity/Sports/Movies). |
| `otp-channel.dto.ts` | shared base | `channel` (`email`/`phone`) + **conditional** `email` or `phone` (`@ValidateIf`) — the field must match the channel. |
| `request-otp.dto.ts` | A-03 | extends the OTP base |
| `verify-otp.dto.ts` | A-04 | OTP base + `otp` (exactly 6 digits) |
| `forgot-password.dto.ts` | A-05 | OTP base |
| `verify-forgot-password.dto.ts` | A-06 | OTP base + `otp` |
| `reset-password.dto.ts` | A-07 | `resetToken` + `newPassword` (min 8 chars) |
| `login.dto.ts` | A-02 | `phone` + `password` |
| `refresh.dto.ts` | A-08 | `refreshToken` |

### `src/auth/auth.controller.ts`
One method per route — thin: takes the validated DTO, calls the service, wraps the result in `successResponse`. Guards (`@UseGuards(JwtAuthGuard)`) mark protected routes.

### `src/auth/auth.service.ts`
All logic lives here: register, login, OTP (dummy), password reset, tokens. It injects `PrismaService` (DB), `JwtService` (tokens), `ConfigService` (secrets).

---

## 3. Endpoints, one by one

### A-01 · POST `/auth/register` — create account
**Needed before this endpoint works:** `RegisterDto` (validation), `User` + `Image` models in the DB (migrated), `bcrypt`, `JwtModule`, `formatUser`, `successResponse`. All exist.
**What happens when hit:**
1. `ValidationPipe` validates the body against `RegisterDto` — every field required, formats/lists checked → `400 Validation failed` listing each problem.
2. Service checks **exactly one** `images[].isMain === true` and `birthDate` is in the past → else `400`.
3. `bcrypt.hash(password, 10)` — the only place a plain password exists.
4. `prisma.user.create({ data: {...full profile...}, images: { create: [...] } })` → `INSERT` into `users` + `images` (nested write).
5. Unique violation (`P2002`) → `409` with the **specific** field: "Phone number is already registered" / "Email is already registered" / "Username is already taken" (service inspects Prisma's error metadata).
6. `issueTokens()` signs `accessToken` (15 min) + `refreshToken` (7 days) with `{ sub: userId, role }`.
7. `formatUser(user)` → categorized profile; returns `{ success, message, messages:[], data: { user, accessToken, refreshToken } }`.

### A-02 · POST `/auth/login`
**Needed before:** `LoginDto`, a registered user, `bcrypt`, JWT.
**On hit:** find user by `phone` → not found or bad password → `401 "Invalid credentials"` (same message for both, no account enumeration) → update `lastLoginAt` → issue tokens → return categorized user + tokens.

### A-03 · POST `/auth/request-otp` — request verification code
**Needed before:** `RequestOtpDto` (OTP base). **No Bearer token** — public.
**On hit:** validates `channel` + matching `phone`/`email` → returns `data: { channel, otp: "123456", message }`. **Dummy implementation** — nothing is sent, the code is fixed for development. It deliberately does NOT check the account exists (no enumeration); A-04 does.

### A-04 · POST `/auth/verify-otp` — verify the code
**On hit:** find user by the identifier that matches `channel` → unknown → `404 "No account found with this phone/email"`; wrong OTP → `401 "Invalid OTP"`; correct `123456` → set `isPhoneVerified` or `isEmailVerified` + **`isUserVerified` (true when ANY channel is verified)** → return updated categorized user + `verified: true`.

### A-05 · POST `/auth/forgot-password` — request reset code
Same shape as A-03 but for password reset (public, dummy OTP `123456`, no account check).

### A-06 · POST `/auth/verify-forgot-password` — get the reset token
Find user → check OTP → issue a **short-lived JWT** (`expiresIn: 15m`, `purpose: 'password-reset'`, signed with `JWT_ACCESS_SECRET`). Returns `data: { resetToken, expiresIn: "15m" }`.

### A-07 · POST `/auth/reset-password` — set new password
Verify the `resetToken` (valid + `purpose === 'password-reset'`) → else `401` → hash the new password → update. Login again with the new password.

### A-08 · POST `/auth/refresh`
Verify `refreshToken` with `JWT_REFRESH_SECRET` → user must still exist → issue a fresh token pair.

### A-09 · POST `/auth/logout`
**Needs:** Bearer token (guard confirms it's valid). Stateless — nothing to revoke yet; client discards its tokens. (A Redis blacklist can make this server-enforced later.)

### A-10 · GET `/auth/me`
**Needs:** Bearer token. `req.user.userId` (set by the guard) → `prisma.user.findUnique` with `images` ordered by `sortOrder` → `formatUser` → categorized profile.

---

## 4. Database & Prisma

### Where the schema lives (multi-file)
- `prisma/schema.prisma` — only `generator` + `datasource` (no `url` here anymore; it moved to `prisma.config.ts`).
- Models in `prisma/models/*.prisma`, enums in `prisma/enums/*.prisma`. Relations can cross files — no imports needed.

### Current tables
- **`users`** — everything from registration: auth (`phone`, `email`, `passwordHash`, `role`, `isEmailVerified`, `isPhoneVerified`, `isUserVerified`), `basicProfile` (name, username, birthDate, gender…), `lifestyle`, `location` (arrays), `body` (heightCm/weightKg), `interests` (3 text arrays), `media` (selfieUrl, notificationsEnabled), `meta` (subscriptionId, lastLoginAt, timestamps).
- **`images`** — user photos: **only a URL + metadata** (`url`, `isMain`, `sortOrder`, dimensions) — no image blobs in the DB. Linked to `users` with `onDelete: Cascade`.
- **Enums** — `Role`, `Gender`, `HabitFrequency`, `KidsStatus`, `LookingFor`.

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
| `docker compose up -d` | Start local Postgres + Redis. **Do this before running the server** (first setup or after reboot). |
| `docker ps` | Confirm both containers are `Up` — the usual fix for "DB connection refused". |
| `npm install` | Install dependencies (after clone / after package.json changes). |
| `npm run start:dev` | Run the dev server with auto-reload (default port 3000). |
| `npm run build` | Type-check + compile to `dist/`. Run before finishing changes. |
| `npm run start:prod` | Run the compiled `dist/main.js` (what a server/PM2 would run). |
| `npm run lint` / `npm run format` | ESLint (auto-fix) / Prettier. |
| `npm test` / `npm run test:e2e` | Unit tests / end-to-end tests. |
| `npx prisma validate` | Dry-check the schema for errors (no DB touch). |
| `npx prisma migrate dev --name <desc>` | **Local dev:** create + apply a migration for your schema change. |
| `npx prisma migrate deploy` | **Prod/CI:** apply migrations that are already committed (never generates). |
| `npx prisma migrate reset --force` | **Local only, wipes data:** drop everything and re-apply all migrations. Used when your DB drifts from migration history (e.g. after deleting a migration file). Never on production. |
| `npx prisma generate` | Regenerate the typed client after any schema change (Prisma 7 does this manually). |

**Common fix:** "drift detected" → you deleted a migration file but the DB still has it applied → run `npx prisma migrate reset --force`, then `npx prisma migrate dev --name init` (or your new migration).

---

## 6. `.env` explained

`cp .env.example .env`, then fill secrets. Never commit `.env`.

| Variable | Used now? | Purpose |
|---|---|---|
| `PORT` | ✅ | HTTP port (default 3000). |
| `DATABASE_URL` | ✅ | Postgres connection string (`postgresql://postgres:postgres@localhost:5432/date48?schema=public` for local Docker). Read by `prisma.config.ts` + `PrismaService`. |
| `REDIS_URL` | ⏳ defined, not used yet | For chat presence, caching, BullMQ (future modules). Redis container is already running. |
| `JWT_ACCESS_SECRET` | ✅ | Signs/verifies access tokens + password-reset tokens (15 min). |
| `JWT_REFRESH_SECRET` | ✅ | Signs/verifies refresh tokens (7 days). |
| `R2_*` · `TWILIO_*` · `FCM_*` · `MAPBOX_*` · `OPENAI_*`/`ANTHROPIC_*` · `REVENUECAT_*` · `SMTP_*` | ⏳ future | Image storage, real OTP (Twilio/SMTP), notifications, maps, AI, subscriptions. **OTP is dummy for now** — no real SMS/email integration yet. |

Generate strong secrets locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (run twice, one per JWT secret).

---

## 7. Response envelope & errors (quick reference)

Success (2xx): `{ "success": true, "message": "...", "messages": [], "data": { ... } }`
Error: `{ "success": false, "message": "...", "messages": ["..."], "statusCode": 4xx }`

| Status | Typical message |
|---|---|
| 400 | `Validation failed` (each field in `messages`) — or `Exactly one image must be marked as main` |
| 401 | `Invalid credentials` · `Unauthorized` · `Invalid OTP` · `Invalid or expired refresh/reset token` |
| 404 | `No account found with this phone/email` · `User not found` |
| 409 | `Phone number is already registered` / `Email is already registered` / `Username is already taken` |
| 500 | generic — details logged server-side |

**User profiles are always categorized** (`auth`, `basicProfile`, `lifestyle`, `location`, `body`, `interests`, `media`, `meta`) and **never include `passwordHash`**.
