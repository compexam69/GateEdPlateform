# EdTech Study Platform

A mastery-gated PWA for Indian students (JEE, NEET, GATE) — students cannot skip ahead; every topic is locked until the previous step is completed and passed.

## Run & Operate

- `pnpm --filter @workspace/edtech run dev` — run the React PWA frontend (port 22495)
- `pnpm --filter @workspace/api-server run dev` — run the Express API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend:** React 18 + Vite, Tailwind CSS, Framer Motion, Zustand, Wouter, Recharts
- **Auth:** Supabase Auth (email/password + email verification)
- **DB:** Supabase PostgreSQL + RLS (NOT Replit DB)
- **File Storage:** Backblaze B2 (PDFs + profile photos)
- **Backend:** Express 5 API server (Supabase service role key)
- **Validation:** Zod, Orval codegen from OpenAPI spec

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth (all API contracts)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/edtech/src/` — React frontend (pages, components, hooks, store)
- `artifacts/edtech/src/hooks/useAuth.ts` — Zustand auth store (Supabase)
- `artifacts/edtech/src/lib/supabase.ts` — Supabase browser client
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/supabase.ts` — Supabase server client (service role)
- `artifacts/api-server/src/lib/b2.ts` — Backblaze B2 helpers
- `scripts/src/supabase-schema.sql` — **Full Supabase SQL schema** (run in Supabase SQL Editor)

## Architecture decisions

- **Serverless-first:** No custom JWT, no Node.js session store. Auth is pure Supabase Auth. Service role key is only used server-side in Express.
- **Gate enforcement is dual-layer:** Frontend shows locked/unlocked UI states (cosmetic), backend returns HTTP 403 if prerequisites not met (real security).
- **Backblaze B2 via presigned URLs:** Files never pass through the Express server. Client gets a presigned URL from the API, then uploads/downloads directly to B2.
- **First user = Super Admin:** A Supabase DB trigger (`handle_new_user`) auto-promotes the first registered user to `super_admin`. All subsequent registrations are `student` with `pending_approval`.
- **RLS on all tables:** Every table has Row Level Security policies. The API server uses the service role key to bypass RLS where needed (admin operations).

## Product

- **Landing:** 5-screen onboarding carousel (Smart Mastery Path, Real Exam Simulation, Video Solutions, Focus Mode, CTA)
- **Auth:** Register with full name, +91 mobile, email, strong password. Email verification required.
- **Dashboard:** Focus streak, today's time, progress tree, tasks, performance chart
- **Learning path:** Subject → Chapter → Topic with 5-step gates (Lecture → Quiz → DPP → PYQs → Topic Test)
- **Exam interface:** Full-screen, countdown timer, question grid, mark for review, auto-save to IndexedDB (idb), server-time sync every 60s, mobile swipe navigation
- **Exam results:** Score summary, pie chart, answer sheet with solutions and QR codes
- **Notes:** Gated PDF upload (unlocked after chapter test), per-user 500MB quota, B2 storage
- **Pomodoro:** 25/5/15/custom timer modes, streak tracking, context-aware logging, offline session queue (Background Sync)
- **Study Planner:** Auto-generated + manual tasks, drag-to-reorder, status lifecycle
- **Test Tracker:** External exam log + line chart (internal vs external scores)
- **Admin panel:** User approvals, content CRUD (subjects/chapters/topics), analytics, storage monitor

## User preferences

- Fully serverless: Supabase + Backblaze B2 only. No Express DB (no DATABASE_URL needed).
- Dark mode by default. Design system: Deep Slate #0F172A bg, Focus Indigo #6366F1 primary.
- No emojis in UI — lucide-react icons only.

## Infrastructure (F9 & F11 — manual setup required)

### F9: B2 Bucket Lifecycle (file versioning — retain last 3)
Configure in Backblaze B2 Dashboard → Buckets → your bucket → Lifecycle Rules:
- Keep only the last 3 versions of each file: set **"Keep prior versions for X days"** to `0` days and **"Number of versions to keep"** to `3`.
- Or via B2 CLI: `b2 update-bucket --lifecycle-rule '{"daysFromHidingToDeleting":1,"fileNamePrefix":"","daysFromUploadingToHiding":null}' <bucketName> allPrivate`

### F11: CDN in Front of B2 (Cloudflare)
To serve B2 files through Cloudflare's CDN for lower latency:
1. Create a **Cloudflare R2** bucket (compatible with B2 S3 API) or set up a **Cloudflare Worker** proxy to your B2 bucket.
2. Alternatively, point a Cloudflare-proxied CNAME at your B2 bucket's S3-compatible endpoint (`s3.us-west-004.backblazeb2.com`).
3. Set Cache-Control headers on presigned URL responses: `max-age=3600` for public files.
4. Update `B2_PUBLIC_BASE_URL` env var to your Cloudflare domain once configured.

## Gotchas

- **MUST run Supabase schema first:** Before the app works end-to-end, run `scripts/src/supabase-schema.sql` in your Supabase project's SQL Editor. This creates all tables, RLS policies, triggers, and seed data.
- **Environment variables:** VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set as shared env vars (VITE_ prefix for frontend access). SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, B2_* are secrets for the API server.
- **After OpenAPI spec changes:** Always run `pnpm --filter @workspace/api-spec run codegen` before using updated types.
- **Gate check latency target:** < 50ms (purely a Supabase RLS lookup, no complex joins).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Supabase project: https://kczzmthgcvirodrnzqnw.supabase.co
