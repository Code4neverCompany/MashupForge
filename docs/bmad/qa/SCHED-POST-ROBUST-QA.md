# QA Review — SCHED-POST-ROBUST

| Field       | Value                            |
|-------------|----------------------------------|
| Story       | SCHED-POST-ROBUST                |
| Commit      | 787838e                          |
| Reviewer    | Quinn (QA)                       |
| Date        | 2026-04-27                       |
| Gate        | **CONCERNS**                     |
| Confidence  | 0.88                             |

---

## Scope

Server-side scheduled-post queue backed by Upstash Redis: queue helpers
(`lib/server-queue.ts`), cron-fire handler (`app/api/social/cron-fire/route.ts`),
queue management API routes (`app/api/queue/{schedule,cancel,results}/route.ts`),
browser-side reconciler (`lib/server-queue-client.ts`), GitHub Actions workflow
(`.github/workflows/cron-fire-scheduled-posts.yml`), and the full test suite
for these modules.

---

## Test run

```
892 / 892 tests pass (vitest)
  tests/api/cron-fire-auth.test.ts   — 5 / 5
  tests/lib/server-queue.test.ts     — 22 / 22
  tests/lib/server-queue-client.test.ts — 7 / 7
  (all other pre-existing suites unchanged)
```

---

## Findings

### WARNING — `safeEqual` has a length timing side-channel

**File:** `app/api/social/cron-fire/route.ts`

```ts
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;   // ← leaks secret length
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

The early `return false` on mismatched lengths means an attacker can
binary-search the secret length by measuring response latency. The XOR
loop correctly prevents character-by-character probing, but only for
inputs of the correct length.

**Fix:** Use `crypto.timingSafeEqual()` on `Buffer.from()` inputs, which
is constant-time regardless of length:

```ts
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Still need to compare *something* to avoid short-circuit,
    // then return false. OR: pad to fixed length first.
    timingSafeEqual(ba, Buffer.alloc(ba.length)); // burn constant time
    return false;
  }
  return timingSafeEqual(ba, bb);
}
```

The simpler and fully constant-time approach: hash both sides with
`createHmac('sha256', fixedKey)` and compare the digests — length
variation is absorbed by the hash.

This is a WARNING rather than a FAIL because: (1) GitHub Actions secrets
are rotatable, (2) the attack requires network timing measurement against
a production endpoint, making exploitation non-trivial. However it is a
real CWE-208 and should be fixed before any public exposure of the
cron-fire endpoint.

---

### INFO — `GET` handler on cron-fire exposes queue for curl probing

**File:** `app/api/social/cron-fire/route.ts`

Both `POST` and `GET` are exported. `GET` fires posts just as `POST`
does (same `checkAuth` + `run` call path). This was intentional per the
Dev comment ("for curl smoke tests"), but it means anyone with the secret
can fire posts via a simple browser URL. Acceptable during development;
recommend removing or gating the `GET` export before production hardening.

---

### INFO — `baseUrl` fallback silently posts to localhost in production

**File:** `app/api/social/cron-fire/route.ts`

```ts
const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
```

If `APP_URL` is not set in the Actions environment the cron fires against
`localhost:3000` which will always fail with a connection error. The
failure is caught and stored as a result entry, so it won't crash —
but posts silently drop with no operator alert. The workflow already
requires `APP_URL` as a secret, so this is a documentation/ops gap
rather than a code defect.

---

### INFO — Platform names accepted without validation at queue layer

**File:** `app/api/queue/schedule/route.ts`

The route validates that `platforms` is a non-empty array of strings,
but does not check that each string is a known platform slug. An
enqueued post with `platforms: ["typo-gram"]` will reach `cron-fire`,
call `fireOne`, and silently fail at the downstream post route. This
matches the existing browser-path behavior (no platform validation at
the IDB write layer either), so it is consistent — but it is worth
adding an allowlist if platform coverage grows.

---

### INFO — Error strings stored verbatim in the results hash

**File:** `lib/server-queue.ts` → `markResult`

```ts
if (result.error) fields.error = result.error;
```

Errors from `fireOne` (which calls `/api/social/post`) may include
provider error messages. These are fetched back by the browser via
`/api/queue/results` and displayed to the user. This is the intended
UX — but worth ensuring downstream error messages from third-party APIs
don't inadvertently surface credentials or internal stack traces.
No code change needed; just a note for the post-route error handling.

---

## Checklist

| Check | Result |
|---|---|
| Atomic claim via `zrem` (race-safe) | ✓ PASS |
| Double-fire guard in browser auto-poster | ✓ PASS — `if (settings.serverCronEnabled) return;` at MainContent.tsx:1471 |
| Auth gate — 503 on missing secret, 401 on wrong/missing token | ✓ PASS — 5/5 auth tests |
| `computeFireAt` throws on garbage input | ✓ PASS |
| `enqueuePost` / `cancelPost` write/remove both ZSET + HASH | ✓ PASS |
| `claimDuePosts` skips orphan ZSET entries (no payload) | ✓ PASS |
| `markResult` / `getResults` / `clearResult` round-trip | ✓ PASS |
| `reconcileResults` — no downgrade of terminal status | ✓ PASS |
| `reconcileResults` — acks orphan server results | ✓ PASS |
| `reconcileResults` — preserves array identity on no-op | ✓ PASS |
| Workflow concurrency guard (`cancel-in-progress: false`) | ✓ PASS |
| Workflow `--fail-with-body` curl for visibility | ✓ PASS |
| `safeEqual` constant-time comparison | ⚠ WARNING — length side-channel |
| Input validation on `/api/queue/schedule` | ✓ PASS — id/date/time/platforms/caption checked |

---

## Gate decision

**CONCERNS**

One WARNING finding (`safeEqual` CWE-208 length timing side-channel)
that should be resolved before hardening the cron endpoint for
production. All functional correctness checks pass. Three INFO items
logged for future operator awareness; none block merge.

Recommend: fix `safeEqual` in a follow-up task, then re-gate as PASS.
