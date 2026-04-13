# Pipeline Automation Overhaul — Plan

**Date:** 2026-04-13
**Author:** Developer (Claude Opus 4.6, subagent of Hermes)
**Status:** DRAFT — awaiting user review before implementation
**Supersedes partially:** `2026-04-11-pipeline-overhaul-ui-refresh.md`,
`2026-04-12-masterprompt-pipeline.md`

## Context: what already exists

Before describing new work, the plan must start from what's actually
in the codebase — because a lot of what the user asked for is
already implemented in `hooks/usePipeline.ts` and just needs to be
surfaced in the UI.

### Already working (no changes needed to backend)

- **Auto-idea generation when queue empty** — `autoGenerateIdeas()`
  calls pi (mode=`idea`) with the user's `agentPrompt` /
  `agentNiches` / `agentGenres` and produces 3 ideas per cycle.
- **Trending-augmented prompt expansion** — `processIdea()` step b
  calls `/api/trending` and injects the result into the prompt
  expansion step c via `expandIdeaToPrompt()`.
- **Multi-model Leonardo generation** — step d calls
  `generateComparison(expandedPrompt, allModelIds)` so every active
  Leonardo model generates its take on the same idea.
- **Auto-caption** — step e calls `generatePostContent()`.
- **Smart scheduling** — step f calls `findNextAvailableSlot()` using
  engagement data from `/api/social/best-times` (Instagram insights
  with research-backed fallback).
- **Pending-approval queue** — step f sets new posts to
  `status: 'pending_approval'`. `approveScheduledPost` and
  `rejectScheduledPost` exist in `MashupContext.tsx` with
  functional updaters.
- **Continuous mode with daemon cadence** — outer do/while in
  `startPipeline()` with configurable interval, target days, and
  mid-sleep stop detection.
- **Auto-post to platforms** — optional step g.
- **Stale-closure protection** — refs for ideas, settings,
  continuous/interval/targetDays/delay.

### Gaps (what the user's new brief actually needs)

1. **Bulk approval UI** — no grid view of `pending_approval` posts
   with thumbnails, filters, or bulk-action buttons. User has to
   approve one-by-one in Post Ready or Calendar tabs.
2. **Per-model / per-topic filtered approval** — can't approve "all
   from nano-banana-pro" or "all from this idea" in one click.
3. **Pipeline in-flight visibility** — `pipelineProgress` tracks
   `currentStep` / `currentIdea` but the panel doesn't render
   thumbnails or a per-idea card as it processes.
4. **Auto-carousel grouping** — pipeline emits one post per image.
   The T2 work (commit `e0f1713`) added `CarouselGroup` +
   `carouselGroupId` plumbing. Pipeline should optionally group
   the N per-idea outputs into a single carousel post instead of
   N single posts.
5. **Per-platform daily caps** — `findBestSlot` picks the best slot
   globally but doesn't cap "max 2 Instagram posts per day". A
   power-user running continuous mode for a week blows past
   platform limits.
6. **Grouped idea generation** — `autoGenerateIdeas` asks pi for 3
   random ideas. User brief says "Group related ideas (same
   topic/theme)" — needs a thematic-batch variant.
7. **Feedback loop / learning** — no signal flows from approved/
   rejected posts back into future prompt generation. User brief
   says "Previous successful images (learn from what worked)".
8. **Calendar view in Pipeline tab** — exists as its own tab but
   isn't embedded in Pipeline. Minor — may be out of scope.

Nothing from the user's 5-step "AUTOMATION FLOW" is missing on
the backend. Steps 1-3 work today. Step 4 (bulk approve) is the
biggest gap. Step 5 (smart scheduling) works but needs the daily
cap guard.

## Architecture principles

- **No backend rewrites.** `usePipeline.ts` is 593 lines of
  carefully-tuned state and I'm not rebuilding it. Extensions land
  as new opt-in methods, not replacements.
- **UI-first.** Most of this plan is new React components rendered
  inside `PipelinePanel.tsx` + a handful of `useMashup()` exports.
- **Settings-driven.** Every new behavior (daily caps, carousel
  mode, grouped ideas) is a `UserSettings` flag with a default
  that matches current behavior. No breaking changes to running
  pipelines.
- **Reuse the T2 carousel machinery.** `CarouselGroup` and
  `carouselGroupId` already exist from `e0f1713`. The pipeline
  carousel mode wires into them instead of inventing a new type.
- **No new API routes.** `/api/trending`, `/api/pi/prompt`,
  `/api/leonardo`, `/api/social/post`, `/api/social/best-times`
  cover everything. Feedback-loop data is client-side / IDB.

## Phases

### Phase 1 — Pipeline progress visibility (quick win)

