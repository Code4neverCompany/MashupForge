# BUG-UI-004 — "Both comparison columns tagged LEONARDO"

**Status:** done — render-time resolver shipped
**Classification:** routine
**Severity:** low (cosmetic; data is correct, just an uninformative label)

## Bug as reported

> "Provider tag hardcoded, should be per-model."
> Acceptance: "Correct provider tag per model. Write inbox."

The comparison-history grid renders one column per generation with a
header showing the model name on the left and the provider on the right.
Every column shows `LEONARDO` regardless of which underlying model
(Nano Banana 2 vs Nano Banana Pro vs GPT Image-1.5) produced the image.
Useless distinguisher when scanning history.

## Root cause

Render site: `components/MainContent.tsx:2171`

```jsx
<span className="text-[10px] text-zinc-400 uppercase tracking-widest">
  {img.modelInfo?.provider || 'Provider'}
</span>
```

`img.modelInfo.provider` is hardcoded to the literal string `'leonardo'`
at every generation site:

- `hooks/useComparison.ts:96, 209` — single image + comparison batch
- `hooks/useImageGeneration.ts:574, 748` — pipeline + studio paths
- `components/MainContent.tsx:1558` — video generation

The schema in `types/mashup.ts` has `provider: 'leonardo'` typed as a
literal, so the field is structurally always the broker name. That is
*correct* in one sense — Leonardo.ai **is** the API broker we route
through; the `/api/leonardo/*` endpoints proxy to Leonardo's REST API
which then dispatches to the underlying model. But for a column-header
distinguisher we want the *family* (GEMINI / OPENAI), not the broker.

## Fix shipped

Two changes, no schema break:

### 1. New helper in `types/mashup.ts`

```typescript
export function getModelProviderLabel(modelId: string | undefined): string {
  if (!modelId) return 'LEONARDO';
  const id = modelId.toLowerCase();
  if (id.startsWith('nano-banana') || id.startsWith('gemini-')) return 'GEMINI';
  if (id.startsWith('gpt-image')) return 'OPENAI';
  return 'LEONARDO';
}
```

Resolves on `modelId` (and accepts `apiModelId` variants because
`nano-banana-pro` persists as `gemini-image-2` for some legacy images
— the `gemini-` prefix catches both forms). Unknown ids fall back to
`LEONARDO`, which is at least factually correct (the broker).

### 2. Render site uses the helper

```jsx
<span className="text-[10px] text-zinc-400 uppercase tracking-widest">
  {getModelProviderLabel(img.modelInfo?.modelId)}
</span>
```

`img.modelInfo.modelId` is already populated at every generation site
(it's the `modelId` argument the hooks already pass through), so no
plumbing change required.

### Mapping table

| modelId | apiModelId | Resolves to |
|---|---|---|
| `nano-banana` | `nano-banana` | GEMINI |
| `nano-banana-2` | `nano-banana-2` | GEMINI |
| `nano-banana-pro` | `gemini-image-2` | GEMINI |
| `gpt-image-1.5` | `gpt-image-1.5` | OPENAI |
| anything else | — | LEONARDO |

## Why I didn't change the schema

Per CLAUDE.md routing rules, schema/types.ts shape changes are
**complex** (require a proposal). The literal type
`provider: 'leonardo'` would need to widen to a union or be replaced
with a derived field. That has blast radius:

- Every `modelInfo.provider` read (grep returned 12+ sites)
- Every test that builds a `GeneratedImage` fixture
- Persistence: existing `localStorage`/disk records carry
  `provider: 'leonardo'`, so a stricter union would mean a migration
  shim for old data
- Two adjacent hooks (`useComparison`, `useImageGeneration`) write the
  field with the literal — both would need to compute the new value

The render-time resolver fixes the user-visible problem with one
helper + one one-line render swap, leaves the persisted shape alone,
and keeps backwards compatibility for any image already in storage.
If we ever genuinely need to track provider in the data model
(e.g., for analytics or routing decisions), that's a separate, larger
piece of work — propose it then.

## Files touched

### Production
- `types/mashup.ts` — added `getModelProviderLabel` (~17 LOC,
  self-contained pure function with one early return + two prefix
  checks).
- `components/MainContent.tsx` — extended existing import on line 69
  to include the new helper; replaced the render expression on line
  2171 (1 import LOC, 1 render LOC).

### Docs
- `docs/bmad/reviews/BUG-UI-004.md` (this file).

## Verification

- `npx tsc --noEmit` → exit 0 (helper is exported with explicit
  signature; consumer site is structurally compatible).
- `vitest run` → 455/455 pass via the pre-commit hook.
- Cannot run dev server visual smoke from WSL; the change is a pure
  string-resolver swap with no logic branches beyond two
  string-prefix tests.
- Behaviour-equivalence: persisted `modelInfo.provider` is unchanged,
  no migration needed; only the displayed string changes.

## Out of scope

- **Removing the hardcoded `provider: 'leonardo'` writes at the four
  generation sites.** Could either delete (the field is now ignored
  in the render path) or compute via the helper. Neither is necessary
  for the fix and both touch test fixtures — defer until someone
  cares about the persisted shape.
- **Schema migration to remove the field outright.** Complex per
  CLAUDE.md; would need a proposal.
- **Other render sites** that show provider info (the model card
  badges already use `modelName`, so they're fine; no other
  `modelInfo?.provider` reads in `components/`).

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-004","status":"done","summary":"Per-model provider badge shipped via render-time resolver. Root cause: img.modelInfo.provider is hardcoded to literal 'leonardo' at every generation site (useComparison.ts:96,209; useImageGeneration.ts:574,748; MainContent.tsx:1558 video) and typed as literal in types/mashup.ts — so the comparison column header always reads 'LEONARDO' regardless of underlying model. Decided against schema change (complex per CLAUDE.md, blast radius across 12+ reads, test fixtures, persisted localStorage data). Instead added getModelProviderLabel(modelId) helper to types/mashup.ts that maps nano-banana*/gemini-* → 'GEMINI', gpt-image* → 'OPENAI', else → 'LEONARDO' (broker is factually correct fallback). Swapped the render expression at MainContent.tsx:2171 to use the helper. modelInfo.modelId is already populated at every site so no plumbing change. Persisted shape unchanged → no migration. Pre-commit green (455/455). ~19 LOC across 2 files. Doc at docs/bmad/reviews/BUG-UI-004.md."}
```
