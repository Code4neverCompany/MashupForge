# STORY-080 Review — Fix .msi installer crash

**Status:** SHIPPED (observability + hardening); root cause pending Maurice's `startup.log`
**Agent:** Developer
**Date:** 2026-04-15
**Classification:** complex → human-directed fix
**File touched:** `src-tauri/src/lib.rs` (+218 LOC, -42 LOC rewrite)
**Depends on:** STORY-070 (portable fix, for analogy only — different cause)

---

## Why I'm not just "applying the same port fix"

Maurice's hypothesis — "portable works on 3001, .msi needs the same
fix" — rests on a reasonable assumption that does not match the code.
The portable launcher (`start.bat`) is hardcoded: port 3000 in the
old version, now 3001. The Tauri `.msi` launcher is fundamentally
different: `src-tauri/src/lib.rs` calls `pick_free_port()`
(`TcpListener::bind("127.0.0.1:0")`) and passes the assigned
ephemeral port to the Node sidecar via the `PORT` env var. It
cannot collide with a WSL dev server on 3000 because it never uses
3000 — the OS allocates a fresh free port at runtime.

So porting STORY-070's `PORT=3001` to the `.msi` would:
- Either be a no-op (because the Rust launcher already passes a
  different `PORT` that start.js honors)
- Or be a regression (because pinning to 3001 re-introduces a
  collision window that didn't exist)

The `.msi` is crashing for a different reason. The problem is that
**we can't tell which reason** because the Release build is a
black box.

## The real blocker: zero observability in Release .msi builds

Three compounding issues silence the Release bundle:

1. **`main.rs:2`** — `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`.
   Release has no console; `println!`/`eprintln!` go nowhere.

2. **`lib.rs` old line 54** — `if cfg!(debug_assertions) { app.handle().plugin(tauri_plugin_log::Builder...) }`.
   The log plugin only ran in Debug. Release had no log file either.

3. **`lib.rs` old lines 111-112** — sidecar spawn used
   `.stdout(Stdio::inherit()).stderr(Stdio::inherit())`. With no
   console to inherit, every `console.log` from start.js and
   server.js (including the helpful
   `[tauri-wrapper] booting Next on 127.0.0.1:<port>` line) went
   to `/dev/null`.

Combined: when the app "crashes immediately," Maurice sees a window
flash and disappear (or nothing at all) with zero trail. We could
spend ten sessions guessing at causes. Observability first.

## What shipped

A full rewrite of `src-tauri/src/lib.rs` that:

### 1. Always-on file logging

```rust
.plugin(
    tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                file_name: Some("tauri".to_string()),
            }),
        ])
        .build(),
)
```

Log plugin runs in both Debug and Release. Writes
`%APPDATA%\com.4nevercompany.mashupforge\logs\tauri.log`
automatically (plugin-managed).

### 2. Independent hand-rolled `startup.log`

The plugin ties into the async log pipeline and won't flush if the
process crashes during `setup()`. So every critical step of the
launcher also writes to a synchronous file via
`startup_log_line(&log_dir, ...)` which:
- `create_dir_all`s the log dir
- `OpenOptions::append`s to `startup.log`
- Writes a `[timestamp] message` line
- Ignores all errors (diagnostics must never take down the app)

Lines written:
- `=== MashupForge launcher starting ===`
- `build_mode=release|debug`
- `resource_dir`, `node_bin`, `app_dir`, `start_js`, `log_dir` paths
- `picked port N`
- `spawned sidecar pid=N`
- `next server up on 127.0.0.1:N` (or timeout message)
- Any preflight failure, spawn failure, or panic

### 3. Pre-flight existence checks with specific errors

New `preflight_resources()` verifies each path in order and returns
a descriptive error pointing at the exact build step that failed:

- Missing `resource_dir` → "installer may be corrupted"
- Missing `node.exe` → "rerun build-windows.ps1 step [3/7]
  (fetch-windows-node.ps1)"
- Missing `start.js` → "rerun build-windows.ps1 step [6/7]
  (copy-standalone-to-resources.ps1)"
- Missing `server.js` → ".next/standalone was not copied correctly"

Any failure both logs and shows a MessageBox.

### 4. Native Windows MessageBox on startup failure

Direct FFI to `user32.MessageBoxW` (no new crate dependency):

```rust
#[link(name = "user32")]
extern "system" { fn MessageBoxW(...) -> i32; }
```

Non-Windows targets get a no-op stub so Linux validation builds
still compile.

Every failure path in `setup()` now calls `show_error_dialog(...)`
with:
- The specific error message
- The absolute path to `startup.log`

So instead of an instant flash-and-die, Maurice sees:
> **MashupForge — sidecar failed to start**
>
> failed to spawn node sidecar at C:\…\node.exe: The system cannot
> find the file specified. (os error 2)
>
> Check C:\Users\Maurice\AppData\Roaming\com.4nevercompany.mashupforge\logs\startup.log for details.

### 5. Panic hook writes to startup.log

```rust
std::panic::set_hook(Box::new(move |info| {
    startup_log_line(&log_dir, &format!("PANIC at {}: {}", loc, payload));
    default_hook(info);
}));
```

Installed BEFORE any fallible work in `setup()`, so any Rust panic
from path resolution, network binding, or the Tauri runtime itself
leaves a breadcrumb in `startup.log`.

### 6. Sidecar stdout/stderr piped to `sidecar.log`

```rust
let sidecar_log_file = File::create(log_dir.join("sidecar.log"))?;
let sidecar_log_file_err = sidecar_log_file.try_clone()?;
cmd.stdout(Stdio::from(sidecar_log_file))
   .stderr(Stdio::from(sidecar_log_file_err));
```

Every `console.log` / `console.error` from start.js, server.js,
Next.js runtime, and anything the Next process calls now lands in
a plain file Maurice can open with Notepad. This is what exposes
`EADDRINUSE`, `require()` errors, sharp-native-binding load
failures, and Next.js startup errors.

### 7. Extra env vars for the sidecar

Added explicit environment wiring:
- `HOST=127.0.0.1` (belt-and-braces — tauri-server-wrapper.js
  already pins this, but forcing it at spawn time means even a
  broken wrapper can't escape loopback)
- `NODE_ENV=production` (server.js sets it too, but earlier is
  safer in case any side-effectful import reads it first)
- `MASHUPFORGE_LOG_DIR` (passes the log path down so the Next
  API routes can write into the same dir rather than inventing
  their own)

### 8. Timeout bump: 30s → 60s

On first run out of a freshly installed Program Files location,
Windows Defender inspects every `.js` file the Node process
requires. Next.js standalone starts by requiring a few thousand
files from `node_modules`. On lower-end hardware the real-time AV
scan pushes first-response past 30s. 60s is a safer budget; the
user sees the loading screen the whole time instead of an
unexplained timeout.

### 9. Non-destructive timeout behavior

Old code logged the timeout and did nothing. New code keeps the
loading screen visible (no `window.close()`, no exit) so Maurice
can read logs in another terminal rather than racing to capture a
window that vanishes. The failure is already logged; the user
isn't left wondering whether the app ran at all.

## Build verification

```
$ cd src-tauri && cargo check --offline
    Checking app v0.1.0
    Finished `dev` profile ... in 1.74s
```

Compiles clean with the existing `tauri-plugin-log = "2"` dep
already in `Cargo.toml`. No new Cargo dependencies added.

## What the next Maurice test pass will tell us

When Maurice installs the new `.msi` and it still crashes (it
might — this PR is observability, not a guessed cure), he will
see one of three outcomes:

### Outcome A: MessageBox on launch
The launcher caught a pre-flight failure. The dialog text names
the specific missing resource. Likely causes:
- `node.exe` not bundled → build pipeline regression
- `start.js` not in resources → `copy-standalone-to-resources.ps1`
  failed or was skipped
- Installer got truncated during download → reinstall

### Outcome B: Window shows loading screen, never advances
Rust launcher is fine; sidecar spawn succeeded; Next.js isn't
coming up. Contents of `sidecar.log` will contain the Node error
directly. Most plausible:
- `EADDRINUSE` on the ephemeral port (WSL2 port-forward interacting
  with tcp port 0 pick) — if we see this we swap to `1024+rand`
  selection
- `Error: Cannot find module './server.js'` → copy script bug
- Sharp native binding load error → Windows build pulled the
  wrong binary (would match STORY-070 root cause on a Windows
  build pathway, which would be surprising but possible)
- `@next/swc-*` missing → Next.js complaining about wasm fallback
- pi.dev module resolution crash in a top-level route import
  (STORY-081 is the right place to follow up on that)

### Outcome C: Window shows main app, all features work
Observability fixed a race condition by accident (slower logging
= different timing). Keep the changes — the next crash is
diagnosable anyway.

## What Maurice needs to do next

1. Wait for the CI run triggered by this push to finish (~22 min).
2. Download the new `.msi` from the workflow run's
   `mashupforge-windows-msi` artifact.
3. Uninstall the previous MashupForge if it's still registered
   (Settings → Apps).
4. Install the new `.msi`.
5. Launch it.
6. If it still fails:
   - Note whether a MessageBox appeared (Outcome A vs B vs C)
   - Copy the contents of
     `%APPDATA%\com.4nevercompany.mashupforge\logs\startup.log`
   - Copy the first 100 lines of
     `%APPDATA%\com.4nevercompany.mashupforge\logs\sidecar.log`
   - Paste both into `docs/bmad/reviews/STORY-080-failure.md` and
     re-dispatch the developer autoloop

## Scope boundary

- **Not touched:** `scripts/copy-standalone-to-resources.ps1`,
  `build-windows.ps1`, `fetch-windows-node.ps1`, `tauri.conf.json`,
  `tauri-server-wrapper.js`. If the crash is in one of those, the
  logs will name it and a follow-up story will fix it with
  certainty instead of a guess.
- **Not touched:** STORY-081 (pi.dev desktop test) — that stays
  blocked on Maurice's manual pass.
- **Not touched:** portable build. STORY-070 already fixed it.

## Handoff

- Commit touches only `src-tauri/src/lib.rs`
- `cargo check` clean on Linux (cross-platform code paths
  gated with `#[cfg(target_os = "windows")]`)
- CI run on `windows-latest` will be the first real cross-platform
  validation — if the new FFI import breaks there, the PR falls
  back to removing the MessageBox half and logging only
- Review artifact (this file) committed alongside
- FIFO envelope pushed as `done` + ambient `question` pointing
  Maurice at his next diagnostic action
