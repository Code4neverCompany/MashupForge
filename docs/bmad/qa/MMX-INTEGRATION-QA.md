# QA Review — MMX CLI Integration + Pipeline Polish

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-28
**Commits:** ae08108, 60f67ed, e34d7fd, 10fb2ae, 885753b, 8114035 (MMX) · 86020f8, c361e78, abca054 (Pipeline Polish)

---

## Files Reviewed

- `lib/mmx-client.ts`
- `lib/image-generator.ts`
- `lib/image-prompt-builder.ts`
- `lib/sunday-recap.ts`
- `app/api/cron/sunday-recap/route.ts`
- `app/api/mmx/music/route.ts`
- `app/api/mmx/describe/route.ts`
- `.github/workflows/sunday-recap.yml`
- `components/PipelinePanel.tsx`
- `components/pipeline/ActiveIdeaCard.tsx`
- `components/pipeline/WeekProgressMeter.tsx`
- `app/globals.css` (progress tokens, motion-reduce, shimmer keyframe)
- `tests/lib/mmx-client.test.ts`
- `tests/lib/sunday-recap.test.ts`
- `tests/api/sunday-recap-auth.test.ts`
- `tests/lib/image-prompt-builder.test.ts`
- `tests/api/mmx-routes.test.ts`
- `tests/components/PipelinePanel-responsive-pin.test.ts`

---

## Findings

### Critical (must fix before merge)

_None._

### Warnings (should fix)

- **[WARNING] `runMmxJson` returns `undefined as T` on empty stdout + exit 0.**
  `lib/mmx-client.ts:132–166` — when `result.stdout` is empty, `parsed` stays `undefined`. The exit-code check passes and the function returns `parsed as T`. All current callers use optional chaining (`json.data?.image_urls ?? []`, etc.) so no crash, but the cast hides a real edge case and will silently break any future caller that destructures without null-guard. Low-priority but genuine type gap.

- **[WARNING] Sunday recap route cleans up temp artifacts before caller can use file paths.**
  `app/api/cron/sunday-recap/route.ts:129–135` — the `finally` block runs `rmSync(tempDir, ...)` even on success, so `artifacts.musicPath` / `voiceoverPath` in the JSON response point to already-deleted files. The comment acknowledges this is intentional ("for now the response carries enough info for workflow log"), but any consumer that tries to use those paths will get ENOENT. Should be either clarified in the response schema (mark paths as `runner-local, unavailable after response`) or the rmSync deferred until files are persisted upstream.

- **[WARNING] `buildEnhancedPrompt` has no production callers — only test imports.**
  `lib/image-prompt-builder.ts:147` — the rename commit (8114035) explicitly notes "no callers existed for the old name." The library is complete, tested, and ready, but the API routes and components that trigger image generation (`/api/leonardo`, `/api/mmx/*`, MashupStudio generation flow) still bypass it. The consistent prompt enhancement the brief promises only materialises when a caller wires it up. Recommend tracking as a follow-up task; not blocking the merge of the library itself.

### Info (noted, no action required)

- **[INFO] STORY-012 work is split across two commits.**
  The `86020f8` commit message notes the bulk layout work (header sizing, skip button shortening, ApprovalQueue padding) was bundled into the prior `d7b75857` commit by a parallel agent. Both are in main; the split is cosmetic. The 3 responsive pin tests confirm STORY-012 acceptance criteria are met.

- **[INFO] `/api/mmx/*` routes only expose music + describe (vision); image, video, speech, search are library-only.**
  Commit 10fb2ae scoped to those two. Image/video/speech are consumed directly from `lib/mmx-client.ts` by sunday-recap and will be wired to UI routes in future slices. Not a gap for this review.

- **[INFO] `timingSafeEqual` auth is correctly applied.**
  `safeEqual()` in the sunday-recap route handles unequal-length buffers safely (returns false without leaking timing) and re-uses `CRON_SHARED_SECRET`, avoiding per-cron secret sprawl.

- **[INFO] spawn() injection safety confirmed.**
  All six mmx-client commands use `spawn(bin, [array, of, args])`, never a shell string. User-supplied prompts and queries cannot inject shell metacharacters.

---

## Scope Check

### MMX Integration

- **[IN-SCOPE] All 6 commands wrapped in `lib/mmx-client.ts`:** `generateImage`, `generateMusic`, `generateVideo`, `synthesizeSpeech`, `describeImage`, `webSearch`. All covered, all tested.
- **[IN-SCOPE] Named-provider abstraction in `lib/image-generator.ts`:** Leonardo + MMX coexist, no auto-fallback (per brief), `MmxQuotaError` surfaced to callers.
- **[IN-SCOPE] `buildEnhancedPrompt` provider-agnostic:** single prompt string fed to both providers; provider-specific option structs (`result.mmx`, `result.leonardo`) resolved independently.
- **[IN-SCOPE] Sunday recap route:** posts queried via `planRecap` window filter, all three mmx stages (video + music + voiceover) fired via `executeRecap`, stage failures isolated by `Promise.allSettled`.
- **[IN-SCOPE] GitHub Actions workflow:** correct `cron: '0 10 * * 0'`, `workflow_dispatch` for catch-up, `concurrency.cancel-in-progress: false`, secret sanity checks.
- **[DEFERRED BY BRIEF] ffmpeg combination + social auto-post:** explicitly out of scope, documented in both the lib and route comments.

### Pipeline Polish

- **[IN-SCOPE] STORY-010 brand colors:** Gold `#C5A062` borders on stage cards, completion chips, queue dividers; Electric Blue `#00E6FF` on active stage glow, AccentIdeaCard spinner, progress bar. Verified in `PipelinePanel.tsx`, `ActiveIdeaCard.tsx`.
- **[IN-SCOPE] STORY-011 progress bars:** `.progress-track` / `.progress-fill` tokens applied in `WeekProgressMeter` and (per commit) `BestTimesWidget`. 700ms ease-out tween and shimmer keyframe defined in `globals.css`. `role="progressbar"` + `aria-value*` on WeekProgressMeter aggregate bar.
- **[IN-SCOPE] STORY-012 mobile responsive:** `motion-reduce:animate-none` on all spinners and active-stage ping. ActiveIdeaCard "Current step" row uses `flex-wrap`, `shrink-0` label, `break-words` value. `prefers-reduced-motion: reduce` in globals kills shimmer animation and width tween.

---

## Test Suite

| Scope | Count | Status |
|---|---|---|
| Full suite | 962 / 962 | ✓ PASS |
| `mmx-client.test.ts` | 15 | ✓ |
| `mmx-routes.test.ts` | 8 | ✓ |
| `sunday-recap.test.ts` | 12 | ✓ |
| `sunday-recap-auth.test.ts` | 5 | ✓ |
| `image-prompt-builder.test.ts` | 18 | ✓ |
| `PipelinePanel-responsive-pin.test.ts` | 3 | ✓ |

---

## Gate Decision

**[CONCERNS]** — No blocking issues. Three warnings documented:

1. `runMmxJson` undefined-cast on empty stdout (low risk, all callers null-safe).
2. Sunday recap response returns already-deleted artifact paths (intentional but misleading).
3. `buildEnhancedPrompt` not yet wired to production callers (library ready, follow-up needed).

All warnings are non-blocking. MMX integration is structurally sound and well-tested. Pipeline Polish correctly implements brand colors, animated Electric Blue progress bars, and 390px responsive layout with reduced-motion support.

**Confidence: 0.85**
