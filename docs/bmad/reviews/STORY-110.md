# STORY-110 Review — Defensive resource-path resolution + boot-time tree dump

**Status:** SHIPPED — awaiting CI build + Maurice retest
**Agent:** Developer
**Date:** 2026-04-15
**Classification:** routine (human-directed from Maurice)

## What Maurice observed

STORY-080's observability layer fired exactly as designed: on launch,
the new `.msi` showed a native MessageBoxW:

> **MashupForge — missing resource**
> bundled Node.js missing at
> `C:\Program Files\MashupForge\node\node.exe`

So the `.msi` installs, the Rust launcher runs, the pre-flight check
catches the missing binary, the dialog fires, and `startup.log` records
the failure. STORY-080 did its job — a previously silent crash is now
a one-line diagnosis.

## Root cause

The launcher was looking at the wrong layout. Tauri v2's
`"resources": ["resources/**/*"]` glob bundles files such that the
runtime path is **not** guaranteed to be `resource_dir/<name>` —
depending on the Tauri version and glob form, it can land either at
`resource_dir/node/node.exe` (flat, prefix stripped) or at
`resource_dir/resources/node/node.exe` (prefix preserved).

`src/lib.rs` was hardcoded to the flat layout:
```rust
resource_dir.join("node").join("node.exe")
```

If Tauri's bundler preserved the `resources/` segment, the file is
present on disk but lib.rs looks in the wrong place. The MessageBox
truthfully reports "missing at `.../node/node.exe`" because that
specific path is empty — but `.../resources/node/node.exe` may still
be populated.

## Fix

Rather than guess which layout Tauri produces (my memory of v2 glob
semantics is not definitive), land a defensive resolver that works
against both layouts and emits an authoritative record of the real
layout on every boot.

### Three changes in `src-tauri/src/lib.rs`

**1. `find_resource_subdir(resource_dir, name)` — new helper**

Checks `resource_dir/<name>` first, then `resource_dir/resources/<name>`.
Returns the first match. Both layouts are now supported; the code
no longer cares which one Tauri v2 chose.

**2. `log_dir_tree(log_dir, root, label, max_depth)` — new helper**

Recursively walks a directory up to `max_depth` levels and appends
every entry to `startup.log`. Called once at boot against
`resource_dir`. Cost: microseconds for a few hundred entries. Value:
the next crash report has an authoritative record of what the
installer actually shipped, so we never have to guess again.

**3. `setup()` flow — rewritten path resolution**

- Dumps the `resource_dir` tree to `startup.log` (max 2 levels)
- Resolves `node_root` and `app_dir` via `find_resource_subdir`
- If either is missing under BOTH layouts, the MessageBox now says
  "checked `/node` and `/resources/node`" so the error is unambiguous
- `node_binary_path(node_root)` takes the resolved root and appends
  the platform-specific binary name
- Pre-flight check runs against the resolved paths

`src-tauri/tauri.conf.json` resources field is unchanged
(`["resources/**/*"]`). I briefly tried the map form and
per-subdir explicit globs, but both forms hard-error at Tauri's
`cargo check` when the staging dirs don't exist locally (they're
gitignored, populated only by `build-windows.ps1` at CI time).
The single-glob form is the only one that survives dev-side
compilation.

### `cargo check --offline` status

Clean. No new warnings.

## Why this is the right shape of fix

1. **Works regardless of Tauri's actual behavior.** If my guess is
   right (prefix preserved), the new code finds the files. If it's
   wrong (prefix stripped — i.e. the old flat layout worked before
   something changed), the new code still finds the files. Zero risk
   of regressing a layout that previously worked.

2. **Leaves evidence.** `log_dir_tree` writes the full 2-level
   layout to `startup.log` on EVERY boot. The next Maurice report —
   crash or no crash — can paste that section and we know
   definitively where Tauri v2 places globbed resources. At that
   point we can clean up `find_resource_subdir` to the single
   correct layout.

3. **No build-script changes.** `build-windows.ps1` keeps staging at
   `src-tauri/resources/node/` and `src-tauri/resources/app/`. CI
   workflow unchanged. The only touched files are `lib.rs` and this
   artifact.

4. **Diagnostic error messages.** If a file is truly missing, the
   dialog now says "checked `/node` and `/resources/node`" rather
   than pointing at one hardcoded path, saving another round trip.

## What happens next

1. **Push triggers CI** → new `.msi` in ~22 minutes
2. **Maurice installs** → launcher runs, dumps tree to `startup.log`,
   resolves either flat or nested node_root, spawns sidecar
3. **Three possible outcomes:**
   - **App boots clean** → STORY-110 `[x]`, STORY-100 unblocks.
     Grab the `startup.log` tree dump to settle the layout question
     permanently.
   - **MessageBox fires with "checked /node and /resources/node"** →
     files genuinely aren't in the bundle. That would mean
     `build-windows.ps1` steps 3 + 6 ran in CI but the tauri
     bundler silently skipped the glob match. Next fix would be
     the explicit map form + adding the dir-exists assertion to
     the build scripts BEFORE `tauri build` runs.
   - **Different MessageBox** → panic hook + startup.log tell us
     where. Loop through autoloop again.

## Files touched

- `src-tauri/src/lib.rs` — +80 LOC, −10 LOC (defensive resolver,
  tree dump, rewritten setup path resolution)
- `docs/bmad/reviews/STORY-110.md` — this artifact

## Exit criteria

Maurice's next `.msi` install reaches the Next.js sidecar (app boots
to UI, OR sidecar fails later in the boot chain — anything past the
preflight check counts as STORY-110 done). If the MessageBox fires
again with the new error text, that's a genuine missing-in-bundle
problem and we pivot to fixing the build script / tauri config.