**Goal:** Make the running pipeline feel alive. When `pipelineRunning`
is true, show thumbnails of the idea currently processing and the
images it's producing, not just a text progress line.

**Changes:**
- `components/PipelinePanel.tsx` — new `<ActiveIdeaCard>` subcomponent
  that reads `pipelineProgress.currentIdea`, looks up the matching
  `Idea` from context, and renders a card with:
  - Concept text
  - Stage progress (uses existing `STAGES` array + `activeStageKey`)
  - Thumbnails of the N images being generated, wiring to `images`
    from context and filtering to ones whose `modelInfo.modelId`
    matches the active model set (`LEONARDO_MODELS`)
  - A cancel-this-idea button that advances the inner loop past
    the current idea without stopping the whole pipeline
- `hooks/usePipeline.ts` — add a `skipCurrentIdeaRef` checked inside
  `processIdea()` at the start of each step. Expose `skipCurrentIdea`
  from the hook.

**No type changes.** Uses existing state.

**Effort:** ~2-3 hours. Fully reversible.

### Phase 2 — Bulk approval queue (the main feature)

**Goal:** Dedicated "Approval Queue" section in PipelinePanel that
shows every `pending_approval` scheduled post with thumbnails,
filters, and bulk actions.

**Changes:**
- `components/MashupContext.tsx` — new bulk methods:
  ```ts
  bulkApproveScheduledPosts(ids: string[]): void
  bulkRejectScheduledPosts(ids: string[]): void
  ```
  Both use functional updaters (one state pass, not N).
- `types/mashup.ts` — extend `MashupContextType` with the two new
  methods.
- `components/PipelinePanel.tsx` — new `<ApprovalQueue>` subcomponent:
  - Grid of cards, one per `pending_approval` post
  - Each card shows: image thumbnail (lookup via `post.imageId` →
    `savedImages`), caption preview, scheduled slot, platforms, and
    the source idea concept (new — see below)
  - Checkbox selection per card + "Select All" / "Clear"
  - Filter pills: by topic (idea concept group), by model
    (`modelInfo.modelId`), by platform, by date range
  - Bulk action bar: "Approve Selected", "Reject Selected",
    "Approve All Matching Filter"
- **Idea-post linkage:** add `sourceIdeaId?: string` to
  `ScheduledPost` in `types/mashup.ts` and populate it in
  `usePipeline.processIdea()` step f. Needed so the queue can show
  "from idea X" and filter by topic.

**Effort:** ~6-8 hours. Additive schema change.

### Phase 3 — Auto-carousel grouping

**Goal:** Optional pipeline mode where the N per-idea Leonardo
outputs become ONE carousel post instead of N single posts.

**Changes:**
- `types/mashup.ts` — new setting
  `pipelineCarouselMode?: boolean` (default `false`).
- `hooks/usePipeline.ts` — in `processIdea()`, when
  `settings.pipelineCarouselMode === true`, reshape the per-image
  `for` loop (lines 283-370) so that instead of creating one
  `ScheduledPost` per image, it:
  1. Creates a single `CarouselGroup` from the ready images
  2. Assigns a shared `carouselGroupId` to each image via
     `patchImage`
  3. Creates ONE `ScheduledPost` with `carouselGroupId` set
  4. Captions the first image as the post caption (keeps semantics)
- `components/PipelinePanel.tsx` — add a "Carousel mode" toggle in
  the stage-toggles grid (alongside auto-tag / auto-caption).

**Risk:** pipeline carousel posts need to pass the existing auto-
poster fan-out in `MainContent.tsx`, which already handles
`carouselGroupId`. I verified this in T2 — no regression expected.

**Effort:** ~3-4 hours.

### Phase 4 — Per-platform daily caps

**Goal:** Enforce "max N posts/day per platform" so continuous
mode can't spam Instagram.

**Changes:**
- `types/mashup.ts` — new settings:
  ```ts
  pipelineDailyCaps?: Partial<Record<'instagram' | 'pinterest' | 'twitter' | 'discord', number>>
  ```
  Default unset = no cap. Sensible UI defaults: IG 2/day, Pinterest
  5/day, Twitter 10/day, Discord unlimited.
- `lib/smartScheduler.ts` — extend `findBestSlot()` signature with
  an optional `caps` argument:
  ```ts
  findBestSlot(existing, engagement, caps?): { date, time, reason }
  ```
  When computing the next slot, skip any day where the count of
  same-platform scheduled/posted posts already meets the cap.
- `hooks/usePipeline.ts` — pass `settingsRef.current.pipelineDailyCaps`
  into `findNextAvailableSlot()`.
- `components/PipelinePanel.tsx` — add a caps editor in the continuous-
  mode block (4 small number inputs).

