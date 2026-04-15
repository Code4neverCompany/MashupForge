# Code Quality Audit — 2026-04-15

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**HEAD:** 0c9a5ee

## Executive Summary

18 ungated commits reviewed and gated (all PASS or WAIVED). One structural issue found:
**tsc is not clean at HEAD** — 8 type errors across 3 files. The errors predate the recent
type-fix batch and were surfaced by the `any` → `unknown` sweep (dd80990). They require
targeted narrowing at usage sites to resolve.

---

## Type Errors (tsc --noEmit)

### 1. `app/api/leonardo-video/route.ts` — 3 errors (lines 32, 43, 44)

**Root cause:** `body` is typed `Record<string, unknown>`, so `body.parameters` has type
`unknown`. Accessing `.guidances`, `.width`, `.height` on `unknown` is invalid.

```ts
let body: Record<string, unknown>;
// ...
body = { ..., parameters: { prompt, duration, ... } };

body.parameters.guidances = { ... };  // TS18046: body.parameters is unknown
body.parameters.width = 1920;          // TS18046
body.parameters.height = 1080;         // TS18046
```

**Fix pattern:** Declare `parameters` as a typed intermediate before assigning to body, or
type body more specifically:
```ts
const parameters: {
  prompt: string; duration: number; mode: string; motion_has_audio: boolean;
  guidances?: unknown; width?: number; height?: number;
} = { ... };
body = { ..., parameters };
parameters.guidances = { ... };  // OK — parameters has known type
```

### 2. `app/api/leonardo/route.ts` — 1 error (line 104)

**Root cause:** `parameters` is `Record<string, unknown>`, so `parameters.quantity` is
`unknown`. `Math.min(unknown, 4)` rejects `unknown` where `number` is expected.

```ts
const parameters: Record<string, unknown> = { ..., quantity: Math.min(...) };
// ...
parameters.quantity = Math.min(parameters.quantity, 4);  // TS2345
```

**Fix pattern:** Narrow before use:
```ts
const currentQty = typeof parameters.quantity === 'number' ? parameters.quantity : 1;
parameters.quantity = Math.min(currentQty, 4);
```

### 3. `components/Sidebar.tsx` — 4 errors (lines 351, 355, 361)

**Root cause:** `msg.groundingChunks` items have element type `unknown`. The `.map((chunk, j) => { if (chunk.web?.uri) {...} })` block accesses `.web`, `.web.uri`, `.web.title` on `unknown`.

**Fix pattern:** Type guard or interface:
```ts
interface GroundingChunk { web?: { uri?: string; title?: string } }
// ...
(chunk as GroundingChunk).web?.uri
// or
msg.groundingChunks.map((chunk: GroundingChunk, j) => { ... })
```

---

## Batch Gates Written This Session

| Gate | Commit(s) | Decision |
|---|---|---|
| STORY-002 | fbf81a5 | WAIVED |
| STORY-125 | 6008a50 | PASS |
| FIX-101 | 9300ce1 | PASS |
| STORY-132 | 33792e7 | PASS |
| FIX-100 | f32fef8 | PASS |
| STORY-132-original | 7b4ee8f | PASS |
| STORY-133 | 2f715a2 | PASS |
| STORY-134 | eaf4e32 | PASS |
| FIX-100-slices-BCD | 32a4894, 9d922f3, cec0f9b | PASS |
| PROP-010 | 5df7495 | PASS |
| TYPE-FIXES-batch | bf35f09, 125c5ce, 6a438b7, 0c9a5ee | PASS* |
| CHORE-CLEANUP-batch | 91067e3, faa4de2, a1d0fe4 | PASS |
| POLISH-010-011-012 | d792d04, 442442b, 574554a | PASS |

*TYPE-FIXES-batch passes on their own scope; the pre-existing tsc errors noted above
are in files outside those commits' touch list.

---

## Open Blockers (carried forward)

- **RACE-1**: No install lock in `app/api/pi/install/route.ts` — concurrent npm installs
  can corrupt the global prefix. Still unresolved.
- **STORY-004/STORY-061/STORY-101**: Awaiting Maurice's Windows manual test pass.

---

## Generated Review Tasks

The following tasks are ready for Developer queue:

```
- [ ] QA-AUDIT-001: Fix tsc TS18046 in app/api/leonardo-video/route.ts (lines 32, 43, 44)
      why: body.parameters typed as unknown — access to .guidances/.width/.height fails tsc
      classification: routine

- [ ] QA-AUDIT-002: Fix tsc TS2345 in app/api/leonardo/route.ts (line 104)
      why: parameters.quantity is unknown, cannot pass to Math.min()
      classification: routine

- [ ] QA-AUDIT-003: Fix tsc TS18046 in components/Sidebar.tsx (lines 351, 355, 361)
      why: groundingChunks items typed as unknown, .web/.web.uri/.web.title inaccessible
      classification: routine

- [ ] QA-AUDIT-004: Add install lock to app/api/pi/install/route.ts (RACE-1)
      why: concurrent npm installs can corrupt the global prefix; check-then-act pattern
      classification: complex (requires atomic lock primitive or mutex)
```
