---
type: qa-gate
sprint: V080
reviewer: qa
date: 2026-04-26
commits:
  - 854a2a3  # V080-DES-001 onboarding scroll fix + tag pool +24
  - d8ab7a3  # V080-DES-002 "Not scheduled" affordance
  - 3d8c5df  # V080-DES-003 dynamic default agent prompt
  - 4c2098d  # V080-DES-004 auto-name UX polish + test pin
verdict: PASS
confidence: 0.96
---

# QA Gate — V080 Sprint Final

## Gate Verdict: PASS ✅

All four commits pass. Two non-blocking notes below.

---

## Quality Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean |
| `npx vitest run` | ✅ 798/798 (783 baseline + 8 DES-003 + 7 DES-004) |
| `console.log` scan | ✅ None in changed files |
| Unused imports | ✅ None detected |

Test count adds up exactly: 783 + 8 (`agent-prompt.test.ts`) + 7 (`CollectionModal-suggest.test.tsx`) = 798. ✅

---

## Commit 854a2a3 — V080-DES-001: Onboarding Scroll Fix + Tag Pool

**Verdict: PASS**

**Scroll fix (`OnboardingWizard.tsx`):** `min-h-[540px]` → `sm:min-h-[540px]`. One class token. The fix is correct — the floor now only activates at the 640px+ breakpoint where there's room for it. The body's existing `flex-1 overflow-y-auto` and footer's `flex-shrink-0` already handle layout on smaller viewports without the floor. No layout logic touched, no state change.

**Tag pool (`Step2Niche.tsx`):** Purely additive. `CURATED_UNIVERSES` 28→32, `CURATED_GENRES` 20→32. `MAX_SELECTIONS = 10` unchanged — it's pinned by `tests/components/Step2Niche-cap.test.tsx`. The designer review notes "10+ tags" in the AC reads as "at least 10" and the cap was already 10 — this reading is correct.

Risk: Minimal. Two surgical, isolated changes. No side effects to onboarding flow, routing, or data model.

---

## Commit d8ab7a3 — V080-DES-002: "Not Scheduled" Affordance

**Verdict: PASS**

Added a `Clock + "Not scheduled"` pill gated on `kind === 'ready'` in both `PostReadyCard.tsx` and `PostReadyCarouselCard.tsx`. The three-state coverage is now complete and non-overlapping:

| `kind` | Badge rendered |
|---|---|
| `'scheduled'` | `CountdownBadge` (existing) |
| `'ready'` | New "Not scheduled" pill |
| `'posted'` / `'failed'` | Existing status pill only (neither new pill nor countdown) |

Both cards get identical treatment — symmetry maintained across single and carousel paths. ✅

TypeScript compiles clean, which confirms `Clock` was already imported in both files.

**Non-blocking note 1:** `aria-label="Not scheduled"` on a non-interactive `<span>` is semantically redundant — screen readers don't announce `aria-label` on a bare `<span>` unless it has a role. The visible text "Not scheduled" already provides the accessibility signal, so this is harmless but unnecessary. Not a regression, not a blocker.

Risk: Trivial. Two presentational pills, no state or data model change.

---

## Commit 3d8c5df — V080-DES-003: Dynamic Default Agent Prompt

**Verdict: PASS**

**Architecture:** Pure function `buildDefaultAgentPrompt({ niches?, genres? })` extracted to `lib/agent-prompt.ts`. No side effects, no external dependencies.

**Correctness checks:**
- Empty/null/undefined inputs → neutral fallback phrases (`'whichever niche the user is exploring'`, `'across a flexible range of styles'`). ✅
- Long genre lists: `slice(0, 6)` + `"and N more"` — prevents runaway prompt length. ✅
- Reset button reads `settings.agentNiches` / `settings.agentGenres` first, falls back to `DEFAULT_NICHES` / `DEFAULT_GENRES` only when empty. User personalisation is preserved on Reset. ✅
- `RECOMMENDED_NICHES` / `RECOMMENDED_GENRES` re-exported under the same local identifiers so the rest of `SettingsModal` (lines 861, 912…) compiles without churn. ✅

**Test coverage (8 tests in `tests/lib/agent-prompt.test.ts`):** Interpolation of niches and genres, long-list truncation, empty-state fallback, omit-entirely fallback, regression guard against hardcoded franchise names, runtime-override hint present, curated list exports. This is the right set — pins the exact bug that was being fixed.

Risk: Low. New lib file + new test file + single-button refactor in SettingsModal. No call sites in the runtime pipeline changed (those were already injecting live tags correctly).

---

## Commit 4c2098d — V080-DES-004: Collection Auto-Name UX Polish + Tests

**Verdict: PASS**

**UX change (`CollectionModal.tsx`):** Two inputs get a gold-tinted pulsing ring (`border-[#c5a062]/50 ring-1 ring-[#c5a062]/30 animate-pulse`) and "Generating…" placeholder text while `isSuggesting`. Gated cleanly on `isSuggesting` ternary; `transition-colors` on both inputs so the ring fades in/out rather than snapping. Disabled state contract (`disabled={isSuggesting || isCreating}`) unchanged.

**Test coverage (7 tests in `tests/components/CollectionModal-suggest.test.tsx`):**

| Test | What it pins |
|---|---|
| No selection → Suggest hidden | `selectionCount={0}` contract |
| No handler → Suggest hidden | `onSuggest` absent contract |
| Both present → Suggest shown | Gate condition |
| Success → fields populated | Happy path, name + description |
| `null` return → fields empty, no error | Quiet-failure AC |
| Override after suggest | Input stays editable post-suggest |
| In-flight → button disabled | Concurrency / loading state |

The null-fallback test verifies no `role="alert"` and no error text matching `/error|failed|unavailable/i` — correctly pins the AC ("quiet failure, just leave fields empty"). ✅

The in-flight test uses a deferred-resolve Promise to check the disabled state mid-flight, then resolves and verifies re-enable — solid pattern, no reliance on timing. ✅

Risk: Trivial. Two CSS class changes (purely presentational) + new test file.

---

## Non-Blocking Notes

1. **DES-002** — `aria-label` on `<span>` is harmless but semantically redundant. Visible text already covers the accessibility signal. No action required.
2. **DES-001 / DES-004 designer reviews** noted "Full vitest suite deferred to post-batch sweep." Confirmed: 798/798. ✅

---

## Sprint Summary

| Commit | Story | Verdict | Tests added |
|---|---|---|---|
| 854a2a3 | V080-DES-001 | ✅ PASS | 0 (pre-existing cap tests cover the area) |
| d8ab7a3 | V080-DES-002 | ✅ PASS | 0 (presentational — no stateful logic) |
| 3d8c5df | V080-DES-003 | ✅ PASS | +8 (agent-prompt contract) |
| 4c2098d | V080-DES-004 | ✅ PASS | +7 (CollectionModal suggest contract) |

**V080 sprint is release-ready. Gate: PASS.**
