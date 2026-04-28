# QA Discovery — AI Smarter: Verification Plan

**Agent:** QA (Quinn)
**Date:** 2026-04-28
**Source brief:** `docs/bmad/briefs/ai-smarter-proposal-designer.md`
**Scope:** What QA needs to verify for each feature area. Not an implementation plan.

---

## Frame

The brief requests a QA eval harness: "did pi actually get smarter?" — before/after metric per alpha feature. This document maps each feature to its verifiable acceptance criteria and identifies what test infrastructure is needed.

---

## Feature A — AI Chat with Memory (Context Rail)

### What changed
- `Sidebar.tsx`: new `<ContextRail />`, `<ContextChip />`, `<MentionPicker />`
- Chat thread + pinned chips persist to IndexedDB (per tab)
- `streamAI` call gains context payload arg
- "↳ Referencing …" banner on replies

### QA must verify

| # | Check | Method |
|---|-------|--------|
| A1 | Context chips render for pinned ideas | Manual: pin idea → confirm chip appears in rail |
| A2 | "↳ Referencing" banner appears in AI reply when chip is pinned | Manual: send message with pinned chip → inspect reply |
| A3 | Chips survive page reload (IDB persistence) | Manual: pin chip → hard reload → chip still present |
| A4 | Unpinning a chip removes it from context payload | Manual + network inspect: unpin → verify payload excludes the idea |
| A5 | Clear-thread button removes all chips and messages | Manual |
| A6 | `@` mention picker opens and resolves to chip | Manual: type `@` in composer → picker appears → select → chip added |
| A7 | Context slot meter is accurate (3/8 = 3 chips of 8 max) | Manual: add 8 chips → meter reads 8/8; add 9th → blocked or oldest evicted |
| A8 | `streamAI` context payload only includes pinned chip IDs, not full data | Security: network inspect — must not leak full image blobs or captions in payload |

**Eval harness metric:** "Does the AI reply change when a chip is pinned vs not?" — test with a fixed prompt sent twice: once bare, once with an idea chip pinned. The reply with chip must reference the pinned idea content. This is the before/after signal.

---

## Feature B — Smart Suggestions With Reasoning ("Why this?")

### What changed
- `ParamSuggestionCard.tsx`: collapsible "Why this?" panel replaces one-liner italic
- Each reason becomes `{text, sourceTag}` objects
- New `<AlternativesPanel />` for "Not this" click (beta)

### QA must verify

| # | Check | Method |
|---|-------|--------|
| B1 | "Why this?" panel renders with ≥1 bullet | Manual: load param suggestions → expand panel |
| B2 | Each bullet has a `sourceTag` pill (`history` / `trend` / `default`) | Manual: inspect pills for all 3 source types |
| B3 | Panel is collapsible — collapsed by default, expands on click | Manual |
| B4 | Existing `ai` / `ai+rules` / `rules` source badge still renders | Regression check |
| B5 | "Apply to N models" button still works after card restructure | Regression |
| B6 | Reason bullets reflect actual data (not placeholder text) | Spot-check: a niche-specific suggestion must cite that niche in bullets |

**Beta gate (when AlternativesPanel ships):**
| B7 | "Not this" click shows 2-3 alternative configs | Manual |
| B8 | Selecting an alternative from the panel applies it and closes panel | Manual |

**Eval harness metric:** User click-rate on "Apply" vs "Not this" after "Why this?" is exposed. Baseline: acceptance rate before feature (unknown — needs analytics hook). Post-ship: track if acceptance rate increases after reasoning is visible.

---

## Feature C — Trending + Web-Aware Ideas

### What changed
- New `<TrendContextCard />` in `Sidebar.tsx` replaces dim `📈 Found trending topics!` line
- New `<TrendPulseStrip />` above `<DailyDigest />` in `IdeasView.tsx` (beta)
- `Idea` type gains optional `trendingTag?: {label, sourceList, capturedAt}`
- 🔥 badge on idea cards; fades after 48h
- New `<TrendContextCard />` renders trending context *before* ideas in Sidebar reply

### QA must verify

| # | Check | Method |
|---|-------|--------|
| C1 | `TrendContextCard` renders before ideas in Sidebar Content reply when trending data exists | Manual: trigger content generation with trending data available |
| C2 | `TrendContextCard` is absent when no trending data returned | Manual: mock empty trending → confirm card not rendered |
| C3 | 🔥 badge appears on ideas generated during a trending window | Manual: generate ideas → inspect cards for badge + tag label |
| C4 | 🔥 badge is absent on ideas older than 48h | Time-sensitive: generate idea → advance clock (or mock `capturedAt`) → badge gone |
| C5 | Source pills (`reddit`, `x`, `news`) render correctly in card | Manual |
| C6 | "Show all sources" expander works | Manual |
| C7 | Old `📈 Found trending topics!` prefix and dim source list no longer render | Regression/removal check |

