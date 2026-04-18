# REFACTOR-001 — Extract `fanCaptionToGroup` shared helper (DONE)

**Status:** done
**Classification:** routine (per Hermes dispatch)
**Executed:** 2026-04-18
**Files touched:** 1
- `components/MainContent.tsx` — helper added; three call sites collapsed

---

## Why

QA flagged that the carousel "fan one AI caption out to every sibling" loop existed in three places that had silently drifted:

| # | Site | Behavior on captioned siblings |
|---|---|---|
| 1 | `batchCaptionImages` AI branch | Skip (after FIX-WARN-001) |
| 2 | Captioning view per-card Generate/Regen button | **Overwrite** (no guard) |
| 3 | Post-ready scheduling card "Regen" button | **Overwrite** (no guard) |

Three copies, three opportunities for invariants to land in only one place. Sites 2 and 3 differed from site 1 by an entire `if (ci.postCaption) continue;` line — the exact bug WARN-1 fixed only in batch.

This is the third carousel-aware fix in this neighborhood (BUG-001 → FIX-WARN-001 → REFACTOR-001). The pattern was clearly screaming for extraction.

## What changed

### New helper — `fanCaptionToGroup(anchor, rest, opts?)`

Defined right after `patchImage` (closure-captures both `generatePostContent` and `patchImage`):

```ts
const fanCaptionToGroup = async (
  anchor: GeneratedImage,
  rest: GeneratedImage[],
  opts: { force?: boolean } = {},
): Promise<GeneratedImage | undefined> => {
  const withCaption = await generatePostContent(anchor);
  if (!withCaption?.postCaption) return withCaption;
  const force = opts.force === true;
  for (const ci of rest) {
    if (ci.id === anchor.id) continue;
    // WARN-1 guard: never overwrite a sibling's per-image caption
    // unless the caller explicitly opted in (force regenerate).
    if (!force && ci.postCaption) continue;
    patchImage(ci, {
      postCaption: withCaption.postCaption,
      postHashtags: withCaption.postHashtags,
    });
  }
  return withCaption;
};
```

Two invariants now live in **exactly one place**:

