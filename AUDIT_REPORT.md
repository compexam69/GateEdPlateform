# EdTech Study Platform — Full Production Code Audit

**Audit Date:** May 24, 2026  
**Scope:** Full codebase — Express API (17 routes), React PWA frontend, Supabase schema, B2 storage layer, pnpm workspace libs  
**Status:** All identified issues fixed. Typecheck passes clean.

---

## Production-Readiness Score

| Dimension | Before Audit | After Fixes |
|---|---|---|
| Security | 6 / 10 | 9 / 10 |
| Code Quality | 6 / 10 | 9 / 10 |
| Architecture | 8 / 10 | 8 / 10 |
| Observability | 7 / 10 | 7 / 10 |
| Data Integrity | 5 / 10 | 8 / 10 |
| **Overall** | **6.4 / 10** | **8.2 / 10** |

---

## Findings Summary

| ID | Severity | Category | File(s) | Status |
|---|---|---|---|---|
| A1 | Critical | Data Integrity Bug | `storage.ts`, `ProfilePage.tsx` | Fixed |
| A2 | Critical | Security — Field Injection | `subjects.ts`, `chapters.ts`, `topics.ts` | Fixed |
| A3 | Major | React Violation | `App.tsx` | Fixed |
| A4 | Major | Dead Code | `useAuth.ts` | Fixed |
| A5 | Major | Dead Code | `progress.ts` | Fixed |
| A6 | Major | Logic Bug | `admin.ts` | Fixed |
| A7 | Major | Dead Code / Clutter | `scripts/src/hello.ts` | Fixed |
| A8 | Minor | Code Clarity | `exams.ts` | Fixed |
| A9 | Advisory | Dead Dependencies | `lib/db`, 15+ OTel packages | Documented |
| A10 | Advisory | Architecture | 3 rate-limiting implementations | Documented |

---

## Detailed Findings

---

### A1 — CRITICAL: `photo_url` vs `avatar_url` Field Name Mismatch

**Severity:** Critical — silently broken feature  
**Files:** `artifacts/api-server/src/routes/storage.ts`, `artifacts/edtech/src/pages/ProfilePage.tsx`

**Problem:**  
The Supabase `profiles` table schema (`scripts/src/supabase-schema.sql` line 47) defines the column as `avatar_url`. However, every read/write in `storage.ts` and `ProfilePage.tsx` referenced `photo_url` — a column that does not exist.

Consequences:
- The old profile photo was never deleted from B2 before a new one was uploaded (the SELECT returned `null`, so deletion was skipped every time). Old photos accumulated indefinitely in B2 storage.
- The profile photo DELETE endpoint called `UPDATE profiles SET photo_url = null` — a no-op on a non-existent column, silently succeeding via Supabase's service role.
- The frontend read `user_metadata.photo_url` for the avatar preview, so previously uploaded avatars never displayed after a page reload.

**Fix applied:**  
- `storage.ts` lines 153–181: all `photo_url` → `avatar_url`  
- `ProfilePage.tsx` lines 83, 188, 189, 205: all `photo_url` → `avatar_url`

---

### A2 — CRITICAL: Raw `req.body` Passthrough to Supabase PATCH Endpoints

**Severity:** Critical — field injection / privilege escalation  
**Files:** `subjects.ts:40-47`, `chapters.ts:29-37`, `topics.ts:29-37`

**Problem:**  
All three PATCH routes passed the entire `req.body` object directly to `.update(req.body)`. A malicious admin (or a compromised admin session) could inject arbitrary fields: `created_at`, `id`, or any other column that Supabase's schema permits, bypassing intended update scope. Although guarded by `requireAdmin`, the principle of least privilege still applies — an admin updating a chapter title should not be able to overwrite its database ID or internal flags.

```typescript
// BEFORE (vulnerable):
router.patch("/subjects/:subjectId", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("subjects")
    .update(req.body)   // ← any field from the client goes straight to DB
    ...
```

**Fix applied:**  
Each PATCH handler now explicitly destructures and whitelists only the intended mutable fields:

- `subjects.ts`: whitelisted `title`, `description`, `order_index`, `icon_url`, `is_active`  
- `chapters.ts`: whitelisted `title`, `description`, `order_index`, `is_active`  
- `topics.ts`: whitelisted `title`, `description`, `order_index`, `is_active`, `telegram_chat_id`, `telegram_message_id`  

Returns `400 { error: "No valid fields to update" }` when the caller sends an empty or entirely unknown payload.

---

### A3 — MAJOR: Side Effect During React Render Phase

**Severity:** Major — React violation, causes double-render loops  
**File:** `artifacts/edtech/src/App.tsx:42`

**Problem:**  
`RootRoute` called `setLocation("/dashboard")` synchronously inside the render function body (not inside a `useEffect`). React treats render as a pure function. Calling a state-mutating side effect during render violates this contract and triggers a render loop: render → side effect → re-render → side effect → …

