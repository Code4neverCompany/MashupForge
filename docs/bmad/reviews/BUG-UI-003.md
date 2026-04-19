# BUG-UI-003 — "'pi is thinking…' loading while content rendered"

**Status:** done — UX clarification shipped
**Classification:** routine
**Severity:** medium (confusing UX, not broken behaviour)

## Bug as reported

> "Loading indicator visible while content is already rendered."
> Acceptance: "Loading hidden when content loaded."

Screenshot shows the "Suggest Parameters" button in its loading state
(spinner + "pi is thinking…") at the same time as the
**AI-OPTIMIZED PARAMETERS** card below shows two fully-populated
model rows (Nano Banana 2 + Nano Banana Pro, both with style/aspect/
negative prompt populated). Reasonable user read: "the cards are
loaded, why is it still loading?"

## Premise correction — they are two different operations

The "pi is thinking…" button and the AI-Optimized Parameters cards are
**unrelated** code paths:

1. **AI-Optimized Parameters cards** (`MainContent.tsx:1997+`) —
   *auto-preview*. Populated by a debounced `useEffect`
   (`MainContent.tsx:1115`) that calls `enhancePromptForModel` for every
   selected model whenever the prompt or model selection changes.
   `enhancePromptForModel` (`lib/modelOptimizer.ts:41`) is a synchronous
   metadata picker — no network — that cannot fail. So the cards
   appear ~800ms (debounce) after any prompt edit. They reflect the
   **current** local config, not an AI suggestion.

2. **"Suggest Parameters" button** (`MainContent.tsx:1955+`) — calls
   `suggestParametersAI` (`lib/param-suggest.ts:901`) which fires one
   pi.dev call per shortlisted model in parallel, taking real seconds.
   Result lands as a `ParamSuggestionCard` rendered at line 1988
   *between* the button and the auto-preview card — a separate,
   applyable recommendation card.

The button correctly shows loading while pi is in flight. The
auto-preview cards correctly show current settings independently.
Both are working as designed. The bug is that the two flows occupy
the same visual space and the user cannot tell that "loading" refers
to a *new card that hasn't landed yet*, not to the cards already
visible.

Verified `handleSuggestParameters` (`MainContent.tsx:1362`) correctly
toggles `isSuggesting` true/false in a try/finally, so there is no
stuck-loading state — when pi resolves (or rejects, since
`suggestParametersAI` falls back internally to the rule engine and
always resolves), `isSuggesting` flips false and the button reverts
to "Suggest Parameters".

## Fix shipped

Added a loading skeleton card at the **exact position** the
`ParamSuggestionCard` will land, visible only while
`isSuggesting && !paramSuggestion`. The user now sees a placeholder
that says:

> ⏳ pi is generating model recommendations…
> *Auto-preview below stays in sync — this adds an applyable suggestion card here.*

`role="status"` + `aria-live="polite"` so screen readers announce the
state change. Cyan colour matches the existing `Suggest Parameters`
button so the eye links the two.

Once `paramSuggestion` arrives, the existing render path at line 1988
takes over (the `&& !paramSuggestion` guard removes the placeholder
before the real card appears, so there's no flicker).

The visible result of the fix:

1. User clicks "Suggest Parameters" → button shows "pi is thinking…"
2. **NEW**: A cyan placeholder card appears directly above the
   AI-Optimized Parameters block, explaining what's incoming and that
   the cards below are unrelated auto-previews.
3. pi resolves → placeholder disappears, `ParamSuggestionCard` renders
   in the same slot, button reverts to "Suggest Parameters".

This satisfies the acceptance criterion ("Loading hidden when content
loaded") in spirit: the loading indicator is now anchored to the
*specific* content it's loading, and disappears the moment that
content lands.

## Why I didn't change the underlying flow

Considered:

- **Disable auto-preview cards while suggesting.** Would hide useful
  current-state info from the user mid-action. Rejected.
- **Rename button text.** "pi is thinking…" is intentional brand
  voice (consistent with Sidebar pi indicator and other surfaces).
  Cosmetic rename wouldn't actually solve the spatial confusion.
- **Move the auto-preview cards.** They're contextually correct
  below the prompt — moving would create a different problem.
- **Section header re-label.** Ambient header still calls them
  "AI-Optimized Parameters — pi auto-tunes per model" which is
  accurate. Adding a "(live preview)" qualifier could help; deferred
  in favour of the more decisive placeholder card.

## Files touched

### Production
- `components/MainContent.tsx` — inserted ~17 LOC placeholder block
  between the existing `paramSuggestion` render and the auto-preview
  card. No state, no handler changes; only a conditional render.

### Docs
- `docs/bmad/reviews/BUG-UI-003.md` (this file).

## Verification

- `npx tsc --noEmit` → exit 0.
- `vitest run` → 455/455 pass via the pre-commit hook.
- Cannot run dev server visual smoke from WSL; the change is a pure
  conditional render of a div + Loader2 spinner, no logic.
- Behaviour-equivalence: `isSuggesting` and `paramSuggestion` state
  semantics unchanged. The new render branch only appears when both
  conditions hold (`isSuggesting && !paramSuggestion`) and disappears
  the moment either flips.

## Out of scope

- **Threading `signal` through the abort flow** so a user can cancel
  an in-flight suggest call. The plumbing exists (`SuggestParametersAIOptions`
  takes a `signal`) but no UI surfaces a cancel button. Add as
  follow-up if Maurice ever wants to abort long-running calls.
- **Loading indicator on the auto-preview block** while
  `enhancePromptForModel` resolves. It's synchronous and renders in
  ~16ms, so no spinner is needed.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-003","status":"done","summary":"UX clarification shipped. Premise: 'pi is thinking…' button + rendered AI-Optimized Parameters cards = two UNRELATED code paths sharing visual space. Auto-preview cards are populated synchronously by enhancePromptForModel (lib/modelOptimizer.ts:41) on every prompt change via a debounced useEffect — no network. Button calls suggestParametersAI which fires per-model pi.dev calls and lands a ParamSuggestionCard above the auto-preview. Both work as designed; the issue is the user cannot tell that 'loading' refers to a NEW card that hasn't landed yet, not to the visible cards. Verified handleSuggestParameters wraps the call in try/finally so isSuggesting always clears — no stuck state. Fix: added a cyan loading skeleton card at the exact position ParamSuggestionCard will land, visible only while isSuggesting && !paramSuggestion. Says 'pi is generating model recommendations…' + clarifies auto-preview below is unrelated. role=status + aria-live=polite for a11y. ~17 LOC, single conditional render in MainContent.tsx, no state/handler changes. Pre-commit green (455/455). Doc at docs/bmad/reviews/BUG-UI-003.md."}
```
