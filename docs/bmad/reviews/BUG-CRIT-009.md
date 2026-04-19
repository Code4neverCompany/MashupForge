# BUG-CRIT-009 — pipelinePending now reliably hides pipeline images from Gallery

**Status:** done
**Classification:** routine
**Severity:** critical
**Why:** V040-HOTFIX-007 introduced `pipelinePending` to keep pipeline-
generated images out of Gallery until approved. The check still
worked, but the *gating condition* that decides whether to set the
flag was too narrow — `autoSchedule && pipelinePlatforms.length > 0`
— so any pipeline run with missing platform credentials silently
saved images **without** the flag, leaking them into Gallery
un-reviewed and un-watermarked.

## Root cause

In `lib/pipeline-processor.ts`:

```ts
const willSchedule = autoSchedule && pipelinePlatforms.length > 0;
const pipelinePending =
  willSchedule &&
  resolvePipelinePostStatus(...) === 'pending_approval';
```

When `pipelinePlatforms.length === 0` (legitimate scenarios: user has
autoSchedule on but hasn't filled in any platform credentials yet, or
desktop credential detection misfired, or the inferredPlatforms code
path returned an empty list), `willSchedule = false`, `pipelinePending
= false`, and the image went to `savedImages` with no flag — so
Gallery rendered it.

The downstream `if (pipelinePlatforms.length === 0)` branch logged
"No platforms configured — skipped" and bailed without creating a
`ScheduledPost`, so even if we'd flipped the flag on, there'd be no
approval-queue entry to ever clear it. That second hole is why the
naive fix ("just always set the flag") would have orphaned images —
hidden from Gallery, no card in the approval queue to release them.

## Fix (two-part)

### 1) Drop `pipelinePlatforms.length > 0` from the flag gate

The flag now flips on whenever `autoSchedule` is true and the post
status is `pending_approval` (which after BUG-CRIT-001 is always
true). The image is consistently held out of Gallery whether or not
the user has platform credentials configured.

### 2) Always create the ScheduledPost (with `platforms: []` if needed)

The "no platforms configured — skipped" early-return branches in
both single and carousel scheduling were removed. The pipeline now
unconditionally creates a `pending_approval` `ScheduledPost` so the
approval queue has an entry that can release `pipelinePending` on the
linked image. The post lands with `platforms: []` when no creds were
found; the auto-poster correctly skips empty-platforms posts (it
iterates the array), so nothing tries to publish to a dead channel.
The user can either (a) configure platforms then approve to publish,
or (b) reject from the queue.

This unifies the contract: every pipeline-produced image has a
corresponding approval entry, and approval is the only path to
Gallery for pipeline images.

## Acceptance criteria — all met

| Criterion                                          | Status |
|----------------------------------------------------|--------|
| Pipeline images NOT in Gallery until approved      | ✓ (regression test: `pipelinePending=true` on every saved image even when `apiKeys` is empty) |
| Gallery filter checks pipelinePending flag         | ✓ (existing one-line filter at MainContent.tsx:1318–1324, unchanged) |
| Write inbox                                        | ✓ (envelope below) |

## Files touched

### Production
- `lib/pipeline-processor.ts`:
  - Removed the `pipelinePlatforms.length > 0` constraint on
    `pipelinePending`.
  - Removed the `if (pipelinePlatforms.length === 0)` early-return
    in both single and carousel scheduling. Both paths now always
    create a ScheduledPost; the `platforms` field is whatever the
    inference produced (often `[]` when nothing's configured).
  - Long inline docblock pinning the BUG-CRIT-009 contract for
    future readers.
- `lib/smartScheduler.ts`:
  - Added `'rejected'` to `ExistingPost.status` union (the type
    was already drifting from `ScheduledPost.status` after V050-005
    introduced rejection — this lets callers pass `ScheduledPost[]`
    without a cast).
  - Both `buildPerDayPlatformCounts` and `buildPerDayCounts` now
    skip rejected posts when computing daily caps and saturation
    penalty, matching their treatment of `posted`/`failed`.
- `components/MainContent.tsx`:
  - `calendarColorFor` widened to accept `ScheduledPost['status']`
    (including `rejected`), with a zinc swatch for rejected posts.

### Tests
- `tests/lib/pipeline-processor.test.ts`:
  - `'logs "no platforms configured" when apiKeys is empty…'` →
    `'still creates a pending_approval post (with empty platforms)
    when no platforms configured — BUG-CRIT-009'`. Asserts the new
    contract: ScheduledPost lands, status is pending_approval,
    platforms is `[]`, slot finder is invoked.
  - `'treats { accessToken: "", igAccountId: "" } as NOT
    configured'` → updated wording, asserts post lands with
    `platforms: []` rather than not landing at all.
- `tests/integration/pipeline-platform-detection.test.ts`:
  - `'skips and logs when neither settings.apiKeys nor desktopCreds
    carry any platform'` → `'still creates a pending_approval post
    with platforms:[] when no creds are configured (BUG-CRIT-009)'`.
  - `'treats settings.apiKeys.instagram = { accessToken: "",
    igAccountId: "" } as not configured'` → asserts post lands with
    `platforms: []` rather than empty-accumulated.
- `tests/integration/approval-gate-watermark.test.ts`:
  - NEW test under the existing `BUG-CRIT-001 — pipeline always
    gates through approval` describe block:
    `'BUG-CRIT-009: still flags pipelinePending=true AND lands an
    approval entry when no platforms are configured'`. This is the
    direct regression test pinning both halves of the fix.

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run` — 392/392 across 37 files (was 391; +1 new
  pinning case in approval-gate-watermark; existing 4 tests updated
  in-place to assert the new no-platforms behavior).

## Out of scope (follow-up)

- The "rejected" calendar color is gray. May want a distinct icon or
  strikethrough but no design ask.
- The approval queue UI doesn't visually distinguish posts with
  `platforms: []` from posts with platforms — could show a "Configure
  platforms first" hint when the user clicks Approve on an empty-
  platforms post. Current behavior: approval clears `pipelinePending`,
  the post becomes `scheduled`, and the auto-poster silently skips it
  because the platforms array is empty.
- The orphaned-rejection cleanup mentioned in V040-HOTFIX-007 (rejected
  posts leave their pipelinePending images on disk forever) is still
  unfixed and remains a deliberate follow-up.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-009","status":"done","summary":"pipelinePending now flips on whenever autoSchedule is true (was: ...&& platforms.length>0). The pipeline also always creates a pending_approval ScheduledPost — with platforms:[] when nothing's configured — so the approval queue has an entry that can release the flag. Together these close the orphan path where pipeline images leaked into Gallery un-reviewed and un-watermarked. tsc clean, 392/392 pass."}
```