```tsx
// BEFORE (React violation):
function RootRoute() {
  const { session, loading } = useAuth();
  const [, setLocation] = useLocation();
  if (!loading && session) {
    setLocation("/dashboard");   // ← side effect during render
    return null;
  }
  return <OnboardingPage />;
}
```

**Fix applied:**  
Wrapped in `useEffect` with correct dependencies, so the redirect fires exactly once after render commits:

```tsx
function RootRoute() {
  const { session, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && session) {
      setLocation("/dashboard");
    }
  }, [loading, session, setLocation]);

  if (loading || session) return null;
  return <OnboardingPage />;
}
```

---

### A4 — MAJOR: Dead Code — `signUp` in `useAuth`

**Severity:** Major — misleading dead code  
**File:** `artifacts/edtech/src/hooks/useAuth.ts`

**Problem:**  
`useAuth` exported a `signUp` method that called `supabase.auth.signUp` directly. This is incorrect because the platform registration flow goes through the Express API's `/auth/register` endpoint, which enforces DB-backed rate limiting, phone number formatting, and the `pending_approval` workflow. `RegisterPage.tsx` correctly calls the API endpoint and never uses `signUp`. The dead method on the store was misleading — any future developer reading the interface would assume it was the correct way to register.

**Fix applied:**  
Removed `signUp` from both the `AuthState` interface and the store implementation. Registration goes exclusively through `POST /api/auth/register`.

---

### A5 — MAJOR: Dead Code — Unused `GATE_ORDER` Constant

**Severity:** Major — dead code  
**File:** `artifacts/api-server/src/routes/progress.ts:7`

**Problem:**  
```typescript
const GATE_ORDER = ["lecture", "lecture_quiz", "dpp", "pyqs", "topic_test"] as const;
```
Defined at module scope but never referenced anywhere in the file or exported. The gate ordering logic in the route handler is a Supabase RLS query that derives order from the DB, not from this constant.

**Fix applied:** Removed.

---

### A6 — MAJOR: No-Op Ternary in Gate Config Response

**Severity:** Major — logic bug (identical branches)  
**File:** `artifacts/api-server/src/routes/admin.ts:~306`

**Problem:**  
```typescript
// BEFORE:
config[row.key] = typeof row.value === "object" ? row.value : row.value;
//                                                 ^^^^^^^^^^   ^^^^^^^^^^
//                                           both branches are identical
```
Both branches of the ternary assigned `row.value`. The `typeof` check had no effect. This is a classic copy-paste bug — most likely the intent was `JSON.stringify(row.value)` in one branch.

**Fix applied:**  
```typescript
config[row.key] = row.value;
```
The Supabase `jsonb` column already deserializes values correctly, so no additional transformation is needed.

---

### A7 — MAJOR: Placeholder Script File

**Severity:** Major — unnecessary clutter  
**File:** `scripts/src/hello.ts`

**Problem:**  
The file contained only `console.log("Hello from @workspace/scripts")`. The `package.json` had a `"hello"` script that ran it. This is a scaffolding leftover that was never removed.

**Fix applied:**  
- Deleted `scripts/src/hello.ts`
- Removed the `"hello"` script from `scripts/package.json`
- Added a minimal `scripts/src/index.ts` (`export {}`) so the TypeScript compiler doesn't error on an empty `src/` directory

---

### A8 — MINOR: Unnecessary Variable Indirection

**Severity:** Minor — dead alias  
**File:** `artifacts/api-server/src/routes/exams.ts:16`

**Problem:**  
```typescript
const limiterKey = userId;
const limiterRecord = examStartLimiter.get(limiterKey);
```
`limiterKey` was simply `userId` with no transformation. It added a confusing layer of indirection suggesting a more complex key was intended (e.g., `userId + ":" + quizId`).

**Fix applied:** Removed `limiterKey`; use `userId` directly in `get`/`set` calls.

---

## Advisory Findings (Not Fixed — Requires Manual Action)

---

### A9 — ADVISORY: Dead Dependencies

**Severity:** Advisory — bloat, increased attack surface

**`lib/db` (Drizzle ORM):**  
`lib/db/src/schema/index.ts` contains only `export {}`. The Drizzle ORM and all its dependencies (`drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`) are installed but the schema is empty. The API server lists `@workspace/db` as a dependency but never imports anything from it. The entire package is dead weight.

**Action required:**  
- If Drizzle migrations are planned for the future: keep `lib/db` but populate `schema/index.ts` with at least one table definition.  
- If Supabase-only architecture is permanent: remove `lib/db` entirely from the workspace and remove `"@workspace/db": "workspace:*"` from `artifacts/api-server/package.json`.

---

**OpenTelemetry Instrumentation Packages:**  
15+ `@opentelemetry/instrumentation-*` packages are installed (http, express, pg, redis, mongodb, mysql2, bunyan, connect, fastify, generic-pool, graphql, hapi, ioredis, knex, koa, memcached, winston…). None of them are initialized. The API server bootstraps Sentry with `skipOpenTelemetrySetup: true`. These packages are never touched at runtime.