**Beta gate (TrendPulseStrip):**
| C8 | Pulse strip renders in Ideas Board header with 3-5 trend tiles | Manual |
| C9 | Score bars animate between refreshes | Manual (requires refresh interval to fire) |
| C10 | "Generate ideas from hot topics" CTA seeds generation with selected tiles | Manual |

**Eval harness metric:** "Do users generate more ideas when trending context is surfaced?" — compare ideas generated per session before/after TrendContextCard. Secondary: do ideas with 🔥 badge have higher approval rate than those without?

---

## Feature D — Learning From Outcomes

### What changed
- `PostReadyCard.tsx`: new `<OutcomeRibbon />` (async, appears 24-72h post), `<CaptionAB />` swap
- `components/approval/*`: new `<SkipReasonChips />` in reject flow
- `PipelineView.tsx`: new `<LearningLatelyCard />`
- New `components/learning/` folder with `<DeltaPill />`
- **Hard Dev dependencies:** outcomes store, decision-nudge ledger, skip-reason endpoint

### QA must verify

**Alpha features (no Dev dependency):**

| # | Check | Method |
|---|-------|--------|
| D1 | Skip-reason chips appear when image is rejected in approval flow | Manual: reject image → chips appear |
| D2 | "Skip — don't ask" hides chips for that session | Manual |
| D3 | Chip selection is optional — rejecting without picking a chip still works | Manual: reject → skip chips → image removed without error |
| D4 | Caption A/B: secondary caption variant renders dimmed below primary | Manual: open PostReadyCard → inspect caption section |
| D5 | "Swap" on alt caption promotes it to primary | Manual |
| D6 | Confidence pill shows a % value tied to past caption data | Manual: inspect `[★ 78%]` pill renders and value is not hardcoded |
| D7 | "Why 78%?" rationale text renders on hover or expand | Manual |

**Beta gates (Dev-dependent):**

| # | Check | Dev dependency |
|---|-------|---------------|
| D8 | `OutcomeRibbon` renders 24-72h after post with engagement deltas | Outcomes store (IG insights hydration) |
| D9 | "pi learned" one-line takeaway is present and non-generic | Nudge ledger |
| D10 | Hover ribbon → list of future decisions being nudged | Nudge ledger |
| D11 | `LearningLatelyCard` shows last 3-5 nudges in PipelineView | Decision-nudge ledger |
| D12 | Skip reasons are stored and retrievable (not fire-and-forget) | Skip-reason capture endpoint |

**Eval harness metric (the core ask from the brief):**
- Before/after param acceptance rate: does skip-reason feedback reduce rejected images over time?
- Caption swap rate: what % of users choose the alt caption? (training signal density metric)
- Learning Lately card nudge count: is the ledger growing? (proxy for loop closure)

---

## Cross-Cutting Checks (from Brief §5 Design Principles)

| # | Principle | QA check |
|---|-----------|----------|
| X1 | Reasoning is first-class, not a tooltip | Verify no feature buries reasoning in a tooltip alone — must be visible without hover |
| X2 | All AI surfaces use the same source-tag visual language | Spot-check: `pi`, `history`, `trend`, `default` pills appear consistent across B, C, D |
| X3 | Time is a signal | Verify 🔥 badge fades (C4), OutcomeRibbon only at T+24h (D8), context chips show "remembers since" timestamp |

---

## Infrastructure QA Needs

1. **Clock mocking in Vitest** — needed for 🔥 badge fade (48h) and OutcomeRibbon T+24h gate. Without this, timing tests are manual-only.
2. **Network request inspection** — needed for A4 (context payload audit) and A8 (security). Currently no request-level test helper exists.
3. **IDB test helpers** — A3 requires IndexedDB persistence to be testable. `vitest-localstorage-mock` or `fake-indexeddb` needed.
4. **Analytics event stubs** — eval harness metrics (click-rates, swap-rates) need event emission on key user actions. QA needs to verify the events fire correctly before they can be counted.

---

## Priority Ordering (mirrors brief §6)

| Priority | Feature | QA effort | Blocking infra? |
|---|---|---|---|
| 1 | B: "Why this?" bullets | Low — spot-check only | No |
| 2 | C: TrendContextCard | Low | No |
| 3 | A: Context Rail (ideas only) | Medium — IDB + payload checks | Yes (fake-indexeddb) |
| 4 | D: Skip-reason chips | Low | No |
| 5 | C: 🔥 badge | Low + time-mock | Yes (clock mock) |
| 6 | D: Caption A/B swap | Low | No |
