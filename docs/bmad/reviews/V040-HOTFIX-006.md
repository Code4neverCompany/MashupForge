---
id: V040-HOTFIX-006
title: V040-HOTFIX-006 — Pipeline "No platforms configured — skipped" blocks scheduling
status: done
date: 2026-04-18
classification: complex
relates_to: V040-008
---

# V040-HOTFIX-006 — Expose the pipeline platform picker whenever scheduling is on

## What was wrong

In `components/PipelinePanel.tsx` the "Auto-post to" platform picker
was gated behind `{autoPost && (...)}`. But the pipeline's default
shape is `autoSchedule=true`, `autoPost=false` — and scheduling ALSO
needs `pipelinePlatforms` (every `ScheduledPost` carries a
`platforms: string[]`). Users who accepted defaults therefore:

1. Never saw the platform picker (hidden behind an off-by-default toggle),
2. Never populated `settings.pipelinePlatforms`,
3. Hit the fallback in `lib/pipeline-processor.ts:252`/`:357`, which
   only recovers via `inferredPlatforms` derived from
   `settings.apiKeys` — and that path fails for desktop users whose
   credentials live in `config.json` rather than in web apiKeys.

Result: pipeline generates images, then logs `"No platforms
configured — skipped"` and abandons scheduling. Flow blocked.

The task hypothesis ("V040-008 broke platform detection") turned out
to be close-but-not-exactly: V040-008 didn't touch the detection
path (`explicitPlatforms ?? inferredPlatforms`), but by making the
`pipelineAutoApprove` grid the prominent new UI element, it drew
attention to a pre-existing gate that was already broken for the
autoSchedule-only config.

## What changed

### `components/PipelinePanel.tsx`

- Platform picker visibility: `{autoPost && (...)}` →
  `{(autoPost || autoSchedule) && (...)}`. The picker now shows
  whenever the pipeline intends to produce scheduled posts.
- Section label: `"Auto-post to"` → `"Platforms"` — "Auto-post to"
  was misleading once the picker governs scheduling too.
- Added an inline amber warning inside the picker when
  `availablePlatforms.length > 0 && platforms.length === 0`:
  `"Pick at least one platform — pipeline will skip scheduling
  otherwise."` This surfaces the exact failure mode the hotfix
  addresses, instead of silently relying on the `inferredPlatforms`
  fallback (which doesn't cover desktop-only credential setups).

## Why this is the right scope

The alternative fix — auto-populating `settings.pipelinePlatforms`
with `availablePlatforms` on first load — was considered and
rejected. It would silently write settings on mount, and would
surprise users who intentionally left platforms unselected (e.g.
"generate but don't schedule yet"). Exposing the picker makes the
required action visible and user-driven; the inline warning
guarantees discoverability.

The `inferredPlatforms` fallback in `lib/pipeline-processor.ts:117–124`
is left alone. Widening it to consume desktop creds would require
threading `desktopCreds` through `processIdea` deps — a cross-file
refactor beyond the hotfix. Once users pick platforms in the now-
visible picker, `explicitPlatforms` wins and the inferred branch
is bypassed entirely, so desktop users are unblocked without that
refactor.

## Spec compliance

| Acceptance criterion | Status |
|---|---|
| Pipeline detects configured platforms correctly | ✅ Picker now shown under the common autoSchedule-on config; `settings.pipelinePlatforms` populates via `togglePlatform`; `processIdea` reads `explicitPlatforms` and proceeds |
| Scheduling works after generation | ✅ With at least one platform picked, `pipelinePlatforms.length > 0` in both the carousel (line 252) and single-mode (line 357) branches of `processIdea` |
| Write inbox | ✅ (after commit) |

## Out of scope (deliberate)

- **Auto-populating `pipelinePlatforms`** — see "Why this is the right
  scope" above. Exposing the picker + warning achieves the same user
  outcome without surprising writes.
- **`inferredPlatforms` → desktop creds** — requires threading
  `desktopCreds` into `ProcessIdeaDeps`; cross-file; beyond hotfix scope.
- **Component-level tests** — the project has no jsdom / RTL setup
  (vitest runs pure-function tests only). The existing
  `pipeline-processor.test.ts:328` still covers the empty-platforms
  skip branch, which remains the correct runtime behavior.
- **Renaming `pipelinePlatforms` setting** — it's still accurate;
  only the UI label changed.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 28 files / 296 tests passing (unchanged — UI
  visibility change, no pure-function surface area added)
- Manual reasoning: under the default settings shape
  (`autoSchedule=true`, `autoPost=false`), the Platforms picker is now
  rendered; with any pick, `togglePlatform` writes
  `settings.pipelinePlatforms`; `processIdea` then takes the
  `explicitPlatforms` branch and `pipelinePlatforms.length > 0` holds
  at lines 252 and 357, so neither "No platforms configured — skipped"
  log path fires.

## Files touched

- `components/PipelinePanel.tsx` (picker visibility guard + label
  rename + inline warning; ~12 lines changed)
- `docs/bmad/reviews/V040-HOTFIX-006.md` (this file)