**Action required:**  
Either initialize OpenTelemetry properly in a `src/instrumentation.ts` loaded before any other module, OR uninstall all unused `@opentelemetry/instrumentation-*` packages to reduce the install footprint by ~40 MB.

---

### A10 — ADVISORY: Three Separate Rate-Limiting Implementations

**Severity:** Advisory — maintainability risk

The codebase has three distinct rate-limiting systems:

| Location | Type | Scope | Resets on restart |
|---|---|---|---|
| `lib/rateLimit.ts` | In-memory Map | IP-based, global routes | Yes |
| `lib/rateLimitDb.ts` | Supabase-backed | Email-based, auth routes | No |
| Inline Map in `exams.ts` | In-memory Map | User ID-based, exam start | Yes |

Additionally, `storage.ts` has two more inline Maps (`pdfUploadLog`, `photoUploadLog`) for file upload rate limiting.

**Risks:**
- Horizontal scaling (multiple instances) will break in-memory limiters — users can bypass them by hitting a different instance.
- Three implementations mean rate-limit bypass logic could differ subtly between endpoints.

**Action required (future refactor):**  
Consolidate all rate limiting onto `rateLimitDb.ts` (the Supabase-backed implementation). This is the only one that survives server restarts and scales horizontally. The exam and file upload rate limits are the highest-risk and should be migrated first.

---

## Cleanup Plan (Ordered by Impact)

### Immediate (already done)
- [x] Fix `photo_url` → `avatar_url` across storage and profile layers
- [x] Whitelist fields in `PATCH /subjects`, `PATCH /chapters`, `PATCH /topics`
- [x] Fix render-time side effect in `App.tsx` `RootRoute`
- [x] Remove unused `signUp` from `useAuth`
- [x] Remove unused `GATE_ORDER` constant
- [x] Fix no-op ternary in admin gate config
- [x] Delete `scripts/src/hello.ts` placeholder
- [x] Remove `limiterKey` alias in `exams.ts`

### Short-term (1–2 sprints)
- [ ] Decide on `lib/db`: fully populate the Drizzle schema or remove the package entirely
- [ ] Remove all unused `@opentelemetry/instrumentation-*` packages, OR initialize OTel properly
- [ ] Update `scripts/package.json` to add useful utility scripts (e.g., seed data, health check)

### Medium-term (refactoring roadmap)
- [ ] Migrate all in-memory rate limiters to the Supabase-backed `rateLimitDb.ts`
- [ ] Replace the hardcoded `low_ctr_lectures: 0` stub in `admin.ts` analytics with a real query against `quiz_attempts` and `lectures`
- [ ] Add integration tests for gate-check endpoints (progress.ts) — the dual-layer gate enforcement is the core product invariant and has no test coverage
- [ ] Consider extracting the B2 presigned URL logic into a standalone `lib/b2-client` with retry and error normalization, currently scattered across `storage.ts`

---

## Architecture Assessment

**Strengths:**
- Clean serverless split: Supabase handles auth + RLS, Express handles business logic with service role only where needed
- Dual-layer gate enforcement (frontend cosmetic + backend 403) is the right pattern
- B2 presigned URL approach keeps large files off the Express process
- Supabase RLS on all tables provides a solid multi-tenant data isolation baseline
- Sentry error monitoring configured on both frontend and backend
- Progressive Web App with idb-based offline exam auto-save and Background Sync for Pomodoro sessions

**Weaknesses:**
- No test coverage on gate-check logic — the most critical product invariant
- In-memory rate limiters will not survive horizontal scaling
- `lib/db` dead package creates confusion about the intended data layer
- Analytics endpoint has hardcoded stub values (`low_ctr_lectures: 0`) not backed by real queries

---

## Files Changed in This Audit

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/storage.ts` | `photo_url` → `avatar_url` (delete + profile update endpoints) |
| `artifacts/api-server/src/routes/subjects.ts` | Whitelist fields in PATCH handler |
| `artifacts/api-server/src/routes/chapters.ts` | Whitelist fields in PATCH handler |
| `artifacts/api-server/src/routes/topics.ts` | Whitelist fields in PATCH handler |
| `artifacts/api-server/src/routes/progress.ts` | Remove unused `GATE_ORDER` constant |
| `artifacts/api-server/src/routes/exams.ts` | Remove `limiterKey` alias |
| `artifacts/api-server/src/routes/admin.ts` | Fix no-op ternary in gate config builder |
| `artifacts/edtech/src/App.tsx` | Fix render-time `setLocation` → `useEffect` |
| `artifacts/edtech/src/hooks/useAuth.ts` | Remove unused `signUp` method |
| `artifacts/edtech/src/pages/ProfilePage.tsx` | `photo_url` → `avatar_url` (3 occurrences) |
| `scripts/src/hello.ts` | Deleted (placeholder) |
| `scripts/src/index.ts` | Created (minimal `export {}`) |
| `scripts/package.json` | Removed stale `hello` script |
