# EdTech Study Platform

A full-stack mastery-based learning platform for competitive exam prep (JEE, NEET, GATE). Features course management, quizzes/exams, student progress tracking, a Pomodoro timer, task tracker, and a "75 Hard" study challenge module.

## Architecture

**Monorepo** managed with PNPM Workspaces.

| Path | Role |
|---|---|
| `artifacts/edtech/` | React + Vite frontend (port 5000) |
| `artifacts/api-server/` | Express backend API (port 8080) |
| `lib/api-client-react/` | Generated Orval API client (shared) |
| `lib/api-zod/` | Zod schemas generated from OpenAPI spec |
| `lib/api-spec/` | OpenAPI spec source |
| `scripts/` | DB migration & VAPID key generation tools |

## Running the Project

Two workflows must both be running:

- **Backend API** — `cd artifacts/api-server && pnpm dev` (port 8080)
- **Start application** — `cd artifacts/edtech && pnpm dev` (port 5000, webview)

The Vite dev server proxies `/api/*` to `http://localhost:8080`, so no `VITE_API_URL` is needed in development.

## Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, Radix UI, TanStack Query, Zustand, Wouter
- **Backend:** Node.js, Express 5, TypeScript, Zod, Pino
- **Auth/DB:** Supabase (PostgreSQL + Auth + Storage)
- **File storage:** Backblaze B2
- **Push notifications:** Web Push (VAPID)
- **Monitoring:** Sentry (frontend + backend), OpenTelemetry

## First-Run Prerequisites

The workflows alone are not enough to make the app fully operational on a fresh Supabase project. Before using the app:

1. **Apply database migrations** — run the scripts in `scripts/` against your Supabase instance to create all required tables (`profiles`, `subjects`, `chapters`, `quiz_questions`, `push_subscriptions`, etc.).
2. **Verify Supabase Auth** — ensure email auth is enabled in your Supabase project settings.

## Environment Variables & Secrets

All configured as Replit Secrets / env vars:

| Key | Where used | Required |
|---|---|---|
| `SUPABASE_URL` | Backend | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | ✅ |
| `VITE_SUPABASE_URL` | Frontend | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Frontend | ✅ |
| `CSRF_SECRET` | Backend CSRF middleware | ✅ |
| `SESSION_SECRET` | Backend (auth signing) | ✅ |
| `VAPID_PUBLIC_KEY` | Backend + Frontend push | Optional |
| `VAPID_PRIVATE_KEY` | Backend push | Optional |
| `VAPID_SUBJECT` | Backend push | Optional |
| `B2_ACCOUNT_ID` | Backend file uploads | Optional |
| `B2_APPLICATION_KEY_ID` | Backend file uploads | Optional |
| `B2_APPLICATION_KEY` | Backend file uploads | Optional |
| `B2_BUCKET_NAME` | Backend file uploads | Optional |
| `SENTRY_DSN` | Backend error tracking | Optional |
| `VITE_SENTRY_DSN` | Frontend error tracking | Optional |

## Key Patterns

- Role/approval status is always read from the `profiles` table, never from Supabase `user_metadata`.
- CSRF uses the double-submit cookie pattern via `csrf-csrf` v3; token endpoint requires the auth header.
- B2 file operations use `accountId` from `b2_authorize_account` response, not the raw env var.
- Shared lib `api-client-react` must have `dist/` generated (`npx tsc -p tsconfig.json` in `lib/api-client-react/`) before frontend typechecks pass.

## User Preferences

_None recorded yet._
