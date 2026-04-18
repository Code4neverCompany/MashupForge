# MUSTFIX-003 — Resume prompt honestly explains Leonardo credit cost

**Status:** done · **Branch:** main · **Classification:** routine

## TL;DR
FEAT-006 added a "Continue pipeline?" prompt that appears after a mid-run app death. The catch documented in that review — `acceptResume` re-runs the affected idea from scratch rather than replaying from mid-step — means Leonardo is called again for images it already generated, burning credits. The old copy ("Yes, continue") buried that trade. Real mid-step resume is still deferred; this fix makes the trade visible at the click-point so users can make an informed call.

## What changed
`components/PipelineResumePrompt.tsx`:

- **Title:** "Continue pipeline?" → "Restart interrupted pipeline?". "Restart" signals that prior work on the in-flight idea is thrown away.
- **Amber warning block** (new) with `AlertTriangle` icon:
  > This re-runs the interrupted idea from scratch &mdash; Leonardo will regenerate its images and re-spend the credits. Any images already generated for this idea stay in your library but become orphaned. Pick "No, discard" to skip this idea and save credits.
- **Primary button:** "Yes, continue" → "Yes, restart (uses credits)". Explicit cost cue on the button itself, since users may click without reading the body.
- **Removed** the "N image(s) saved" line — it was misleading. Those images belong to already-completed ideas, not the interrupted one, so surfacing the count implied carry-over that doesn't happen.

## Why not fix the underlying behavior?
Real mid-step resume (replay `expandedPrompt`, skip already-saved images, resume captioning on the same set) is the FEAT-006 follow-up deferred in its review (Files touched → Follow-ups). It requires:
- Snapshotting the generated image array keyed to the pipeline run (not just `imageIds`)
- Step-by-step replay logic in `processIdea` (skip "Generating images" if checkpoint is past it, etc.)
- Handling partial captioning (some models done, others not)

That's a multi-file change with real edge cases. MUSTFIX-003 is scoped explicitly to the copy trade — "Change resume prompt copy to explain credit trade. Real mid-step resume deferred." — so the minimum honest disclosure is the whole fix.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Resume prompt explains credit trade | done — amber warning block + button cost cue |
| No regression in resume behavior | done — only copy and JSX changed; handlers unchanged |
| `tsc` clean | done — `npx tsc --noEmit` exits 0 |
| Write FIFO when done | pending (this commit) |

## Files touched
- `components/PipelineResumePrompt.tsx` (+14 / -5)

## Follow-up (still deferred)
True mid-step resume — replay from the last checkpointed step rather than re-running the whole idea. Tracked in FEAT-006 review's Follow-ups section. No ticket yet; should become one when a user complains about the credit cost or we hear "my pipeline died at captioning and it re-gen'd everything."
