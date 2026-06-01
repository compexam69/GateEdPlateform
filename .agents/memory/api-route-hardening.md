---
name: API Route Hardening
description: Patterns and rules established during the full-codebase security audit for this project's Express routes.
---

## Rules

**UUID validation on every route param and UUID body field:**
```ts
if (!isValidUuid(someId)) { res.status(400).json({ error: "Invalid ID" }); return; }
```

**Field whitelist (mass-assignment prevention) on every INSERT:**
- Never spread `req.body` directly into Supabase `.insert()`.
- Always extract and validate each field individually.
- Fields like `creator_id`, `user_id`, `id`, `role` must never come from the request body — always set from `req.user!.id` or a fixed default.

**String length capping:**
- Use `capText(value, MAX.TITLE)` for titles, `capText(value, MAX.DESCRIPTION)` for descriptions.
- Never insert raw `req.body` strings into the DB without length capping.

**Enum validation:**
- Use `sanitizeEnum(value, VALID_ENUM_ARRAY)` before passing any string to `.eq()` or `.insert()`.

**URL validation:**
- Any user-supplied URL must be parsed with `new URL()` and have `protocol === "https:"` checked.

**Reorder endpoints:**
- Filter all items through `isValidUuid(id) && Number.isFinite(order_index)` before applying updates.

**Rate limiter fail-open:**
- `rateLimitDb.ts` is deliberately fail-open (allows requests when DB is down) but always logs `logger.warn` on failure.

**Why:** Prevents mass-assignment attacks, SQL injection via enum fields, SSRF via youtube_url, and ensures DB errors don't silently corrupt data.

**Where it applies:** All routes in `artifacts/api-server/src/routes/`. The `sanitize.ts` helper (`capText`, `isValidUuid`, `sanitizeEnum`, `MAX`) is the single source of truth.
