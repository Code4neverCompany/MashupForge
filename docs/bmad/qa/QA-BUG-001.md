# QA Gate: QA-BUG-001 — Batch Caption Carousel Fix

**Review target:** `docs/bmad/reviews/BUG-001.md` + diff `components/MainContent.tsx` (+54 / −8)
**Date:** 2026-04-18
**Reviewer:** QA subagent
**Status:** PASS with WARN

---

## Summary

`batchCaptionImages` was rewritten to be carousel-aware. The fix is correct and
closes the regression (N AI calls per carousel → 1 call per group). One warn-level
issue found that should be fixed before shipping to avoid silent caption overwrites
in an edge case.

---

## Acceptance criteria verdict

| Criterion | Code location | Verdict |
|---|---|---|
| Carousel group detection uses `computeCarouselView` | `MainContent.tsx:756-767` | ✅ |
| Anchor = first image in group; single AI call per carousel | `line 760, 792` | ✅ |
| Fan-out propagates anchor caption to all siblings | `lines 793–799` | ✅ with WARN |
| Single images unchanged — one `generatePostContent` each | `lines 769–771, 792` | ✅ |
| Mixed batch (singles + carousels) handled correctly | `lines 764–766, 769–771` | ✅ |
| `captioningGrouped = false` → old flat behavior preserved | `lines 768–771` | ✅ |
| Progress counter reflects groups + singles, not raw images | `lines 776, 805` | ✅ |

---

## Issues

### WARN-1 — Fan-out in `needsAi=true` branch overwrites pre-existing sibling captions

**Location:** `MainContent.tsx:793–799`

The `needsAi=false` path (anchor already captioned) correctly skips siblings that
already have a caption:
```ts
if (ci.postCaption) continue;   // line 785 — guards the !needsAi branch
```

The `needsAi=true` path (anchor needs AI) fans out unconditionally:
```ts
for (const ci of entry.rest) {
  patchImage(ci, { postCaption: withCaption.postCaption, ... });
  // no ci.postCaption guard here
}
```

**Impact:** If anchor has no caption but some siblings do (e.g., user manually
captioned half the carousel), batch will silently overwrite the siblings' captions
with the freshly generated one.

**Probability:** Low. Requires: `captioningGrouped=true`, anchor uncaptioned, at
least one sibling already captioned manually. The skip-all-if-fully-captioned guard
(`v.images.every((i) => i.postCaption)`, line 759) prevents the common case. But the
edge case is real and inconsistent with the `!needsAi` branch behavior.

**Recommended fix:**
```ts
for (const ci of entry.rest) {
  if (ci.postCaption) continue;   // add this line
  patchImage(ci, { ... });
}
```

---

### INFO-1 — `captioningGrouped` captured at call time (async closure)

If the user toggles the grouped/ungrouped switch while a batch is in progress,
the function continues with the grouping decision made at invocation time. This
is the correct behavior (don't change grouping mid-batch), so this is not a bug
— just documenting for clarity.

---

### INFO-2 — `generatePostContent(anchor)` side-effect vs return value

`generatePostContent` both persists the anchor's caption as a side effect and
returns the content for fan-out. The anchor is not in `entry.rest`, so there is
no double-write. Verified: `rest` is `v.images.slice(1)` (the destructure on
line 760), which excludes the anchor. ✅

---

## Structural checks

| Check | Result |
|---|---|
| Diff scoped to one function in one file | ✅ — only `batchCaptionImages` changed |
| No new imports added | ✅ |
| No API shape changes (function signature, props, hooks) | ✅ |
| `computeCarouselView` reused (not duplicated) | ✅ — already memoized via `useCallback` |
| tsc clean per developer report | ✅ |
| `patchImage` is the right write path (same as per-card button) | ✅ — `MainContent.tsx:732-734` |

---

## Regression risk

**Ungrouped path (`captioningGrouped=false`):** Code path is identical to pre-fix
(`entries.push({ kind:'single', img })` for each uncaptioned image). Zero regression
risk on this path.

**Grouped path for singles-only batch:** The `else if (!v.img.postCaption)` branch
on line 764 handles single-PostItem entries emitted by `computeCarouselView`. Works
correctly. Mixed batches (singles + carousels) covered.

---

## Manual test plan

1. **Happy path — ungrouped carousel batch**
   - Have 3 images auto-grouped (same prompt, <5 min apart). All uncaptioned.
   - Toggle Grouped on. Click Batch Caption.
   - Expect: progress shows 1/1 (one group). All 3 images end with identical captions.

2. **Anchor already captioned — propagate without AI call**
   - Manually caption the anchor image of a carousel group.
   - Leave siblings uncaptioned. Click Batch Caption.
   - Expect: siblings receive anchor's caption. Zero AI requests (check Network tab).

3. **Mixed batch: 2 singles + 1 carousel (3 images)**
   - Expect progress 3/3 (2 singles + 1 carousel group).
   - Each single gets its own unique caption; carousel siblings share one.

4. **Grouped off — flat behavior**
   - Toggle Grouped off. Same images. Click Batch Caption.
   - Expect: every uncaptioned image gets its own AI-generated caption (old behavior).

5. **WARN-1 edge case** (after fix applied)
   - Carousel group: anchor uncaptioned, sibling already captioned manually.
   - Click Batch Caption.
   - Expect: anchor gets new caption; sibling's caption is NOT overwritten.
   - Currently (before fix): sibling caption will be overwritten. This confirms WARN-1.

---

## Verdict

| Area | Result |
|---|---|
| Carousel group detection | ✅ PASS |
| Anchor selection | ✅ PASS |
| Fan-out correctness | ⚠️ WARN — see WARN-1 |
| Mixed batch (singles + carousels) | ✅ PASS |
| No double-captioning of anchor | ✅ PASS |
| Ungrouped path unchanged | ✅ PASS |

**Overall: PASS with WARN.** The core fix is correct and safe to ship. WARN-1
(missing `ci.postCaption` guard in `needsAi=true` fan-out) should be addressed
before the release tag to keep both fan-out branches consistent.