**Effort:** ~3 hours.

### Phase 5 — Themed idea batches

**Goal:** `autoGenerateIdeas()` emits 3 related ideas around one
theme instead of 3 random ones.

**Changes:**
- `hooks/usePipeline.ts` — new helper
  `autoGenerateThemedBatch(count): Promise<{ theme: string, ideas: Idea[] }>`
  that calls pi with a slightly different prompt:
  "Pick ONE theme from the active niches, then generate ${count}
  variations on that theme. Return JSON: `{ theme, ideas: [...] }`."
- Existing `autoGenerateIdeas(3)` call in `startPipeline()` becomes
  `autoGenerateThemedBatch(3)`, with the theme string logged via
  `addLog('auto-generate', '', 'success', ...)`.
- `types/mashup.ts` — no changes; `Idea` already has a `context`
  field that can carry the theme name.

**Effort:** ~1 hour.

### Phase 6 — Feedback loop (experimental, defer if time-boxed)

**Goal:** Bias the next cycle's prompt generation toward models,
topics, and styles that have previously been approved.

**Changes:**
- `types/mashup.ts` — new persisted store
  `pipelineStats: { approvals: Record<string, number>, rejections: Record<string, number>, lastUpdated: number }`
  where keys are `${modelId}|${topicHash}`.
- `components/MashupContext.tsx` — increment on
  `approveScheduledPost` / `rejectScheduledPost`. Topic hash from
  the linked source idea's concept (needs Phase 2's `sourceIdeaId`).
- `hooks/usePipeline.ts` — `autoGenerateThemedBatch()` reads
  `settingsRef.current.pipelineStats` and injects a hint into the
  pi prompt: "Recent high-performing themes: X, Y, Z. Avoid
  themes: A, B."
- `processIdea()` — when choosing which models to generate with,
  weight by approval rate (simple: any model with <20% approval
  over 10+ attempts gets dropped from the active set for this
  cycle).

**Risk:** feedback loops can collapse diversity. Mitigation: never
drop below 2 models active, always explore one "cold" model per
cycle (epsilon-greedy).

**Effort:** ~5-6 hours. Easy to ship as a flag-gated experiment.

## Non-goals

Explicitly NOT in this plan:
- Rewriting `usePipeline.ts` or `processIdea()` from scratch.
- New API routes. Backend is done.
- A separate calendar view inside PipelinePanel — the existing
  Calendar tab is fine.
- Real-time multi-user collaboration.
- A new database / migrating off IDB-keyval.
- GraphQL / tRPC / any new wire protocol.
- Mobile-specific UI. The Pipeline tab is desktop-first.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| State ballooning in `settings.scheduledPosts` | medium | already bounded by user's own use; add a "clear posted >30d old" sweep as a follow-up |
| Stale-closure regressions from new ref usage | medium | reuse the existing `*Ref` pattern — don't introduce new patterns |
| Feedback loop killing diversity (Phase 6) | high | epsilon-greedy; flag-gated behind `pipelineLearningEnabled` |
| Carousel mode breaking existing single-post pipeline runs | low | opt-in flag, defaults off |
| Daily-cap computation O(n²) in long-running continuous mode | low | `findBestSlot` already scans existing posts linearly; caps is a cheap additional filter |
| `bulkApprove` racing with the auto-poster 60s interval | medium | bulk updaters use functional setState, same pattern as T3 fixes |

## Suggested ordering

If you approve, I'd ship in the order: **Phase 2 → 1 → 4 → 3 → 5 → 6.**
Rationale:
- **Phase 2 first** because it's the biggest user-visible win and
  unblocks the `sourceIdeaId` field that Phase 6 depends on.
- **Phase 1 second** because it rides on Phase 2's refactor of
  PipelinePanel layout.
- **Phases 4, 3, 5** can ship in any order — all small.
- **Phase 6 last** because it's speculative and depends on Phase 2.

## Questions for Hermes / user before I start

1. Should Phase 6 (feedback loop) be in scope or deferred entirely?
   It's the fuzziest and most risky.
2. Carousel mode (Phase 3) — when enabled, should it also affect
   MANUAL idea runs from the Ideas Board, or only pipeline-initiated
   ones? My default would be "pipeline only" to minimize surprise.
3. Per-platform daily caps (Phase 4) — should "posted" posts also
   count toward today's cap, or only "scheduled"? I'd say yes to
   both, otherwise the cap leaks.
4. Does the team have a preference between "approve one-by-one
   persists immediately" vs "approve-selected stages changes and
   applies on button click"? My default is immediate-apply for
   bulk and preserve the current single-click UX.

Ping back in the outbox and I'll start with Phase 2 once you've
signed off.
