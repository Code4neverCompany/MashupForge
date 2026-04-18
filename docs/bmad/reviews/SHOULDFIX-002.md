# SHOULDFIX-002 — Unify fanCaptionToGroup's two propagation branches

**Status:** done · **Branch:** main · **Classification:** routine

## TL;DR
`batchCaptionImages` had two subtly different carousel paths: the `needsAi=true` branch delegated to the `fanCaptionToGroup` helper, but the `needsAi=false` branch (anchor already has a caption, just propagate to siblings) re-inlined a nearly-identical loop. The divergence survived REFACTOR-001. Teaching the helper to pick "call AI" vs "reuse anchor's caption" internally collapses both paths into one call site.

## What changed

### `fanCaptionToGroup` (single helper now owns both paths)
New rule:
- If anchor has no caption OR caller forces regen → call AI via `generatePostContent`.
- Otherwise → reuse anchor's existing caption + hashtags.

Implementation change is one line:
```ts
const useExisting = !force && !!anchor.postCaption;
const withCaption = useExisting ? anchor : await generatePostContent(anchor);
```
The propagation loop (with the WARN-1 overwrite guard) runs identically in both cases because `withCaption` is a `GeneratedImage` with `postCaption`/`postHashtags` either way.

### `batchCaptionImages` (drops the `needsAi` flag + inline branch)
- `Entry` union no longer has `needsAi`; carousel entries are just `{ anchor, rest }`.
- The dispatch loop collapses from three branches to two:
  ```ts
  if (entry.kind === 'carousel') {
    await fanCaptionToGroup(anchor, entry.rest);
  } else {
    await generatePostContent(anchor);
  }
  ```
- The 9-line inline propagation block is gone.

## Behavior equivalence

| Scenario | Old (needsAi=false inline) | New (helper) |
|---|---|---|
| Anchor has caption, sibling has no caption | Propagate anchor's caption to sibling | `useExisting=true` → propagate anchor's caption to sibling |
| Anchor has caption, sibling already has own caption | Skip sibling (`if (ci.postCaption) continue`) | Skip sibling (`if (!force && ci.postCaption) continue`) |
| Anchor has no caption (needsAi=true) | Called helper → `generatePostContent` + propagate | `useExisting=false` → `generatePostContent` + propagate |
| Regen button (`{ force: true }`) | N/A (only helper callers used it) | `useExisting=false` → AI call; overwrite siblings |

## Acceptance criteria

| Criterion | Status |
|---|---|
| `needsAi=false` branch uses `fanCaptionToGroup` helper | done — inline loop deleted |
| Both paths share identical logic | done — single helper body; source-of-caption decision is a 1-line conditional |
| `tsc` clean | done — `npx tsc --noEmit` exits 0 |
| All 160 tests pass | done |
| Write FIFO when done | pending (this commit) |

## Files touched
- `components/MainContent.tsx` — `fanCaptionToGroup` helper body (+4 / -1 logic, +10 comment), `batchCaptionImages` dispatch loop (-13 lines, -1 type flag)