1. The anchor is always skipped in the loop (its caption was persisted by `generatePostContent`'s side effect).
2. By default, siblings with their own caption are preserved (WARN-1). `{ force: true }` opts in to overwriting — used by the two explicit user-driven "Regenerate" buttons.

The helper is a closure inside `MainContent`, not a `lib/` export, because both consumers are in this file and both depend on local-scope `patchImage`. Lifting to `lib/` would require either passing `patchImage` + `generatePostContent` as args (back to the verbose signature the spec showed) or duplicating the closure capture. Keeping it inline preserves brevity at the call sites and keeps "what the helper does" co-located with "the function that updates an image".

### Site 1 — `batchCaptionImages` (line ~849)

```diff
  if (entry.kind === 'carousel' && !entry.needsAi) {
+   // No-AI path: anchor already has a caption; propagate it
+   // verbatim. (Distinct from the helper, which calls AI.)
    for (const ci of entry.rest) {
      if (ci.postCaption) continue;
      patchImage(ci, {
        postCaption: anchor.postCaption,
        postHashtags: anchor.postHashtags,
      });
    }
- } else {
-   const withCaption = await generatePostContent(anchor);
-   if (entry.kind === 'carousel' && withCaption?.postCaption) {
-     for (const ci of entry.rest) {
-       if (ci.postCaption) continue;
-       patchImage(ci, {
-         postCaption: withCaption.postCaption,
-         postHashtags: withCaption.postHashtags,
-       });
-     }
-   }
- }
+ } else if (entry.kind === 'carousel') {
+   await fanCaptionToGroup(anchor, entry.rest);
+ } else {
+   await generatePostContent(anchor);
+ }
```

Behavior preserved exactly: the additive (WARN-1) semantics is the helper's default. The no-AI fan-out branch stays inline because it doesn't call AI at all — different operation, kept explicit.

### Site 2 — Per-card Generate (captioning view)

```diff
  onClick={async () => {
+   // Explicit user click → force overwrite siblings.
    setPreparingPostId(anchor.id);
    try {
-     const withCaption = await generatePostContent(anchor);
-     if (withCaption?.postCaption) {
-       for (const ci of entry.images) {
-         if (ci.id === anchor.id) continue;
-         patchImage(ci, {
-           postCaption: withCaption.postCaption,
-           postHashtags: withCaption.postHashtags,
-         });
-       }
-     }
+     await fanCaptionToGroup(anchor, entry.images, { force: true });
    } finally {
      setPreparingPostId(null);
    }
  }}
```

Behavior preserved: original had no `ci.postCaption` guard, so it overwrote — `{ force: true }` matches that. The button label is `'Regenerate'` when anchor already has a caption and `'Generate'` otherwise; `force` only matters in the regenerate case (no captions to overwrite when generating).

### Site 3 — Post-ready Regen button

```diff
  onClick={async () => {
+   // Explicit "Regen" click → force overwrite even captioned siblings.
    setPreparingPostId(anchor.id);
    try {
-     const withCaption = await generatePostContent(anchor);
-     if (withCaption?.postCaption) {
-       for (const ci of item.images) {
-         if (ci.id === anchor.id) continue;
-         patchImage(ci, { postCaption: withCaption.postCaption, postHashtags: withCaption.postHashtags });
-       }
-     }
+     await fanCaptionToGroup(anchor, item.images, { force: true });
    } finally {
      setPreparingPostId(null);
    }
  }}
```

Behavior preserved with `{ force: true }`. FIX-WARN-001 explicitly noted this site was the "force-regenerate the whole carousel" path — preserving that intent literally now.

---

## tsc

```
$ npx tsc --noEmit
$  # exit 0 — clean
```

---

## Acceptance checklist

| AC | Status | Notes |
|---|---|---|
| `fanCaptionToGroup()` helper created (shared utility) | ✅ | Defined inline in `MainContent.tsx` next to `patchImage`. Closure-captures `generatePostContent` + `patchImage`. |
| Per-card Generate uses it | ✅ | Both per-card paths (captioning view Generate, post-ready Regen) now call `fanCaptionToGroup(anchor, images, { force: true })`. |
| `batchCaptionImages` uses it | ✅ | The needsAi=true branch collapses to one line. |
| Both paths now identical — no drift possible | ✅ | The fan-out loop body lives in **one** function. Future changes (new fields to propagate, new guards) land in one place automatically reaching all three sites. |
| `tsc` clean | ✅ | `npx tsc --noEmit` exits 0. |
| Write FIFO when done | ✅ | After this writeup. |

---

## Out of scope

- **No-AI propagate-anchor-caption fan-out** (the `!entry.needsAi` branch in `batchCaptionImages`). Left inline because it doesn't call AI — different operation. A future cleanup could introduce a `propagateAnchorCaption(anchor, rest)` sibling helper if the same loop body shows up elsewhere; today it's a single occurrence.
- **Hoisting to `lib/` or a hook**. Both call sites are in `MainContent.tsx`. The helper depends on two local closures; a free function would require passing them in (the verbose signature `(anchor, rest, generatePostContent, patchImage)` was rejected for ergonomics). When `MainContent.tsx` is broken up further (TECHDEBT-002 was the first cut), the helper will naturally migrate with whichever new file owns the captioning view.
- **Memoization with `useCallback`**. The helper isn't passed as a prop downstream, so identity stability isn't load-bearing. If/when it leaves MainContent, wrap then.

---

## How to verify

1. `npx tsc --noEmit` → exit 0.
2. `npm run dev` → open the app, then exercise all three paths:
   - **Batch caption (Captioning view → "Caption all visible")**: pick a carousel where some siblings already have manual captions; trigger batch. The anchor's AI caption should fan out to **uncaptioned** siblings only — manual captions preserved. Singles get one AI call each.
   - **Per-card Generate / Regenerate (Captioning view, carousel card footer)**: click on a carousel where siblings have manual captions; the new caption should overwrite all siblings (force=true). Same as before this refactor.
   - **Post-ready "Regen" (post-ready card secondary actions row)**: click; the new caption should overwrite all sibling captions in the post-ready group. Same as before.
3. Search MainContent.tsx for `generatePostContent(anchor)` — should now appear in **exactly one** place outside `fanCaptionToGroup`: the `entry.kind === 'single'` fallback in `batchCaptionImages`. All three carousel fan-outs route through the helper.
