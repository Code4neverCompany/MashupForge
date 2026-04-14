# STORY-093 Review — Error handling audit

**Status:** DONE
**Agent:** Developer
**Date:** 2026-04-15
**Classification:** routine

## Scope

Audit every Next.js API route under `app/api/**/route.ts` for graceful
failure modes:

1. Does a top-level `try/catch` wrap the handler body so thrown helpers
   can't escape as HTML 500s?
2. Does the catch return **JSON** (parseable by the fetch client) not
   a bare string or HTML?
3. Does the caught error get typed as `unknown` and surfaced via
   `getErrorMessage(e)` per the PROP-003 sweep convention?

17 routes audited.

## Findings

### Real gaps (fixed)

**`app/api/pi/status/route.ts`** — no try/catch at all. Handler called
`piStatusSnapshot()` and `getStatus()`, both of which can throw on
filesystem errors (stat, readFile on corrupt auth.json) or spawn
errors. `/api/pi/status` is polled on a timer from the desktop
Settings panel; any throw returned an HTML 500, which the client's
`res.json()` parse rejected, and the Settings panel would show a
stale status indefinitely. **Fix:** wrap the body; on error return
a `200` with a zeroed-out status object plus `lastError`. Status
`200` (not `500`) because the endpoint's contract is "report pi
state" — unreachable pi is a valid state, not a server bug.

**`app/api/pi/models/route.ts`** — no try/catch. `getPiModels()` calls
`spawnSync(pi, ['--list-models'])` which can throw on binary
permission errors or timeout. Same client-parse-failure class.
**Fix:** wrap the body; on error return `500` JSON with
`{ error, models: [] }` so the client always sees a `models` array.

### Cosmetic fixes (applied for PROP-003 consistency)

- `app/api/proxy-image/route.ts:27` — `catch (error)` → `catch (e: unknown)`
- `app/api/desktop/config/route.ts:43` — `catch (e)` → `catch (e: unknown)`
- `app/api/desktop/config/route.ts:111` — `catch (e)` → `catch (e: unknown)`

Behavior identical — `catch(e)` already resolves to `unknown` under
`useUnknownInCatchVariables` (strict TS 4.4+), the annotation makes
the contract explicit and matches the rest of the codebase.

### Already-correct routes (no action)

All 12 other routes have top-level `try/catch (e: unknown)` blocks
that return JSON via `getErrorMessage(e)`:

- `app/api/leonardo/route.ts` (plus STORY-090's new
  `extractLeonardoError` for structured v2 errors)
- `app/api/leonardo/[id]/route.ts` (v2→v1 fallback, transient 5xx
  handling, moderation flattening)
- `app/api/leonardo-video/route.ts`
- `app/api/trending/route.ts`
- `app/api/social/best-times/route.ts`
- `app/api/social/post/route.ts` (plus nested per-channel try/catches
  at lines 141, 255 so one failing channel doesn't abort the others)
- `app/api/social/pinterest/route.ts`
- `app/api/pi/prompt/route.ts` (plus nested stream-abort catch at 101)
- `app/api/pi/start/route.ts`
- `app/api/pi/setup/route.ts`
- `app/api/pi/stop/route.ts` — wraps a single call that returns a bool,
  no throw surface
- `app/api/pi/install/route.ts` (plus STORY-031's `humanizeWindowsError`
  mapping EACCES/ENOENT/EINVAL/ENOSPC/ETIMEDOUT to actionable text)

## Verification

- `tsc --noEmit` clean
- All fixes are additive (wrap existing behavior); no handler signature
  or response shape change for the routes that were already working
- The two real fixes (pi/status, pi/models) converge on the same
  contract as the other 12 routes: JSON out, typed catch, error
  message via `getErrorMessage`

## Exit criteria

Audit complete, three real fixes landed, codebase has uniform error
handling across 17 API routes. STORY-093 `[x]`.

## Follow-ups (not in scope)

None required. The one adjacent area worth flagging — client-side
`fetch()` sites that assume a JSON response — is already defensive
in the pipeline code (PipelinePanel gates on `res.ok` before
`res.json()`). That's the client half of this story's promise and
it already holds.
