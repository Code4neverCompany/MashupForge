# STORY-091: Pipeline Automation Verification — Review Artifact

**Date:** 2026-04-15  
**Auditor:** Developer (auto-loop, review-only pass — Option A from PROP-007)  
**Scope:** Static code audit of the full idea → image → gallery → schedule → post pipeline  
**Method:** Code reading only, no live API calls, no code changes  

---

## State Flow

```
IDEA (usePipeline.ts)
  updateIdeaStatus('in-work')
  ↓ expandIdeaToPrompt()          lib/aiClient.ts → pi.dev
  ↓ generateComparison()          hooks/useImageGeneration.ts
  ↓ poll imagesRef until ready    (90 × 3s = 4.5 min timeout)

IMAGE (useImageGeneration.ts)
  GeneratedImage.status: 'generating' → 'ready'
  url: Leonardo CDN URL
  ↓ [if autoCaption] generatePostContent()   hooks/useSocial.ts → pi.dev
  ↓ saveImage()

SCHEDULING (usePipeline.ts:414-450)
  findBestSlot() → date/time
  ScheduledPost { status: 'pending_approval', imageId, date, time, platforms }
  persisted to UserSettings.scheduledPosts via updateSettings()

APPROVAL (MashupContext.tsx:160-186)
  approveScheduledPost(postId) → pending_approval → scheduled
  rejectScheduledPost(postId)  → removes from array

AUTO-POST
  ⚠️ No scheduled post executor exists — see Critical #1 below
```

---

## Hand-off Gates

| Gate | File:line | Status | Notes |
|------|-----------|--------|-------|
| Idea → in-work status | usePipeline.ts:221 | ✓ | Explicit updateIdeaStatus before async work |
| Prompt expansion | usePipeline.ts:256 | ✓ | Falls back to idea.concept if LLM fails |
| Image generation start | usePipeline.ts:262 | ✓ | Guards allModelIds.length > 0 |
| Image ready poll | usePipeline.ts:283-302 | ⚠️ | 4.5 min timeout; proceeds even with 0 images |
| Caption generation | usePipeline.ts:396-410 | ⚠️ | Silent skip if generatePostContent returns undefined |
| Scheduling | usePipeline.ts:414-450 | ✓ | autoSchedule flag + platform check + smart slot |
| Approval → scheduled | MashupContext.tsx:160 | ✓ | Functional updater, race-safe |
| **Scheduled → posted** | **missing** | **✗** | **No executor fires posts at scheduled time** |

---

## Findings

### ~~CRITICAL-1~~: ✓ RESOLVED — Scheduled post executor exists

**Updated 2026-04-15 (follow-up verification):** The auto-post executor IS fully
implemented at `components/MainContent.tsx:1044-1183`. A `setInterval` runs every 60s,
scans `scheduledPosts` for items with `status === 'scheduled'` past their scheduled
time, calls `/api/social/post`, and updates status to `'posted'` / `'failed'` via
functional `updateSettings` to prevent race conditions. Carousel groups are fanned out
correctly (all member posts share the first post's platforms and get posted in one call
with `mediaUrls[]`). Finding retracted.

---

### ~~CRITICAL-2~~: ✓ RESOLVED — Image timeout already skips scheduling

**Updated 2026-04-15 (follow-up verification):** When `readyImages.length === 0` at
`usePipeline.ts:300`, the code enters the `if` block (logs error), then falls through
the entire if-else-if-else chain without touching the carousel or single-image scheduling
branches. Only `updateIdeaStatus(idea.id, 'done')` is called — no scheduling, no empty
posts. Finding retracted.

---

### MEDIUM-1: Caption silently skipped on pi failure

**File:** usePipeline.ts:403-410  
If `generatePostContent()` throws or returns undefined, `captionedImg` stays as the
raw image (no `postCaption`). The post gets scheduled with an empty caption string.
No retry, no user-visible error.

---

### MEDIUM-2: Trending error logged as 'success'

**File:** usePipeline.ts:249  
```ts
addLog('trending', idea.id, 'success', `Trending research skipped: ${getErrorMessage(e)}`);
```
Should be `'error'`.

---

### MEDIUM-3: Pi never explicitly started before captioning

**File:** usePipeline.ts (no call to `/api/pi/status` or `/api/pi/start`)  
Pipeline calls `generatePostContent()` which calls `streamAIToString()` which hits pi.
If pi isn't running, captions silently fail. Pipeline should call `/api/pi/status` once
at startup and warn if not ready, or call the install/start flow automatically.

---

### LOW-1: autoPost in-pipeline does not update ScheduledPost.status

**File:** usePipeline.ts:455-480  
The in-pipeline immediate auto-post path (`settings.pipelineAutoPost === true`) calls
`/api/social/post` but never updates the ScheduledPost.status to `'posted'`. The post
stays in `'pending_approval'` in the calendar view.

---

## Pipeline Stage Toggles

| Toggle | Default | Effect |
|--------|---------|--------|
| pipelineAutoTag | true | ✓ Working |
| pipelineAutoCaption | true | ✓ Working (pi required) |
| pipelineAutoSchedule | true | ✓ Working (smart slot) |
| pipelineAutoPost | false | ⚠️ Partial — immediate only, not at scheduled time |

---

## Continuous Daemon (usePipeline.ts:695-717)

✓ Well implemented. Polls future post count vs. `pipelineTargetDays`, auto-generates
ideas when queue is empty, sleeps in 2s slices so stop requests are honored quickly.
No infinite-loop risk observed.

---

## Carousel Handling

- ✓ carouselGroupId created and stored in `UserSettings.carouselGroups`
- ✓ All images saved to gallery before scheduling
- ✓ Caption shared from first image
- ✗ No auto-post executor for carousel fan-out (same as CRITICAL-1)

---

## Pi.dev Integration

- ✓ `/api/pi/install`, `/api/pi/start`, `/api/pi/status`, `/api/pi/stop` routes exist
- ✓ `lib/pi-setup.ts` resolves the binary via `MASHUPFORGE_PI_DIR` in desktop mode
- ⚠️ Pipeline never calls start/status before using pi — assumes it is already running
- ⚠️ If pi crashes mid-run, captions silently produce empty strings

---

## Recommended Stories (in priority order)

1. **[CRITICAL]** Implement scheduled post executor — poll scheduledPosts, fire at time, update status
2. **[CRITICAL]** Guard image-timeout path — `status: 'failed'` + return if `readyImages.length === 0`
3. **[MEDIUM]** Auto-start / status-check pi.dev at pipeline start
4. **[MEDIUM]** Fix caption-error handling — retry once, then schedule with placeholder
5. **[LOW]** Fix trending 'success' log on error
6. **[LOW]** Update ScheduledPost.status after in-pipeline auto-post
