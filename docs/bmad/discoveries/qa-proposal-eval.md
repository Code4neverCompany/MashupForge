# QA Discovery — Research Proposals 009-019: Validation Assessment

**Agent:** QA (Quinn)
**Date:** 2026-04-28
**Source:** `docs/bmad/briefs/research-proposals-009-019.md`
**Scope:** Which proposals QA can validate with tests, and what those tests look like.

---

## Summary

| PROP | Title | QA Testability | Effort | Verdict |
|------|-------|---------------|--------|---------|
| 009 | MainContent monolith extraction | HIGH | MEDIUM | QA owns the regression gate |
| 016 | Phase 2 staged extraction (6 tickets) | HIGH | HIGH | QA owns per-ticket smoke tests |
| 017 | Pipeline execution speed | MEDIUM | SMALL | QA can measure + regression-test |
| 018 | Image caching | MEDIUM | SMALL | QA can verify correctness; perf is manual |
| 019 | Batch processing | HIGH | SMALL | QA owns concurrency correctness |

---

## PROP-009 / PROP-016 — MainContent Extraction (Phase 1 residual + Phase 2 staged)

### Why this is QA's problem

`MainContent.tsx` at 4382 LOC is a blast-radius concentration point. Every extraction is a refactor of live UI. The risk is: a prop gets missed, a handler is silently dropped, or a view renders stale state. None of this shows up in TypeScript alone.

### What QA can validate

**Regression checklist per extracted view** (run after each ticket in Phase 2):

| View | Key behaviours to smoke-test |
|------|------------------------------|
| `GalleryView` | Filter bar updates grid; card click opens detail modal; batch-select checkbox works; LazyImg loads |
| `StudioView` | Prompt input → generate → new images appear; model selector persists; `handleSuggestParameters` fires and cards render |
| `CaptioningView` | Grouped/flat toggle switches layout; caption editor saves; `batchCaptionImages` runs without error; progress bar increments |
| `PostReadyView` | Grid/calendar/history tabs switch; drag-and-drop reorders; schedule button fires `scheduleImage`; smart scheduler runs; heatmap renders |
| `PipelineView` | Pipeline controls start/stop; status strip updates; daemon events bubble up |

**State distribution check:** After extraction, each view must receive its slice of state via props — not reach back via `useMashup()`. QA check: confirm no `useMashup()` import in any extracted view file.

**Handler drop check:** For each handler group moved out of `MainContent.tsx`, verify the handler still fires by triggering the UI action and checking side effects (state change, API call, toaster). This is manual at v0.9.11 stage; automatable once RTL is in.

### Test infrastructure required

