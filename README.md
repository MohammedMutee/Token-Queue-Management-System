# Token Queue Management System

A real-time token queue management system for organizations that process visitors through numbered tokens -- government offices, hospitals, service centers, etc.

## Features

- **Reception Desk** -- Issue numbered tokens, thermal receipt printing (via QZ Tray)
- **Cabin Operator** -- Call tokens, process visitors, approve/hold/skip
- **TV Display** -- Full-screen queue display with voice announcements
- **Admin Dashboard** -- Manage users, cabins, levels, sessions, and analytics
- **Real-time Updates** -- Socket.IO pushes changes to all connected clients instantly
- **Multi-level Processing** -- Configurable levels (e.g. Document Verification -> Final Approval)
- **Thermal Printing** -- Network (raw TCP), USB, or browser print via QZ Tray

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **PostgreSQL 16** + **Prisma 6**
- **Socket.IO 4** (WebSocket, same port as HTTP)
- **NextAuth v5** (Credentials + JWT)
- **Tailwind CSS v4**

## Quick Start (Docker)

```bash
git clone <repo-url> && cd Token-System
docker compose up --build
```

Open http://localhost:3000. Default login: `admin` / `admin123`.

## Manual Setup

```bash
# 1. Start PostgreSQL (via Docker or install natively)
docker compose up db -d

# 2. Install and run
cp .env.example .env
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

## Default Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |
| Reception | reception | reception123 |
| Cabin L1 | cabin_l1_1 | cabin1 |
| Cabin L2 | cabin_l2_1 | cabin11 |

See `prisma/seed.ts` for the full list of 22 seeded users.

## Project Structure

```
server.ts              Custom HTTP server (Next.js + Socket.IO)
prisma/schema.prisma   Database schema
prisma/seed.ts         Seed data (users, levels, cabins)
src/app/reception/     Token issuance interface
src/app/cabin/         Cabin operator interface
src/app/display/       TV display (public, no auth)
src/app/admin/         Admin dashboard
src/app/api/           API routes
src/lib/               Shared utilities (auth, db, queue, socket, printing)
src/middleware.ts      Route protection (role-based)
```

## License

Private
