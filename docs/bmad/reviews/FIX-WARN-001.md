# FIX-WARN-001 — Add `ci.postCaption` guard to needsAi=true fan-out

**Why:** QA WARN-1 on BUG-001 — the `needsAi=true` fan-out branch in `batchCaptionImages` unconditionally patched every sibling, overwriting any pre-existing per-image caption. The `needsAi=false` branch already skipped siblings with captions. The two branches were inconsistent.
**Classification:** routine
**Executed:** 2026-04-18 (developer subagent)

## Fix

One-line guard added to `components/MainContent.tsx::batchCaptionImages`, inside the `else` branch (anchor needed AI):

```ts
for (const ci of entry.rest) {
  if (ci.postCaption) continue;   // ← added
  patchImage(ci, {
    postCaption: withCaption.postCaption,
    postHashtags: withCaption.postHashtags,
  });
}
```

Now both branches behave the same: a sibling that already has a caption is left alone. Only uncaptioned siblings receive the freshly generated caption.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Add `ci.postCaption` guard to needsAi=true fan-out loop | ✅ |
| Both branches consistent — skip siblings with existing captions | ✅ |
| `tsc` clean | ✅ — `npx tsc --noEmit` PASS |
| FIFO message on completion | ✅ — sent after this report |

## Diff

`components/MainContent.tsx` — +1 line.

## Notes

- A user explicitly clicking "Regenerate" on a single carousel image is a different code path (per-card button) and is unaffected.
- If the user wants to **force-regenerate** the whole carousel including pre-captioned siblings, that's the per-card "Regenerate" button on the carousel card — also unaffected. Batch caption is now strictly additive: it fills in gaps, it never overwrites.
