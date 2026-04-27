# QA Review — SCHED-POST-ROBUST: CWE-208 fix + Settings toggle

| Field       | Value                                         |
|-------------|-----------------------------------------------|
| Task        | QA-SCHED-TOGGLE-REVIEW                        |
| Commits     | 4273501 (CWE-208 fix), b48ac9e (toggle)       |
| Reviewer    | Quinn (QA)                                    |
| Date        | 2026-04-27                                    |
| Gate        | **PASS**                                      |
| Confidence  | 0.93                                          |

---

## Scope

1. `app/api/social/cron-fire/route.ts` — `safeEqual` replaced with
   `crypto.timingSafeEqual` (commit 4273501, follow-up to SCHED-POST-ROBUST-QA
   WARNING finding).
2. `components/SettingsModal.tsx` + `types/mashup.ts` — Server-Side Cron toggle
   added to Settings > General (commit b48ac9e).

---

## Test run

```
892 / 892 tests pass (vitest)
TypeScript: clean (npx tsc --noEmit — no errors)

Note: 1 pre-existing unhandled error logged during test run:
  ReferenceError: window is not defined
  ❯ KebabMenu.tsx:116 (window.setTimeout inside cleanup)
  Origin: tests/components/GalleryCard.test.tsx
This originates at commit 1039e04 (before these commits) and is
unrelated to the reviewed changes.
```

---

## Finding 1 — CWE-208 fix: `crypto.timingSafeEqual` (commit 4273501)

**File:** `app/api/social/cron-fire/route.ts:36-44`

```ts
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
```

**Checks:**

| Check | Result |
|---|---|
| `timingSafeEqual` imported from `crypto` (not userland) | ✓ |
| Both arguments converted to `Buffer` before call | ✓ |
| Outer length check present before `timingSafeEqual` call | ✓ required — `timingSafeEqual` throws `TypeError` on mismatched buffer sizes |
| `try/catch` wrapping the call (defensively handles Buffer.from edge cases) | ✓ |
| Comment explains why the residual length check is acceptable | ✓ |

**Analysis of the length check:**

The prior WARNING in SCHED-POST-ROBUST-QA identified an early-return on length
mismatch as a timing side-channel. The fix correctly calls `timingSafeEqual`
but still requires the length guard because Node's implementation throws — not
returns false — on mismatched sizes. The comment at lines 29-35 accurately
captures this: "an attacker can already enumerate plausible secret lengths
trivially; what timingSafeEqual prevents is per-byte bisection of the secret
itself." This is well-reasoned. The residual length-check side-channel is
practically unexploitable when the secret is a fixed-length token (32–64 chars)
from a known generator — the attacker gains at most 1 bit.

**Verdict: PASS** — Prior WARNING resolved correctly.

---

## Finding 2 — Settings toggle (commit b48ac9e)

**Files:** `components/SettingsModal.tsx:590-605`, `types/mashup.ts:233`, `types/mashup.ts:812`

### Toggle rendering (SettingsModal.tsx:590-605)

```tsx
<div className="mt-6 pt-6 border-t border-zinc-800">
  <h4 className="text-lg font-medium text-white mb-1">Scheduled Posts</h4>
  <p className="text-[11px] text-zinc-500 mb-4">
    When enabled, a GitHub Actions cron fires posts even when the browser is closed.
    Requires UPSTASH_REDIS_REST_URL/TKN configured on Vercel.
  </p>
  <div className="flex items-center justify-between">
    <span className="text-sm text-zinc-300">Server-Side Cron</span>
    <button
      onClick={() => updateSettings({ serverCronEnabled: !settings.serverCronEnabled })}
      className={`w-12 h-6 rounded-full transition-colors ${
        settings.serverCronEnabled ? 'bg-[#00e6ff]' : 'bg-zinc-700'
      } relative`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white
        transition-transform ${settings.serverCronEnabled ? 'translate-x-6' : ''}`} />
    </button>
  </div>
</div>
```

| Check | Result |
|---|---|
| Renders under `activeTab === 'general'` | ✓ |
| `updateSettings({ serverCronEnabled: !settings.serverCronEnabled })` onClick wiring | ✓ |
| Active color `bg-[#00e6ff]`, inactive `bg-zinc-700` | ✓ matches fleet design tokens |
| Thumb translate `translate-x-6` on active | ✓ thumb travel = 24px, pill width 48px, thumb 16px — correct |
| Toggle pattern consistent with Watermark toggle at lines 613-619 | ✓ |

### Type definition (types/mashup.ts:226-233)

```ts
/**
 * SCHED-POST-ROBUST: when true, the browser-side auto-poster
 * (MainContent useEffect) short-circuits and a server-side cron
 * (GitHub Actions → /api/social/cron-fire) fires scheduled posts
 * instead. ...
 */
serverCronEnabled?: boolean;
```

✓ Field declared, optional (safe default-false behavior for existing users),
JSDoc explains the full contract.

### Default value (types/mashup.ts:812)

```ts
serverCronEnabled: false,
```

✓ Present in `defaultSettings` — no undefined-access risk in toggle rendering.

**Verdict: PASS**

---

## INFO — Toggle button has no ARIA switch role

`components/SettingsModal.tsx:598-603` — the `<button>` has no
`role="switch"`, `aria-checked`, or `aria-label`. The label is a sibling
`<span>`, not an associated `<label>`. This is consistent with the
existing Watermark toggle pattern (lines 613-619 use the same structure),
so it is not a regression introduced by this commit. Noting for a future
accessibility pass.

---

## Checklist

| Check | Result |
|---|---|
| `timingSafeEqual` called correctly with Buffer args | ✓ PASS |
| Outer length guard necessary and correct (timingSafeEqual throws on mismatch) | ✓ PASS |
| try/catch error handling present | ✓ PASS |
| Prior CWE-208 WARNING resolved | ✓ PASS |
| Toggle renders in correct tab | ✓ PASS |
| `updateSettings` wiring correct | ✓ PASS |
| `serverCronEnabled` declared in `AppSettings` type | ✓ PASS |
| `serverCronEnabled: false` in `defaultSettings` | ✓ PASS |
| TypeScript clean (`npx tsc --noEmit`) | ✓ PASS |
| 892/892 tests pass | ✓ PASS |
| ARIA on toggle button | ℹ INFO — missing, consistent with codebase pattern |

---

## Gate decision

**PASS**

Both items are correctly implemented. The CWE-208 fix properly uses
`crypto.timingSafeEqual` with a well-reasoned comment on the residual
length-check behaviour. The settings toggle is correctly wired, typed,
defaulted, and styled consistently with the existing design system.
One INFO item (missing ARIA on toggle) is pre-existing across all
settings toggles and does not block.
