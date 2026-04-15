# STORY-121 Review — Settings wiped on restart: fix ephemeral port origin drift

**Status:** SHIPPED — awaiting CI build + Maurice retest
**Agent:** Developer
**Date:** 2026-04-15
**Classification:** routine (human-directed from Maurice)

## Symptom

After closing and relaunching the installed `.msi`, all of Maurice's
configuration — API keys, prompts, niches, genres, carousel groups,
pipeline state — came back empty. The settings panel looked like a
fresh install every time.

## Root cause — IndexedDB is origin-scoped

`hooks/useSettings.ts` persists via `idb-keyval` (IndexedDB). IndexedDB
is **origin-scoped** per the spec: the key is `(scheme, host, port)`.
Tauri's WebView2 on Windows stores IndexedDB state in
`%LOCALAPPDATA%\<bundle-id>\EBWebView\Default\IndexedDB\...` keyed by
origin.

`src-tauri/src/lib.rs:pick_free_port()` was binding
`TcpListener::bind("127.0.0.1:0")` on every launch — which means the
OS hands back a **fresh ephemeral port each time**. The sequence was:

1. Launch #1 → port 49731 → origin `http://127.0.0.1:49731` →
   writes settings into IndexedDB under that origin.
2. Close app.
3. Launch #2 → port 52104 → origin `http://127.0.0.1:52104` →
   IndexedDB lookup under the new origin finds nothing → settings
   start from `defaultSettings` → UI reports "wiped."

The data from launch #1 is still on disk. WebView2 is doing its job.
The problem is we changed the key.

Incidentally this also means previous launches have been quietly
*accumulating* orphan origins in EBWebView — every run leaves a dead
IndexedDB instance that will never be read again. Not critical, but
worth noting.

## Considered alternatives

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Fix the port** (this fix) | 1-function change, zero frontend churn, preserves the whole `idb-keyval` path | Hard-fails on the rare port conflict (mitigated with fallback) | **Chosen** |
| Move settings to a Tauri command + JSON file in app_data_dir | Robust long-term; survives any port change | Needs new commands, new plugin deps, frontend branch, migration layer, 10+ files touched | Defer |
| Route via `tauri://localhost` custom protocol | Stable Tauri-native origin | Requires proxying Next.js API routes through Rust — significant rearchitecture | Defer |
| Hash the bundle identifier to a deterministic port | Elegant + stable | Solves nothing the fixed-constant approach doesn't | Defer |

The "move settings to a file" approach is the correct long-term
answer and would also unblock future multi-window / multi-profile
scenarios, but it's a ~day of work and touches nearly every hook.
The port fix is ~15 lines, and unblocks Maurice TODAY.

## Fix — stable port with ephemeral fallback

### `src-tauri/src/lib.rs`

**1. New constant `DESKTOP_PORT: u16 = 19782`**

Rationale for 19782:
- IANA-unassigned (verified).
- Outside Windows ephemeral range (49152–65535) so no collision
  with random outbound sockets.
- Outside Linux default ephemeral range (32768–60999) for dev-side
  sanity.
- Above the privileged-port cutoff (1024) so no elevation needed.
- Not one of the obvious Next.js / dev defaults (3000, 3001, 8080,
  5173, etc.) that Maurice or other tools might already have running.

**2. `pick_free_port()` → `resolve_port(&log_dir)` — new impl**

```rust
match TcpListener::bind(("127.0.0.1", DESKTOP_PORT)) {
    Ok(listener) => Some(listener.local_addr()?.port()),
    Err(_) => {
        // log a BIG WARNING to startup.log that this session's
        // settings will not persist
        TcpListener::bind("127.0.0.1:0")
            .ok()
            .and_then(|l| l.local_addr().ok())
            .map(|a| a.port())
    }
}
```

Takes `&log_dir` so both branches (stable bound, fallback bound,
fallback bind failure) can record their outcome to `startup.log`.

**3. `setup()` callsite updated**

Passes `&log_dir` through to `resolve_port`. Error path renamed from
"ephemeral" to "any" since we now try two strategies.

## Fallback behavior — intentional tradeoff

If something else is already bound on 19782, we fall back to
ephemeral and **log a prominent WARN line** to `startup.log`:

> `WARN stable port 19782 unavailable (<os error>) — falling back
> to ephemeral. Settings WILL NOT persist across launches until the
> conflicting process is closed.`

The alternative — hard-fail with a MessageBox — would block launch
entirely. I picked soft-fail because:
1. The app still WORKS, just without persistence for that session.
2. Maurice can see the warning in startup.log.
3. Port 19782 is unusual enough that real conflicts should be
   vanishingly rare.

If conflicts do turn out to happen in practice, we can promote this
to a MessageBox in a followup without changing the persistence
contract.

## Migration — existing users

Launches before this fix scattered IndexedDB state across many
ephemeral-port origins under EBWebView. After this fix, settings
will read and write under the new `http://127.0.0.1:19782` origin,
which is empty at first boot.

**Maurice's existing configuration (API keys, prompts, niches,
genres, carousel groups, pipeline state) is NOT recoverable from
those orphan origins** — WebView2 doesn't expose a cross-origin
IndexedDB import API, and crawling `%LOCALAPPDATA%\...\IndexedDB`
manually to mine LevelDB snapshots would be a whole separate tool.

Maurice will need to re-enter his settings once after installing
this build. Subsequent launches will persist normally.

This is a one-time cost — I considered adding a localStorage →
IndexedDB migration like `useSettings.ts` already has for the
web/Vercel deployment, but localStorage is also origin-scoped so
it hits the exact same problem. There is no client-side data
source we can migrate FROM.

## Why this doesn't fix STORY-120 too

STORY-120 (chat hang, shipped separately as `ff7560e`) was a
Node child_process / CVE-2024-27980 issue with the `pi.cmd` shim.
Totally different layer. Both fixes need to land before Maurice's
retest is meaningful.

## Files touched

- `src-tauri/src/lib.rs` — `pick_free_port` removed, replaced with
  `DESKTOP_PORT` constant + `resolve_port(&Path) -> Option<u16>`.
  `setup()` callsite updated to pass `&log_dir`.
- `docs/bmad/reviews/STORY-121.md` — this artifact

## cargo check

`cargo check --offline` — clean. No new warnings.

## Exit criteria

1. CI builds a new `.msi` from the commit containing this fix.
2. Maurice installs, launches, sets an API key / prompt / niche.
3. Maurice closes the app completely, relaunches.
4. Previous settings are still present in the UI.
5. `startup.log` shows `bound stable port 19782` on every launch,
   NOT the WARN-fallback line.

If settings still don't persist after this build:
- Check `startup.log` — confirm the stable port actually bound.
  If the WARN line is present, something is stealing 19782 (likely
  a Maurice dev server; we can move to another port).
- If the stable port bound cleanly but settings still reset,
  WebView2 may be using a non-persistent profile, which would be
  a separate Tauri configuration issue.

## Followups

- **STORY-122** (auto-update): next in queue after Maurice verifies
  this fix.
- Eventual replacement: move settings to a Tauri-command-backed
  JSON file in `app_data_dir`. Survives any origin change, supports
  future multi-window work, and lets us share settings with the
  Next.js sidecar (currently the API routes re-read env vars and
  can't see user-configured API keys without a round trip).
