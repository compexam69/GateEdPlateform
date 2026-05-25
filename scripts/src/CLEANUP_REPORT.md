# Codebase Cleanup Report

Generated from a full analysis of all API routes, frontend pages, types, and the OpenAPI spec.

---

## Dead Tables — removed from schema

### `user_profile_photos`
**Why it is dead:** Every route and the frontend (`ProfilePage.tsx`) stores the avatar as a plain text path in `profiles.avatar_url`. The storage routes (`/b2/profile-upload-url`, `/b2/profile-download-url`, `/b2/profile-photo DELETE`) read and write only `profiles.avatar_url`. No route ever touches `user_profile_photos`. The table was never wired up.

**Safe to remove:** Yes. It was never populated.

### `attempts_archive`
**Why it is dead:** The table has a full definition (17 columns), RLS policies, and two indexes — but zero routes read or write it. There is no archival job, no admin endpoint, no background task that touches it.

**Safe to remove:** Yes. No data was ever written to it.

---

## Dead Files — safe to delete

### `lib/db/` package (entire directory)
**Path:** `lib/db/`
**Why it is dead:**
- `lib/db/src/index.ts` imports `drizzle-orm/node-postgres` and throws at startup if `DATABASE_URL` is missing.
- `@workspace/db` was already removed from `artifacts/api-server/package.json` dependencies.
- No file in `artifacts/api-server/` or `artifacts/edtech/` imports from `@workspace/db` or `lib/db`.
- The project is Supabase-only — there is no `DATABASE_URL`, no Drizzle ORM usage, no Postgres pool anywhere in the active codebase.

**Safe to delete:** Yes. Delete the entire `lib/db/` directory.

**Command:**
```bash
rm -rf lib/db
```

### `scripts/src/fix-handle-new-user-trigger.sql`
**Why it is redundant:** This was a targeted patch for the broken `handle_new_user` trigger (the `UPDATE auth.users` deadlock bug). The fix is now baked into `scripts/src/supabase-schema.sql`. For a fresh database, only the main schema needs to be run. For an existing database, this patch is still useful — but it should be clearly labeled as such.

**Safe to delete for fresh installs:** Yes. Keep it only if you need to patch existing production databases without a full re-run.

---

## Duplicate / Redundant Utilities

### `rateLimit.ts` vs `rateLimitDb.ts`
**Not dead — both serve different purposes:**

| File | Type | Scope | Survives restart? |
|---|---|---|---|
| `middlewares/rateLimit.ts` | In-memory Map | Global API (200 req/min) | No |
| `middlewares/rateLimitDb.ts` | Supabase-backed | Auth-critical endpoints | Yes |

`rateLimit.ts` is the first-line IP-level gate (cheap, in-process). `rateLimitDb.ts` is the persistent per-user/email gate for registration, exam starts, and password changes. Both should stay.

---

## What Changed in the Schema

### Tables removed (were dead)
- `user_profile_photos` — 8 columns, 1 unique constraint, 1 RLS policy
- `attempts_archive` — 17 columns, 2 indexes, 1 RLS policy

### Trigger fixed (`handle_new_user`)
- Removed `UPDATE auth.users` — caused "Database error creating new user" (GoTrue row-lock deadlock)
- Added `SET search_path = ''` — required for `SECURITY DEFINER` functions in modern Supabase
- Fully-qualified all table/type references as `public.*`

### New helper function
- `is_admin()` — reusable security definer function used across all admin RLS policies (removes 20+ copies of the same subquery)

### Generated column for full-text search
- `user_notes.content_tsv` is now `GENERATED ALWAYS AS (to_tsvector('english', coalesce(content_text,''))) STORED`
- Eliminates the need for a separate trigger to keep the tsvector in sync

### Constraints added
- `external_tests`: `score_obtained >= 0`, `total_marks > 0`, `percentile between 0 and 100`, `rank > 0`, `score_obtained <= total_marks`
- `quiz_questions.difficulty`: `check (difficulty between 1 and 5)`

### Indexes added (vs old schema)
- `idx_quizzes_type` — analytics queries filter by quiz type
- `idx_user_attempts_status` — submitted-only queries run frequently
- `idx_user_answers_question` — question-level analytics
- `idx_user_notes_file_hash` — SHA-256 dedup check on upload
- `idx_notifications_unread` — partial index on unread only
- `idx_audit_logs_target` — admin log filtering by entity
- `idx_audit_logs_created_at` — time-range log queries

---

## Commands to Apply

### Fresh database (run once in Supabase SQL Editor)
```sql
-- Copy-paste the entire contents of scripts/src/supabase-schema.sql
-- into Supabase Dashboard → SQL Editor → New query → Run
```

### Remove dead lib/db package
```bash
rm -rf lib/db
```

### Remove redundant patch (optional, for fresh installs)
```bash
rm scripts/src/fix-handle-new-user-trigger.sql
```

---

## Optimization Suggestions

1. **Index `user_attempts(user_id, status, submitted_at)`** — the exam history query filters by all three; a composite index would eliminate the sort step.

2. **Partition `rate_limits` by week** — if traffic is high, the hourly cron + per-request cleanup may not scale. A `pg_partman` weekly partition would make the cron delete O(1) (drop partition vs full scan).

3. **Archive old `audit_logs`** — no archival job exists. Add a pg_cron job to move rows older than 90 days to a `audit_logs_archive` table or delete them.

4. **Add `user_attempts(quiz_id, accuracy)` index** — the percentile calculation in `GET /exam/results/:id` does a full table scan of all attempts for a quiz. A partial index on `status = 'submitted'` would help for popular quizzes.

5. **`notifications` TTL** — no cleanup job exists. Unread notifications accumulate indefinitely. Add a pg_cron job to delete notifications older than 30 days that are already read.
