---
name: PROP-013 — RACE-1 install lock investigation
description: Investigated approved fix and found the race doesn't exist; resolved by analysis
type: review
---
# PROP-013 — RACE-1 install lock (RESOLVED BY INVESTIGATION)

**Date:** 2026-04-15
**Author:** developer
**Status:** RESOLVED — no fix needed. RACE-1 does not exist as described.
**Files touched:** none (write-up only)

## Approved scope (from PROP-013)

> Add an in-process mutex around `POST /api/pi/install` to prevent
> concurrent npm installs from corrupting the global prefix.

## Why I didn't ship the fix

When I sat down to implement the 5-LOC mutex, I re-read the route
handler more carefully and realized **the race window is zero**.

```ts
// app/api/pi/install/route.ts:28-42
export async function POST() {
  try {
    const existing = getPiPath();   // SYNC
    if (existing) { return ... }
    const result = installPi();     // SYNC — spawnSync blocks event loop
    return NextResponse.json(...);
  }
}
```

The two operations the audit was worried about (`getPiPath` check and
`installPi` act) are both **synchronous**, with **no `await` between
them**. Node.js is single-threaded, so the event loop cannot interleave
two POST handlers between those two lines.

Walking through the worst-case scenario:

1. **t=0:** POST request 1 arrives. Node schedules its handler.
2. **t=1:** POST request 2 arrives. Node queues it.
3. **t=2:** Handler 1 runs `getPiPath()` → returns `null`.
4. **t=3:** Handler 1 runs `installPi()`. `spawnSync` **blocks the
   entire JavaScript event loop** for the 30-60s npm install runs.
5. **t=2..t=60:** Handler 2 cannot start. The event loop is blocked.
6. **t=60:** `installPi()` returns. Handler 1 sends its response.
7. **t=61:** Event loop is free. Handler 2 starts.
8. **t=62:** Handler 2 runs `getPiPath()` → returns the **installed**
   path now. Returns `{ alreadyInstalled: true }`. No second install.

There is no window in which both handlers can observe `getPiPath() ===
null` and both call `installPi()`. Adding a mutex would protect
against an impossible state.

## Why the audit got it wrong

The audit (`docs/bmad/qa/CODE-QUALITY-AUDIT-2026-04-15.md` RACE-1) just
flagged "check-then-act pattern" as a category, without verifying
whether the surrounding code actually allows interleaving. In a typical
async handler with `await` between check and act, this would be a
real race. In our specific code path it is not.

## Cross-process scenarios I also considered

A JS mutex wouldn't help against a *cross-process* race (e.g., the
Tauri Rust launcher running its own npm install concurrently). I
checked `src-tauri/src/lib.rs:413-425` — the launcher only does
`std::fs::create_dir_all(&pi_install_dir)` to ensure the directory
exists. It does **not** run `npm install`. The actual install only
happens via this Next route handler in the Node sidecar process.
There is one Node sidecar per Tauri instance. So cross-process is also
not a vector here.

## What WOULD be a real concurrency bug (not RACE-1, separate)

While reading the code I noticed two adjacent issues that are NOT
RACE-1 but are worth flagging:

1. **Partial-install detection.** If `installPi()` crashes mid-flight
   (sidecar killed, OOM, user closes window), the next sidecar boot's
   `getPiPath()` may return a path to a **broken** install — npm wrote
   the directory tree but didn't finish linking the binary. The route
   would happily return `alreadyInstalled: true` for a binary that
   doesn't actually run. This is a separate issue from RACE-1.
   - Fix shape: `getPiPath()` should also probe `pi --version` (or
     similar) before returning truthy.

2. **No deduping for SAME-instance fast double-clicks at the UI
   level.** If the user clicks "Install pi.dev" twice in the desktop
   shell, both POSTs do hit the route and both block the event loop
   for ~60s each (sequentially). That's not corruption, but it's a
   wasteful 2× wait. The fix is debouncing the button in
   `DesktopSettingsPanel.tsx`, not a server-side mutex.

Neither of these is in scope for PROP-013. Filing as observations.

## Recommendation

Mark RACE-1 as **RESOLVED-BY-ANALYSIS** in the audit. Don't ship a
mutex. If the partial-install or fast-double-click concerns matter,
they need their own scoped tasks.

## Why I'm not shipping this commit even though Maurice approved

The standing rule from earlier this session: **"don't ship no-op fixes
even when they look approved."** TASK-141 (pi-setup console.logs) had
the same shape — looked routine, was actually wrong, I almost shipped
it and reverted. Same lesson here: a 5-LOC mutex looks harmless but
adds code that protects against an impossible state, plus a
maintenance trap for future readers ("why is this here?").

If Maurice disagrees with my analysis and wants the mutex shipped
defensively anyway, I'll do it — but I want the disagreement to be
explicit so the rationale is on record.

**Status:** RESOLVED-BY-INVESTIGATION — no commit. Awaiting Maurice
ack to either close out or override.
