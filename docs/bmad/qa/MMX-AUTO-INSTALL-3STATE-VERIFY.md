# QA Review — MMX-AUTO-INSTALL-3STATE-VERIFY

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-30
**Commits:** `5e8dc4a` (auto-install) · `158970f` (W-1 + W-2 fixes)

## Files Reviewed

- `app/api/mmx/setup/route.ts` — installMmxCli() + POST handler
- `components/SettingsModal.tsx` — handleMmxCardClick + card render (~line 509-556)
- `lib/mmx-client.ts` — isAvailable() / PATH resolution
- `lib/useMmxAvailability.ts` — null-loading hook
- `lib/runtime-env.ts` — isServerless() guard

## Verify Criteria vs. Findings

| # | Criterion | Result |
|---|-----------|--------|
| A1 | Not Installed click → npm install -g mmx-cli runs before tmux | ✅ PASS |
| A2 | Install failed → HTTP 500, actionable error surfaced | ✅ PASS |
| A3 | Install success → re-check isAvailable() then launch tmux | ✅ PASS |
| B1 | Not Authenticated click → install block SKIPPED, tmux launches | ✅ PASS |
| B2 | Existing mmx-setup tmux session → returns alreadyRunning, no dupe | ✅ PASS |
| C1 | Available click → updateSettings() only, no network call to /api/mmx/setup | ✅ PASS |
| W-1 | Loading window (null) click → no-op; strict equality guard applied | ✅ PASS |
| W-2 | Card button disabled={mmxBusy} + visual classes | ✅ PASS |
| SL | Serverless guard → 503 with desktop-only error | ✅ PASS |
| TS | tsc --noEmit clean | ✅ PASS |

## Findings

### Critical (must fix before merge)
_None._

### Warnings (should fix)

- **[WARNING W-A] `spawnSync` blocks the Node.js event loop for up to 5 minutes during npm install.**
  `installMmxCli()` calls `spawnSync` with a 5-minute ceiling (route.ts:40-44). In a long-running Next.js server process this freezes every concurrent HTTP request — status probes, API calls, even browser navigation — until `npm install -g mmx-cli` completes. For a desktop-only route the user won't notice if the install is fast (~5-15 s on a warm npm cache), but on first install over a slow link the UI will appear frozen.
  
  **Acceptable tradeoff** for the declared desktop-only scope; the `isServerless()` guard ensures this never runs on Vercel. No crash risk. Recommend a follow-up to convert to `spawn` + streaming progress if the frozen-tab UX proves painful in practice.

- **[WARNING W-B] npm fallback candidates miss macOS Homebrew.**
  `installMmxCli()` tries `['npm', '/home/linuxbrew/.linuxbrew/bin/npm']` (route.ts:32-34). The linuxbrew path is Linux-specific. macOS users whose Node.js is managed by Homebrew (`/opt/homebrew/bin/npm` on Apple Silicon, `/usr/local/bin/npm` on Intel) and whose login-shell `PATH` is not inherited by the Next.js server process will receive "Could not find `npm`." The error message is actionable, so this is a UX gap, not a silent failure.
  
  **Fix:** Add `/opt/homebrew/bin/npm` and `/usr/local/bin/npm` to the candidate list on non-Windows.

### Info

- **[INFO I-1] W-1 diff is minimal and correct.**
  The exact change in 158970f:
  ```diff
  -  if (!available || !mmxStatus?.authenticated) {
  -  } else {
  +  if (available === false || mmxStatus?.authenticated === false) {
  +  } else if (available === true && mmxStatus?.authenticated === true) {
  +  // else: still loading — do nothing rather than guess.
  ```
  The "still loading" comment at line 523 makes the intent explicit and matches the brief's W-1 spec exactly.

- **[INFO I-2] Loading race window produces "Available" label but click no-op.**
  If `useMmxAvailability` resolves `true` before the `/api/mmx/status` fetch settles (`mmxStatus === null`), the card shows the emerald "Available" label (because the `else` branch fires when `authenticated !== false`), but the click handler is a no-op (neither strict condition is met). Race window is ~100–200 ms. After the status fetch settles, the card becomes fully interactive. Expected behavior per W-1 intent; no action required.

- **[INFO I-3] PATH mutation in process.env persists across requests.**
  `process.env.PATH = ${install.globalBin}:${process.env.PATH}` (route.ts:138) is process-global and intentional — it lets subsequent `spawn('mmx', …)` calls find the newly installed binary without changes to mmx-client. The comment on lines 122–124 documents this correctly.

- **[INFO I-4] `selected` branch in handleMmxCardClick is not gated by mmxBusy.**
  Line 510: `if (selected) { updateSettings(…); return; }`. Because the button is `disabled={mmxBusy}`, the browser prevents the click from firing while busy. The only way to reach this branch while `mmxBusy` is true is via programmatic invocation, which would just write the same value. Benign.

## Scope Check

- [IN-SCOPE] `installMmxCli()` auto-install in setup route — added in 5e8dc4a
- [IN-SCOPE] W-1 strict equality guard in handleMmxCardClick — fixed in 158970f
- [IN-SCOPE] W-2 `disabled={mmxBusy}` + visual classes on card button — fixed in 158970f
- [IN-SCOPE] Serverless guard unchanged — verified still correct
- [OUT-OF-SCOPE] Windows `start cmd /k` path — skipped (no Windows VM; flagged)
- [OUT-OF-SCOPE] `isAuthenticated()` env-var vs config-file auth mechanism — not changed by these commits
- [OUT-OF-SCOPE] Actual OAuth completion inside the tmux session

## Gate Decision

**[CONCERNS — 0.83]** — All ten verify criteria pass. TypeScript is clean. Both W-1 and W-2 findings from the prior review are correctly addressed with minimal, well-commented diffs. The two new warnings (event-loop block during npm install, macOS Homebrew npm gap) are acceptable tradeoffs for a declared desktop-only feature and produce actionable errors rather than silent failures. Merge acceptable as-is; W-B (macOS Homebrew) is worth a follow-up before the next macOS beta.
