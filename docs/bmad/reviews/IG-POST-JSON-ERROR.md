# IG-POST-JSON-ERROR — Posting route crashes with "Internal Server Error" (non-JSON)

**Date:** 2026-04-16
**Reporter:** Maurice
**Severity:** P1 — all posting broken on desktop

## Symptom

```
Unexpected token 'I', "Internal S..." is not valid JSON
```

Client calls `/api/social/post`, gets an HTML 500 page instead of JSON,
`res.json()` throws a parse error.

## Root Cause: Top-Level `import sharp` Crashes the Route Module

The posting route had two top-level static imports:
```ts
import { TwitterApi } from 'twitter-api-v2';
import sharp from 'sharp';
```

`sharp` is a native C++ addon — it requires a platform-specific `.node`
binary. On desktop standalone builds, if the correct binary isn't bundled
(wrong platform, missing from `node_modules`, or traced out by
`outputFileTracing`), the import fails at module load time.

When a Next.js API route module fails to load, Next returns a generic HTML
500 "Internal Server Error" page. The route's own `try/catch` never runs
because the module itself never evaluates. The client's `res.json()` then
chokes on the HTML.

`twitter-api-v2` carries the same risk — it's a complex package tree that
could fail to resolve in a standalone build.

## Fix

1. **Dynamic imports for sharp + twitter-api-v2**: Both are now loaded with
   `await import(...)` inside the platform-specific code blocks, not at the
   module top level. The route module always loads → always returns JSON.

2. **Sharp fallback**: If `sharp` fails to import, `prepareForInstagram`
   returns the original buffer unmodified (IG may crop, but posting works).

3. **Client-side JSON parse guard**: All three `res.json()` call sites in
   MainContent.tsx (`postImageNow`, carousel scheduler, single scheduler)
   now wrap the parse in try/catch and surface `"Server error (HTTP N)"`.

### Files changed

| File | Change |
|------|--------|
| `app/api/social/post/route.ts` | `sharp` + `twitter-api-v2` → dynamic imports |
| `components/MainContent.tsx` | Defensive JSON parse in 3 posting call sites |

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 107/107 pass
- **Needs Maurice**: rebuild .msi, verify posting returns JSON (success or
  structured error) instead of "Internal Server Error"

## Follow-up

- If sharp is unavailable on desktop, images won't be padded to IG's aspect
  ratio — IG will center-crop them. Consider shipping sharp's win32-x64
  binary explicitly in the Tauri resources or switching to a WASM-based
  image processor.
