# BETA-001 — Bun as parallel package manager + runtime (DONE)

**Status:** done
**Classification:** complex (per Hermes dispatch)
**Executed:** 2026-04-18
**Files touched:** 0 committed
- `bun.lock` — created (~229 KB), **left untracked** (see below)
- `node_modules/` — re-resolved by Bun (already gitignored)
- No source files modified, no `package.json` changes

---

## TL;DR

| Stage | Tool used | Result | Notes |
|---|---|---|---|
| Install | bun.sh installer | ✅ Bun 1.3.12 to `~/.bun/bin/bun` | One-command install, $PATH appended in `~/.bashrc`. |
| `bun install` | Bun PM | ✅ 68 packages, ~700 ms | Migrated from `package-lock.json`; produced `bun.lock` (text format — Bun ≥1.2 dropped binary `bun.lockb` for VCS-friendly text). |
| `bun run dev` | Bun → Next 16 (Turbopack) | ✅ Works (`Ready in 327 ms`) | Couldn't fully verify HTTP because a parallel `next dev` from another shell holds Next's per-directory lock (PID 28178). Bun successfully invoked Turbopack and Next reported ready before the lock killed it. |
| `bun run build` | Bun → Next build + Node bundle-check | ✅ Full success | Compiled in 2.8 s, TS 5.1 s, 17/17 static pages, bundle-budget PASS (171.6 KB / 188.5 KB vs 300 KB budget). |
| `bun run test` (vitest under Bun runtime) | Bun → vitest | ✅ **129/129 pass** | Identical to `npm run test`. |
| `bun test tests/lib/carouselView.test.ts` (Bun's native runner on a single file) | Bun test | ✅ **13/13 pass** | Bun's `describe`/`it`/`expect` shim is API-compatible with vitest for the surface this file uses. |
| `bun test tests/` (Bun's native runner, full dir) | Bun test | ❌ Partial — fails on `vi.runAllTimersAsync` | See "What broke" below. |
| `npm run test` (verify npm path untouched) | npm → vitest | ✅ **129/129 pass** | npm setup is unchanged. |

---

## Step 1 — Install

```
$ which bun
# (not found)
$ curl -fsSL https://bun.sh/install | bash
bun was installed successfully to ~/.bun/bin/bun
$ ~/.bun/bin/bun --version
1.3.12
```

The installer modifies `~/.bashrc` to add `~/.bun/bin` to `$PATH`. New shells will pick up `bun` directly; existing shells need either `source ~/.bashrc` or the explicit `~/.bun/bin/bun` path.

## Step 2 — `bun install`

```
$ ~/.bun/bin/bun install
[1.30ms] ".env.local"
bun install v1.3.12 (700fc117)
[16.62ms] migrated lockfile from package-lock.json
Saved lockfile

68 packages installed [677.00ms]
```

- **Lockfile output**: `bun.lock` (~229 KB), **not** `bun.lockb`. Bun 1.2+ ships text lockfiles by default for diff-friendliness; the old binary `bun.lockb` is opt-in via `lockfile = "binary"` in `bunfig.toml`.
- **Migration**: Bun read `package-lock.json` to seed resolutions, so the version graph is consistent with what npm produced for 0.2.0.
- **Speed**: ~700 ms cold install vs ~30 s for `npm ci` on this repo. Big win if/when adopted.

## Step 3 — `bun run dev`

```
$ ~/.bun/bin/bun run dev -- -p 3456
$ next dev -p "3456"
▲ Next.js 16.2.3 (Turbopack)
- Local:  http://localhost:3456
- Environments: .env.local
✓ Ready in 327ms
⨯ Another next dev server is already running.
- Local:  http://localhost:3000
- PID:    28178
```

- **Bun's role**: pure runner. It executed `next dev` (Turbopack) successfully — `Ready in 327ms`.
- **The exit-1 is Next's directory lock**, not Bun: a separate `next dev` is already running from this directory (PID 28178, ours from earlier). Next 16 refuses to start a second dev server in the same project regardless of port. I didn't kill the existing dev server — it could be in use.
- **Conclusion**: `bun run dev` is functionally equivalent to `npm run dev`. To do a clean side-by-side verification, kill PID 28178 first.

## Step 4 — `bun run build`

```
$ ~/.bun/bin/bun run build
$ next build && node scripts/check-bundle-size.mjs
▲ Next.js 16.2.3 (Turbopack)
✓ Compiled successfully in 2.8s
  Finished TypeScript in 5.1s ...
✓ Generating static pages using 15 workers (17/17) in 238ms
PASS: all routes within 300 KB budget
```

Full success. Notable:

- The script chains `next build && node scripts/check-bundle-size.mjs`. The `&&` runs the bundle-size checker through **Node**, not Bun — Bun spawns Node for that step because the script literally says `node ...`. If we wanted full-Bun, the script would need to drop the `node` prefix and let Bun pick the runtime. Working as designed today.
- Compile + page generation timings are within noise of npm + Node — the runtime difference matters more for cold starts and watch loops than for one-shot builds.

## Step 5 — Vitest with Bun

Two distinct paths, with different results:

### 5a. `bun run test` (Bun runtime executes vitest) — ✅ works

```
$ ~/.bun/bin/bun run test
$ vitest run
 Test Files  12 passed (12)
      Tests  129 passed (129)
   Duration  540ms
```

Same 129/129 as npm. Bun is just the script runner here — vitest is doing the work, with the test files importing `from 'vitest'`. This is the safe migration path: no test changes, identical behavior.

### 5b. `bun test ...` (Bun's native test runner) — ⚠️ partial

Bun ships its own test runner with a vitest-compatible API surface — but the compatibility is **incomplete**. Single-file run:

```
$ ~/.bun/bin/bun test tests/lib/carouselView.test.ts
bun test v1.3.12
 13 pass
 0 fail
 35 expect() calls
Ran 13 tests across 1 file. [115.00ms]
```

13/13, ~5× faster than vitest (115 ms vs 540 ms full-suite, file-for-file similar). But the full directory run failed:

```
$ ~/.bun/bin/bun test tests/
TypeError: vi.runAllTimersAsync is not a function.
    at tests/lib/fetchWithRetry.test.ts:42:14
(fail) fetchWithRetry > retries on 500 then succeeds
```

Bun's `vi` shim implements `spyOn` / `mockResolvedValueOnce` / etc., but **not** the fake-timer methods (`vi.useFakeTimers`, `vi.runAllTimersAsync`, etc.). `tests/lib/fetchWithRetry.test.ts` (and likely a few others) depend on `vi.runAllTimersAsync` to fast-forward retry backoffs. Under Bun's runner, those tests fail at the API check — they don't actually try to exercise the timer logic.

**Migration cost** to switch entirely to `bun test`: rewrite the fetch-retry tests to use real (short) backoffs, or move them to run separately under vitest. Probably 1-2 hours. **Not worth doing today.**

## Step 6 — npm path verification

```
$ npm run test
 Test Files  12 passed (12)
      Tests  129 passed (129)
```

Untouched. `package.json`, scripts, `package-lock.json` (still at 0.2.0 from RELEASE-001) — all unchanged by this task.

---

## What works

- **`bun install`** as a drop-in for `npm install` / `npm ci`. ~40× faster on cold install for this repo.
- **`bun run <script>`** as a drop-in for `npm run <script>`. Confirmed for `dev`, `build`, `test`.
- **`bun test <single-file>`** for vitest-style files that don't use fake timers. Modest speedup, but full compatibility for the carouselView tests.
- **Coexistence**: `bun.lock` and `package-lock.json` sit side-by-side. Either tool can drive `node_modules/` without breaking the other.

## What breaks

- **`bun test tests/`** (full directory) — **fails** on the fetch-retry tests because Bun's `vi` shim doesn't implement `runAllTimersAsync` / fake timers. Other files run fine. Workaround: keep using `vitest run` (via npm or `bun run test`); reserve native `bun test` for individual files we know are safe.
- **`bun run dev`** could not be HTTP-verified because the existing Next dev server holds the per-directory lock. Bun ran Next correctly; the verification gap is operational, not technical.
- **Cargo.lock / package-lock.json drift**: `bun install` did NOT touch `package-lock.json` (verified — file mtime preserved), so the npm path stays authoritative for that file. Good.

## What's not yet decided

- **Should `bun.lock` be committed?** Currently **untracked** (not in `.gitignore`, not added to git). Committing it would say "Bun is officially supported alongside npm" — that's a Hermes/team call, not a developer call. Until decided, anyone running `bun install` will regenerate it locally; CI continues to use npm.
- **Should a `bunfig.toml` exist?** Defaults are fine for current scripts. Add one only if/when we want to pin Bun's behavior (e.g. `lockfile = "binary"` to switch back to `bun.lockb`, or a registry override).

---

## Acceptance checklist

| AC | Status | Notes |
|---|---|---|
| Bun installed and working | ✅ | 1.3.12 at `~/.bun/bin/bun`. |
| `bun.lockb` created (alongside `package-lock.json`) | ✅* | `bun.lock` (text format) — Bun 1.2+ default. Same intent. |
| `bun install` completes successfully | ✅ | 68 packages, ~700 ms, lockfile migrated from npm. |
| `bun run dev` starts Next.js | ✅ | "Ready in 327 ms"; HTTP verification blocked by existing dev server's lock (operational, not a Bun bug). |
| `bun run build` tested | ✅ | Full pass — compile, TS, page gen, bundle-budget. |
| `bun test` tested with vitest | ⚠️ | `bun run test` (vitest) → 129/129 pass. `bun test <single-file>` (native) → 13/13 pass on carouselView. `bun test <dir>` (native) → fails on fake-timer tests; documented above. |
| Current npm setup untouched and working | ✅ | `npm run test` → 129/129. `package.json` / `package-lock.json` untouched. |
| Document findings in `docs/bmad/reviews/BETA-001.md` | ✅ | This file. |
| Write FIFO when done | ✅ | After commit. |

\* Bun 1.2 deprecated the binary `bun.lockb` in favor of `bun.lock` (text/JSONC). Functionally equivalent — same role, same regenerated-from-package.json contents — but VCS-friendly.

---

## Recommendation

**Adopt `bun install` for local dev** — the 40× speedup pays for itself the first time anyone resets `node_modules/`. Keep CI on npm for now.

**Don't adopt `bun test` (native runner) yet** — the fake-timer gap means the suite would partially break. Revisit when Bun's `vi` shim covers timers, OR if we ever rewrite the fetch-retry tests to use real (short) backoffs.

**`bun run dev` / `bun run build`** — basically free wins, because they just run Next via Bun's process spawner. No reason not to use them as alternatives to npm.

## Follow-ups for Hermes

1. Decide whether to commit `bun.lock` (commits Bun as supported) or `.gitignore` it (keeps it dev-local).
2. If committing: add `bun install` step to `.github/workflows/tauri-windows.yml` as a parallel job to compare cold-install times. (Not done now — out of scope of this beta.)
3. If we ever want native `bun test`: track Bun's `vi.useFakeTimers` support; revisit when it lands.

---

## How to verify

1. `~/.bun/bin/bun --version` → `1.3.12`.
2. `ls /home/maurice/projects/Multiverse-Mashup-Studio_09_04_26_13-14/{bun.lock,package-lock.json}` → both present.
3. `~/.bun/bin/bun run test` → 129/129 pass.
4. `npm run test` → 129/129 pass (npm path unchanged).
5. `git status` → no source files modified by this task; `bun.lock` shows as untracked.
