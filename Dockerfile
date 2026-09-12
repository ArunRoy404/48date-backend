# ---- Build Stage ----
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files first (better caching)
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Copy the rest of the source code
COPY . .

# Generate Prisma Client
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/date48?schema=public"
RUN npx prisma generate

# Build NestJS
RUN npm run build

# ---- Production Stage ----
FROM node:22-bookworm-slim AS production

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh nestjs

# Copy only necessary files from builder with ownership
COPY --chown=nestjs:nodejs --from=builder /app/package*.json ./
COPY --chown=nestjs:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /app/prisma ./prisma
COPY --chown=nestjs:nodejs --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=nestjs:nodejs --from=builder /app/src/generated ./src/generated

USER nestjs

EXPOSE 3000

# Run migrations + start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]