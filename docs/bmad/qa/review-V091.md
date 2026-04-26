---
title: MashupForge V091-REVIEW QA Review
created: 2026-04-26
updated: 2026-04-26
type: project
status: approved
tags: [mashupforge, qa, review, carousel, queue, social-posting, v0.9.1]
sources: [raw/agent-output/V091-REVIEW.md]
confidence: 0.87
commits: [cf791f1, 4ca8c9a, 3ced0dd]
---

# MashupForge V091-REVIEW QA Review

**TLDR:** QA review of 3 commits targeting v0.9.1 — carousel builder (2-10 image constraint), server-side post queue (atomic writes, cron race-safe), and .env.example cleanup. Verdict: **APPROVED WITH NOTES** (confidence 0.87). No TypeScript errors, ESLint clean. 3 minor + 1 info finding, none blocking. Noteworthy: QA agent reported zero test files in the repo — this contradicts prior session data showing 783 tests; see Contradictions below.

## Verdict

**APPROVED WITH NOTES** — ship v0.9.1. Open follow-up stories for findings 1, 3, 4.

## What Was Reviewed (commits cf791f1, 4ca8c9a, 3ced0dd)

### 1. Carousel Builder

2-10 image constraint enforced in **4 places**:
- Frontend helpers (guard pre-submit)
- `publishIgCarousel` — hard throw if constraint violated
- Auto-poster: `(post.carouselImageIds?.length ?? 0) >= 2` correctly branches for carousel vs single-image
- All-or-nothing behavior on missing carousel members

IG 3-step carousel flow confirmed correct: child media creation → parent CAROUSEL → `media_publish`.

### 2. Server-Side Post Queue

- **Atomic write:** `fs.rename(tmp, QUEUE_PATH)` — POSIX-atomic; PID+timestamp temp path avoids write collisions
- **Cron race:** `scheduled→posting` claim is one atomic `mutateQueue()` write — client timer and cron cannot double-fire the same post
- **`isDue()` parsing:** local-time parsing correct per ES spec for date-time strings without timezone suffix

### 3. .env.example Cleanup

Reviewed. Finding 3 below covers the one issue found.

## Findings (all non-blocking)

### Finding 1 — Queue intake missing carousel length validation (minor)

`queue/route.ts` POST handler does not validate `carouselImageIds.length` is within 2–10 at intake. Posts with invalid carousel sizes enter the queue and fail gracefully at publish time. No data corruption, but the error surface is delayed.

**Recommended fix:** add intake validation so the API returns a 400 immediately rather than queuing a guaranteed-to-fail post.

### Finding 2 — No `chmod 600` on queue file (minor, acknowledged trade-off)

Queue file stores credentials (IG tokens, etc.) in plaintext and relies on system umask for access control rather than explicit `chmod 600`. For a local Tauri desktop app this is an acknowledged trade-off — the file lives in user-space and no other processes have user-level access on a normal setup. Not a blocker for local distribution; would need revisiting before any server-side or multi-user deployment.

### Finding 3 — .env.example misleads on credential source (minor)

`.env.example` lists `IG_ACCESS_TOKEN`, Twitter, and Discord vars as "required". In practice the app never reads these via `process.env` — social credentials flow from Settings UI → queue entry. The example file is misleading and may cause confusion for new contributors.

**Recommended fix:** update `.env.example` to remove or clearly annotate social credential vars, noting they are configured via the in-app Settings panel.

### Finding 4 — Queue mirror failure silent to user (info)

When `POST /api/social/queue` fails (queue mirror write error), the handler logs `console.warn` only. The user has no UI feedback and doesn't know the cron scheduler won't fire their post.

**Recommended fix:** surface a UI toast on queue write failure — same toast pattern used elsewhere in the app.

## Quality Gates

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ Clean |
| ESLint | ✅ Clean |
| Tests | ⚠️ See Contradictions below |

## Contradictions / Data Gaps

**⚠️ Test count discrepancy — `contested: true`**

QA agent reported: *"This repo has zero test files. Pre-existing, not introduced by these commits. Worth a setup story."*

Prior vault records for this project:
- V080-POLISH (2026-04-23): 722/722 tests passing
- V083-UPDATE-UI (2026-04-23): 781/781 tests passing
- FRONTEND-OVERHAUL-REVIEW (2026-04-23): 783/783 tests passing

**Possible explanations:**
- The QA agent was pointed at a different working directory (`~/projects/Multiverse-Mashup-Studio` vs the prior path `~/projects/Multiverse-Mashup-Studio_09_04_26_13-14/`)
- Tests live in a sub-directory the QA agent's search missed
- A test-removal commit happened between v0.9.0 and V091

**Action for Hermes:** verify `find ~/projects/Multiverse-Mashup-Studio -name "*.test.*" | head` and confirm which path is canonical. If tests genuinely don't exist at that path, check if the project was re-cloned to a shorter directory name and whether tests were carried over.

## Follow-Up Stories

1. **Queue intake validation** — add `carouselImageIds.length` 2–10 check at `queue/route.ts` POST (Finding 1)
2. **Queue failure toast** — UI feedback when mirror write fails; user must know cron won't fire (Finding 4)
3. **Test setup story** — if zero tests confirmed, scaffold vitest + first tests for queue, carousel, `isDue()` (QA note)
4. **.env.example clarification** — annotate or remove social credential vars; document Settings UI as the real source (Finding 3)

## Connections

- [[mashupforge]] — parent project entity
- [[mashupforge-v090-pipeline-style-diversity]] — previous sprint (style diversity in compare mode)
- [[4nevercompany]] — company