- **Component test infra (Ticket #0)** — `@testing-library/react` + `jsdom` + Vitest. This is a hard prerequisite the brief itself cites. QA should co-author the Ticket #0 spec to ensure the test setup is QA-useful, not just dev-convenient.
- **Stub for `useMashup` context** — needed for isolated view rendering in tests.

### QA gate per ticket

Before each Phase 2 ticket can be marked `[x]` in the queue:
1. Extracted view renders without console errors
2. All key behaviours in the table above pass manual smoke-test
3. No `useMashup()` direct import in the extracted file
4. `MainContent.tsx` line count decreases by the expected amount (document expected delta per ticket)

---

## PROP-017 — Pipeline Execution Speed

### What the change is

Three optimizations of `hooks/usePipelineDaemon.ts` + `lib/pipeline-processor.ts`:
1. **Parallel captioning** — `Promise.all` instead of sequential for-loop in `pipeline-processor.ts:410-485`
2. **Leonardo parallelism** — investigation-dependent
3. **Overlap trending + generate** — moderate refactor of `processIdea` flow

### What QA can validate

**Correctness tests (must not regress):**

| Test | What to verify |
|------|----------------|
| All captions complete | After parallel captioning, every image in the batch has a caption — none silently dropped |
| No race condition on `updateIdeaStatus` | Concurrent caption calls must not leave an idea stuck in `in-work` state |
| Caption content is not swapped | Image A's caption goes to image A, not B (parallelism must not cross-wire results) |
| Progress bar still increments | `batchProgress` counter updates as each caption resolves, not only at the end |
| Timeout still fires | If one pi call stalls, `PER_IDEA_TIMEOUT_MS` still evicts the idea correctly |

**Performance baseline (manual, before/after):**
- Time a batch of 9 images through captioning with sequential code → record time
- Time same batch after `Promise.all` → confirm ≥ 2× speedup
- This is not automatable without wall-clock injection; document as a manual benchmark.

**QA verdict:** Parallel captioning is LOW RISK to validate — the change is self-contained in `pipeline-processor.ts:410-485`. The correctness checklist above is the gate. No new test infra required; can be integration-tested against the running app.

---

## PROP-018 — Image Caching

### What the change is

1. In-memory LRU cache in `app/api/proxy-image/route.ts`
2. Extended `Cache-Control` headers for freshly-generated images
3. LazyImg error recovery: auto-retry via proxy on CDN 403

### What QA can validate

**Correctness (must not regress):**

| Test | What to verify |
|------|----------------|
| Cached image returns same bytes | Second request to proxy-image for same URL returns identical content |
| Cache does not serve stale auth | Two different users must not receive each other's images from cache (if images are user-scoped) |
| LazyImg 403 recovery | Simulate a CDN 403 (block the Leonardo URL) — image must recover and display via proxy fallback |
| Cache eviction | Cache should not grow unbounded; after hitting max size, oldest entries evict |
| `Cache-Control: immutable` only on fresh images | Verify header is NOT set on images that could be re-generated or updated |

**Security check:** The proxy cache introduces a potential data-leak vector if cache keys are not sufficiently scoped. QA must verify: two browser sessions requesting different images cannot cross-serve via the LRU cache. This is a **CRITICAL security check** for this proposal.

**Performance (manual):**
- Hard-reload gallery → measure image load time
- Soft-reload (cache warm) → compare
- This is a user-perceptible metric; document before/after.

**QA verdict:** The correctness and security checks are the gate. The cache-key scoping check is critical and must be reviewed in code before ship.

---

## PROP-019 — Batch Processing

### What the change is

`batchCaptionImages` in `MainContent.tsx:1001-1052` switches from sequential for-loop to a concurrency-limited pool (3 concurrent pi calls). Progress tracking switches from sequential counter to atomic counter.

### What QA can validate

This is the most automatable proposal on the list.

**Correctness tests:**

| Test | What to verify |
|------|----------------|
| All entries captioned | A batch of N images results in exactly N images with captions |
| CONCURRENCY=3 limit respected | At peak, no more than 3 pi calls in-flight simultaneously (verifiable via network tab or pi mock call count) |
| Progress increments ≥1 time per entry | `batchProgress.done` reaches `batchProgress.total` at end |
| No entry processes twice | Each image appears in the output exactly once |
| Partial failure handled | If one pi call fails, the remaining N-1 still complete (no early exit) |
| `Promise.race(pool)` does not leak | After batch completes, the pool Set is empty — no dangling promises |

**Edge cases:**

| Edge case | Expected behaviour |
|-----------|-------------------|
| Batch of 1 | Concurrency pool handles single-entry correctly |
| Batch of exactly CONCURRENCY (3) | All 3 start simultaneously, none waits |
| Batch of 0 | No-op, no errors |

**QA verdict:** HIGH confidence these can be unit-tested with a mocked `generatePostContent` that records call timestamps. The pool pattern is well-defined in the brief's code snippet — the tests write themselves. This is the **most test-friendly proposal in the set**.

**Suggested test file:** `__tests__/batch-caption.test.ts` — mock `generatePostContent` as a delayed async function, verify call timing and output assignment.

---

## Infrastructure Gap Summary

To fully validate all proposals, QA needs:

| Infrastructure | Needed for | Current status |
|----------------|-----------|----------------|
| `@testing-library/react` + `jsdom` | PROP-009/016 view regression | Missing (Ticket #0) |
| `fake-indexeddb` or `vitest-localstorage-mock` | Context Rail IDB (AI Smarter A3) | Missing |
| Clock mocking (`vi.useFakeTimers`) | 🔥 badge fade, OutcomeRibbon T+24h | Built into Vitest — no install needed, just use |
| Network request spy / MSW | PROP-017 concurrency verification, A4/A8 payload checks | MSW not installed; can use `vi.spyOn` as stopgap |
| LRU cache key audit (code review) | PROP-018 security check | No tooling — manual code review required |

---

## Priority Order for QA

1. **PROP-019 batch tests** — smallest scope, highest test ROI, no infra needed
2. **PROP-017 pipeline correctness** — integration test against running app, no infra needed
3. **PROP-018 correctness + security review** — critical cache-key audit; no new tooling needed
4. **PROP-009/016 extraction smoke tests** — depends on Ticket #0 (test infra); QA should co-author that ticket
