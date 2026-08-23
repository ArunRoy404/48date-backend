# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apk add --no-cache openssl

# Copy package files first (better caching)
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Copy the rest of the source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build NestJS
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy only necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# If you are using custom output (generated folder)
COPY --from=builder /app/src/generated ./src/generated
# or if generated is at root level:
# COPY --from=builder /app/generated ./generated

# Change ownership
RUN chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

# Run migrations + start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]