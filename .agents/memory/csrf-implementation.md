---
name: CSRF implementation
description: How CSRF protection is wired across the Express API and React SPA using csrf-csrf v3
---

# CSRF implementation

## Rule
The app uses the double-submit cookie pattern via `csrf-csrf` v3.  Any change to the CSRF flow must preserve the session-identifier consistency requirement (see Why).

## How it works

**Server (`artifacts/api-server`):**
- `src/middlewares/csrf.ts` — `doubleCsrf()` config: `getSessionIdentifier` decodes JWT `sub` from Authorization header; falls back to `IP:UA` slice.
- `src/routes/csrf.ts` — `GET /csrf-token` calls `generateCsrfToken(req, res)` → sets HttpOnly cookie + returns JSON `{ token }`.
- `app.ts` — `cookieParser()` → `doubleCsrfProtection` → routes → `csrfErrorHandler` (converts `EBADCSRFTOKEN` → 403).
- Cookie name: `x-csrf-token` (dev) / `__Host-x-csrf-token` (prod).

**Client (`artifacts/edtech`):**
- `src/lib/csrf.ts` — lazy `getCsrfToken()` fetches `/api/csrf-token` **with the Authorization header** so session ID matches.  Cached in module scope; `clearCsrfToken()` resets it.
- `src/lib/api.ts` — `apiFetch()` injects `x-csrf-token` header on non-safe methods.
- `src/hooks/usePushNotifications.ts` — local `apiFetch` also injects the header.
- `src/main.tsx` — registers `setCsrfTokenGetter(getCsrfToken)` for orval hooks; `onAuthStateChange` calls `clearCsrfToken()`.

**Library (`lib/api-client-react`):**
- `src/custom-fetch.ts` — added `CsrfTokenGetter` type, `_csrfTokenGetter` var, `setCsrfTokenGetter()` export, and injection in `customFetch` (after auth token, before request).
- After editing this file run `npx tsc -p tsconfig.json` inside `lib/api-client-react/` (see api-client-react-build.md).

## Why
The session identifier MUST be the same between the GET /csrf-token call and every mutation.  If it differs (e.g. IP changes or auth state changes), validation fails with EBADCSRFTOKEN.  Passing the Authorization header to the token endpoint ensures the sub-based session ID is consistent.

## How to apply
- New mutation endpoints: covered automatically by global `doubleCsrfProtection` middleware.
- New manual fetch calls (outside orval or apiFetch): import `getCsrfToken` from `@/lib/csrf` and add `x-csrf-token` header for non-safe methods.
- Production: set `CSRF_SECRET` env var (stable 32-byte hex) so tokens survive restarts.
