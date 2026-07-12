# ── Stage 1: Install dependencies ──────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

# ── Stage 2: Build the Next.js app ────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# PostgreSQL client for entrypoint pg_isready / psql checks
RUN apk add --no-cache postgresql-client

# Copy package files and install production deps
COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

# tsx (runs server.ts + seed.ts at runtime) and dotenv (used by seed.ts)
# are devDependencies but required in the production image
RUN npm install --no-save tsx dotenv

# Generate Prisma client against production node_modules
RUN npx prisma generate

# Copy the built Next.js app and static assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy files needed at runtime
COPY server.ts next.config.ts tsconfig.json ./

# Copy source (Next.js App Router needs these at runtime)
COPY --from=builder /app/src ./src

# Copy and prepare entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
