# QA Batch Review — UX/Reliability/Logging Polish (2026-04-16)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commits:** aa1f68e, 6d7777e, 614e8ec, 9621c4b, 2a22291, abf1d8b, 714fbd6,
             4998a4a, 641c734, d3ea43e, ae292ed, 4ad58e4, b77119e

---

## aa1f68e — AUDIT-046: clipboard failure catch in ImageDetailModal

- [INFO] `navigator.clipboard.writeText()` now has `.catch()` — previously a
  failed clipboard write (HTTPS-only, permissions-denied) was an unhandled
  rejection. Correct minimal fix. ✓
- [INFO] Single-line change, no logic impact on the happy path. ✓

---

## 6d7777e — POLISH-016: pipeline log cap at 50 entries

- [INFO] `pipelineLog.slice(-50)` applied at both append sites (line 148, 158)
  in `hooks/usePipeline.ts`. No unbounded array growth. ✓
- [INFO] Already noted as FIXED in AUDIT-011 performance audit. ✓

---

## 614e8ec — VERIFY-003: `resolveInstagramCredentials()` helper

- [INFO] Extracts the env-first credential resolution pattern from
  `app/api/social/post/route.ts` into `lib/instagram-credentials.ts` as a
  pure testable function. ✓
- [INFO] 75 vitest tests covering: env wins, body fallback, empty string falls
  through, undefined handling, both fields required. Comprehensive. ✓
- [INFO] All callers updated. No behavior change — pure refactor. ✓

---

## 9621c4b — UX-001: Approve All button always visible in ApprovalQueue header

- [INFO] "Approve All" moved from conditional render to always-visible in
  the header, disabled when queue is empty. Prevents users from not knowing
  the feature exists. ✓
- [INFO] 25 insertions / 29 deletions — net reduction confirms this is a
  restructure, not feature creep. ✓

---

## 2a22291 — AUDIT-048: fetch timeouts + remaining aria-labels

- [INFO] SSRF-adjacent hardening: `AbortSignal.timeout(N)` added to several
  outbound fetch calls that previously had no timeout. Prevents hanging
  connections from blocking the Node.js event loop indefinitely. ✓
- [INFO] aria-labels added to `SmartScheduleModal` and `MainContent` action
  buttons missing them. ✓
- [INFO] This is the precursor batch to AUDIT-050 and specific targeted fixes.
  Together they reduce the a11y and reliability debt. ✓

---

## abf1d8b — LOG-001: suppress redundant server-side log noise

- [INFO] Removes unnecessary console calls from `lib/pi-setup.ts` and
  `scripts/tauri-server-wrapper.js`. Server-side log cleanup, no behavior
  change. ✓
- [INFO] 7 file changes, 17 lines deleted — all console log removals. ✓

---

## 714fbd6 — LOG-002: errors-only filter toggle for pipeline log

- [INFO] New toggle button in PipelinePanel that filters the pipeline log to
  show only error/warn entries. 22 insertions, 5 deletions. ✓
- [INFO] Filter is UI-only — no mutation to log state. ✓
- [INFO] Compatible with POLISH-016's 50-entry cap (filters the display
  of the capped array, not the underlying source). ✓

---

## 4998a4a — UI-001: aria-label + aria-busy on BestTimesWidget

- [INFO] `aria-label="Analyze engagement"` and `aria-busy={isLoading}`
  added to the Analyze button. Correct ARIA usage — `aria-busy` is the
  right attribute for an async-loading trigger. ✓
- [INFO] Single file, 2 insertions. ✓

---

## 641c734 — API-001: 30s fetch timeout on Leonardo video route

- [INFO] `AbortSignal.timeout(30000)` added to `app/api/leonardo-video/route.ts`.
  Previously had no timeout — a hung video generation request would block the
  Next.js route handler indefinitely. ✓
- [INFO] 30s is appropriate for a video generation API call. ✓

---

## d3ea43e — UX-002: onError fallback in ApprovalQueue image cards

- [INFO] `<img>` element now has `onError` callback. When a broken image URL
  fails to load, the card degrades gracefully instead of showing a broken image
  icon. ✓
- [INFO] Single line (+1 insertion). ✓

---

## ae292ed — NAV-001 + POLISH-019: log step labels + credential show/hide

- [INFO] Pipeline log steps now show human-readable labels instead of raw
  stage keys. UX improvement, no logic change. ✓
- [INFO] Credential fields in SettingsModal now have eye toggle to show/hide
  values (POLISH-019). Consistent with DesktopSettingsPanel behavior. ✓
- [INFO] 84 insertions, 22 deletions. Size is consistent with a SettingsModal
  input group restructure. ✓

---

## 4ad58e4 — UX-003/UX-004: copy-to-clipboard on credential fields

- [INFO] Copy icon added inside credential input fields (Leonardo key, IG
  token, Pinterest token). Shows only when field has a value — empty fields
  stay clean. ✓
- [INFO] `navigator.clipboard.writeText()` with `.then(success, error)` dual
  handler — failure is surfaced via toast rather than silently dropped. ✓
  (Correct pattern — no unhandled rejection. Consistent with AUDIT-046 fix.)

---

## b77119e — AUDIT-050: type=button + aria-labels

- [INFO] `type="button"` added to interactive elements in Sidebar.tsx and
  SmartScheduleModal.tsx that were missing it. Prevents accidental form
  submission inside `<form>` contexts. ✓
- [INFO] aria-labels added to icon-only buttons. ✓
- [INFO] 5 files, 8 insertions — mechanical a11y fix. ✓

---

## Gate Decision

PASS — All 13 commits are targeted, correct, and minimal-scope. No new
security surface beyond what was flagged in QA-IG-POSTING-FIX. Fetch timeouts
(2a22291, 641c734) are reliability improvements already noted as necessary in
AUDIT-010. Accessibility fixes (b77119e, 4998a4a, 2a22291) reduce a11y debt.
Logging and UX polish items are correct and non-breaking.
