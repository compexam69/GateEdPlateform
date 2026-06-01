---
name: api-client-react lib build
description: How to build the workspace lib for frontend TypeScript to pass.
---

## Rule

`lib/api-client-react` uses `composite: true` in its tsconfig. Frontend TypeScript (`artifacts/edtech`) uses project references pointing to this lib. When `dist/` is absent, `tsc --noEmit` emits TS6305 errors ("Output file has not been built from source file") on every import from `@workspace/api-client-react`.

**Fix:** Run inside `lib/api-client-react/`:
```bash
npx tsc -p tsconfig.json
```
This generates `dist/*.d.ts` declarations (no JS, `emitDeclarationOnly: true`).

**Why:** The package.json exports point to `./src/index.ts` for bundlers (Vite resolves it fine at runtime), but `tsc --noEmit` for typechecking follows project references and requires built declarations.

**Note:** The `lib/api-zod` package may need the same treatment if TS6305 errors appear there too.
