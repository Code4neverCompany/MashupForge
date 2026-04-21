# Brief — Making MashupForge's AI Feel Significantly Smarter (Designer)

**Author:** Designer subagent
**Date:** 2026-04-20
**Scope:** UX/UI design only — no implementation
**Companion briefs expected from:** Dev (backend/pipeline plumbing), QA (eval harness)

---

## 0. Frame

The current engine is "text in → text out." The user sees:
- a chat bubble with no context memory,
- a param card with a single italic "reason" line,
- an Ideas tab with no signal about *why* something was generated,
- a pipeline daemon that runs forever without ever acknowledging what worked.

None of that *feels* smart, even when the underlying model (GLM-5.1) is. The
design fix is to **surface reasoning, memory, and learning** as first-class UI
objects — not hide them inside prompts.

Four focus areas follow. Each has: the felt problem, an ASCII mockup, the
component delta, and an alpha/beta feasibility call.

---

## A. AI Chat with Memory

### Felt problem
The Sidebar Chat tab (`components/Sidebar.tsx:29-205`) is stateless between
sends. The AI "forgot" three sentences ago. Worse, it can't reference
generated images, ideas on the board, or user settings — even though those
live in the same `MashupContext`.

### Design

Introduce a **Context Rail** above the chat composer. It renders the
entities the AI currently has in its working memory, with chips the user
can pin, unpin, or `@`-mention. This turns invisible context into a
visible, editable artifact.

```
┌── Sidebar · Chat ────────────────────────────────────┐
│ ┌─ Context (pi remembers): ─────────────────────┐    │
│ │  📌 Idea: "Vader as grimdark inquisitor"  [x] │    │
│ │  🖼  Last gen: gothic_cathedral_03.png    [x] │    │
│ │  🎭 Niche: WH40k · Genre: grimdark        [x] │    │
│ │  + add context ▾                              │    │
│ └───────────────────────────────────────────────┘    │
│                                                      │
│  You: make it darker                                 │
│  pi:  ↳ Referencing "Vader as grimdark inquisitor"   │
│       I'd push the palette to oxblood + ash grey…    │
│       [uses 3/8 context slots]                       │
│                                                      │
│ ┌────────────────────────────────────────────┐       │
│ │ Message pi…            @idea @image @niche │ 📤    │
│ └────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────┘
```

Key moves:
- **"pi remembers" header** — plain-English label; never the word "context window."
- **Chips are removable.** User can deliberately forget things, which is
  both a privacy affordance and a cost lever.
- **Pronoun resolution banner** ("↳ Referencing …") under each reply.
  Teaches the user that `it / that / darker` now resolves against pinned
  chips. This is the single highest-leverage cue for "this feels smart."
- **`@` trigger** inside the composer opens a picker of ideas/images/niches
  so users who *want* explicit control get it.
- **Context-slot meter** ("3/8 used") sets expectation that memory is
  finite — avoids the GPT-3-era "why did it forget?" frustration.

### Component changes
- `Sidebar.tsx` — new `<ContextRail />` above the message list, new
  `<ContextChip />`, new `<MentionPicker />` inside the input.
- `streamAI` call (lib/aiClient) needs a second arg for the pinned context
  payload — Dev's problem, flagged here as a hard dependency.
- Persistence: chat thread + pinned chips survive reload (IDB, keyed per
  tab). Clear-thread button top-right.

### Priority & feasibility
- **Alpha:** context chips for *ideas* only (they already exist in state).
  Ship the visible rail + "↳ Referencing" banner. That alone reframes the
  chat.
- **Beta:** image references, niche/genre chips, `@` picker, slot meter.

---

## B. Smart Suggestions With Reasoning

### Felt problem
`ParamSuggestionCard.tsx:239` gives each model one italic line of reason
(`<div className="text-[10px] text-zinc-500 italic pt-1">{sug.reason}</div>`).
It reads like a footnote, not a rationale. Users can't tell *why* grimdark
was picked over watercolor, and there's no way to push back: "no, I want
the other one."

### Design

Promote the reason from footnote to **"Why this?"** collapsible panel per
model, and add an adjacent **"Not this — show alternatives"** action. The
suggestion stops being a verdict and becomes a conversation.

```
┌── Per-Model Smart Suggestions  [pi]  · 3 prior matches ─┐
│                                                         │
│ ▸ Phoenix 1.0  (image)                           [pi]   │
│   Aspect 2:3 · Quality HIGH · Style Cinematic           │
│   ╭─ Why this? ─────────────────────────────────╮       │
│   │ • Your last 3 approved posts used 2:3       │       │
│   │ • Phoenix outperforms Lucid on grimdark     │       │
│   │   (your niche) per 12 past comparisons      │       │
│   │ • Cinematic style matched 2× scheduled wins │       │
│   ╰─────────────────────────────────────────────╯       │
│   [ Not this — show alternatives ]  [ Edit ]            │
│                                                         │
│ ▸ Lucid Origin (image)                           [pi]   │
│   ...                                                   │
│                                                         │
│                                     [ Apply to 2 models ]│
└─────────────────────────────────────────────────────────┘
```

Key moves:
- **Bulleted reasoning, not a sentence.** Each bullet ties to one signal
  (user history, model benchmark, trending data). Three is the sweet spot;
  more feels like an essay.
- **"Not this" flips the card into alternative-ranking mode** — a
  secondary list of 2-3 next-best configs with their own reason bullets.
  One click to swap.
- **Source pills inline with bullets** (tiny `history` / `trend` /
  `default` tags) tell the user which reasons come from their data vs
  heuristic. Builds trust incrementally.
- The existing `source` badge (`ai` / `ai+rules` / `rules`, line 117-132)
  stays — it's actually one of the smartest things on screen and just
  needs company.

### Component changes
- `ParamSuggestionCard.tsx` — collapsible "Why this?" replaces the
  italic one-liner. Each reason becomes a `{text, sourceTag}` object.
- New `<AlternativesPanel />` in-place swap when "Not this" is clicked.
- Parent (`MainContent.tsx:2090-2097`) passes a `fetchAlternatives`
  callback. Dev owns the backend shape.

### Priority & feasibility
- **Alpha:** bulleted reasoning + source pills. Uses data we already
  have (niche, genre, past settings).
- **Beta:** "Not this → alternatives" — needs Dev to expose a second
  ranked suggestion pass from param-suggest.

---

## C. Trending + Web-Aware Ideas

### Felt problem
The Content tab in `Sidebar.tsx:105-126` already fetches `/api/trending`
before generating ideas, but the UI collapses that intelligence into a
single emoji line ("📈 Found trending topics!") and a tiny "Trending
sources" link list at the bottom of the reply. The Ideas Board
(`components/views/IdeasView.tsx`) shows no trending signal at all — once
an idea lands on the kanban, the "why now?" is lost.

### Design

Three coordinated surfaces:

**1. Trend Pulse (Ideas Board header strip)**

```
┌── Ideas Board ───────────────────────────────────────────┐
│ 🔥 Trending right now ·  updated 4m ago  · refresh ↻     │
│  ┌────────────┬────────────┬────────────┬────────────┐   │
│  │ WH40k x    │ Spider-Man │ Dune Pt.3  │ Star Wars  │   │
│  │ Halo       │ × Marvel   │ teaser     │ Outlaws    │   │
│  │ ████░ 87   │ ██░░░ 43   │ ████░ 91   │ ██░░░ 38   │   │
│  │ reddit·x   │ reddit     │ news·x     │ news       │   │
│  └────────────┴────────────┴────────────┴────────────┘   │
│  [ Generate ideas from hot topics ]                      │
└──────────────────────────────────────────────────────────┘
```

- Horizontal pulse of 3-5 trending crossover seeds, each with a score
  bar (0-100) and source pills (reddit, x, news).
- Score animates up/down between refreshes so the board feels alive.
- One-click CTA generates ideas seeded from the selected pulse tiles.

**2. 🔥 badge on idea cards**

```
┌─ [💡 Idea] ──────────────────────┐
│ Vader as grimdark inquisitor     │
│ "Star Wars × WH40k"              │
│ ──────────────────────────────── │
│ 🔥 Hot · #grimdark trending on x │
│ generated 2m ago · [push]        │
└──────────────────────────────────┘
```

Any idea generated inside a trending window keeps a compact 🔥 chip with
the driving tag. The chip fades to grey after 48h — relevance has a
half-life and the UI should say so.

**3. Sidebar Content reply upgrade**

The current Content-tab reply ends with an `📈 Found trending topics!`
prefix and a dim source list. Replace with a **TrendContextCard** that
renders *before* the ideas — so the user sees the reasoning chain
(trends → ideas) rather than just the output.

```
┌─ TrendContextCard ─────────────────────────────┐
│ 📈 I saw these hot right now:                  │
│   • "Fortnite × Marvel crossover"  (x, 12k)    │
│   • "Dune Pt.3 teaser drop"        (news, 8k)  │
│ So I biased the ideas toward timeliness.       │
│ [show all sources]                             │
└────────────────────────────────────────────────┘
[ Idea 1 · 🔥 tied to "Fortnite × Marvel" ]
[ Idea 2 ]
[ Idea 3 · 🔥 tied to "Dune Pt.3" ]
```

Key moves:
- **Trending moves from footer to premise.** Reasoning-first layout.
- **Score bars and source pills** match the param-suggest bullets so the
  visual language of "AI explaining itself" is consistent across the app.
- **Half-life fade** is a small but distinctive cue that the system tracks
  time, not just content.

### Component changes
- New `<TrendPulseStrip />` above `<DailyDigest />` in `IdeasView.tsx`.
- `Idea` type gains optional `trendingTag?: {label, sourceList, capturedAt}`
  — populated by `autoGenerateIdeas` (usePipelineDaemon.ts:247) and by
  Sidebar Content flow (Sidebar.tsx:105+). Dev owns persistence.
- New `<TrendContextCard />` replaces the current trendingSources rail in
  Sidebar.tsx:368-394.
- New idea-card badge in IdeasView (one-line 🔥 chip + auto-fade).

### Priority & feasibility
- **Alpha:** TrendContextCard in Sidebar Content (data already fetched —
  this is pure reformat) + 🔥 badge on ideas generated from the Content
  flow.
- **Beta:** TrendPulseStrip at the top of the Ideas Board. Needs a
  background trend poller + score model. Dev-heavy.

---

## D. Learning From Outcomes

### Felt problem
The pipeline daemon (`hooks/usePipelineDaemon.ts`) is
*open-loop*: idea → generate → caption → schedule → post. Nothing from
the post-side ever flows back. There's no sense that the AI is getting
better at *your* content. Worse, posted-vs-skipped signal is already
sitting in content-status tags (user memory: "generated → captioned →
approved → scheduled → posted") and just isn't surfaced.

### Design

Three learning surfaces. All share a shared visual grammar: **tiny delta
pills** (`2×`, `+34%`, `−12%`) on a blue/green/amber scale, never raw
percentages without a baseline.

**1. Outcome ribbon on posted cards (PostReadyCard)**

```
┌─ Posted · ✓ ────────────────────────────────┐
│ [image thumb]                               │
│ "Vader as grimdark inquisitor"              │
│ ─────────────────────────────────────────── │
│ 📊 3d post-mortem                           │
│  Engagement  2.1×  vs your avg              │
│  Save rate   +34%  vs last 10 posts         │
│  Best hour   Tue 7pm  (you guessed 6pm)     │
│ "pi learned: your grimdark hits at 7pm"     │
└─────────────────────────────────────────────┘
```

- Ribbon appears 24-72h after post (when engagement data stabilises).
- One-line "pi learned" takeaway — this is what converts metrics into a
  *felt* learning moment. Critical.
- Hover the ribbon → short list of which *future* decisions this outcome
  will nudge ("style=Cinematic +1 weight", "post-hour=Tue 7pm +1 weight").

**2. Caption A/B confidence (PostReadyCard caption section)**

When pi generates a caption, show one secondary variant dimmed below the
primary, plus a confidence pill:

```
Caption (primary):  "When the Emperor meets the Emperor…" [★ 78%]
Alt:                 "Grimdark meets grimdark…"          [swap]
Why 78%?  based on 6 past captions with similar hook structure
```

Users *choosing* the alt, not just accepting the primary, is itself
training data. The design must make swapping trivial (one click).

**3. Skip-reason chips (approval flow)**

When a user rejects a generated image in the approval view, a compact
chip row appears:

```
What didn't work?   [ too generic ]  [ wrong aesthetic ]
                    [ faces broken ]  [ off-brand ]  [ other… ]
                    [ skip — don't ask ]
```

- Optional — never blocks. The "skip — don't ask" escape hatch prevents
  chip fatigue.
- These are the single most valuable signal for making param-suggest
  smarter, because negative feedback is what's missing today.

**4. "Learning Lately" card on the Pipeline view**

A small card in PipelineView showing the last 3-5 nudges pi has applied
to its own behaviour — proof the loop is closed.

```
┌── pi is learning ─────────────────────────┐
│ Last 7d, I've shifted based on your posts:│
│  • Cinematic style +18%  (3 wins)         │
│  • Watercolor style −22%  (2 skips)       │
│  • Tue 7pm weight +12%                    │
│  [ see full journal ]                     │
└───────────────────────────────────────────┘
```

This is the component that does the most psychological work. It turns an
abstract "AI is smart" promise into something the user can *watch happen*.

### Component changes
- `components/postready/PostReadyCard.tsx` — new `<OutcomeRibbon />`
  (async-hydrated from IG insights), `<CaptionAB />` swap control.
- `components/approval/*` — new `<SkipReasonChips />` inline in the
  reject flow.
- `components/views/PipelineView.tsx` — new `<LearningLatelyCard />`.
- Shared: `<DeltaPill value, baseline />` primitive lives in a new
  `components/learning/` folder. Used in A, B, and D.
- **Hard dependencies on Dev:**
  - outcomes store (what got posted, when, engagement at T+24/72h)
  - decision-nudge ledger (which suggestion weights changed and why)
  - skip-reason capture endpoint

### Priority & feasibility
- **Alpha:** skip-reason chips (cheap, pure UI, immediately useful data
  capture) + caption A/B swap (already have two prompts' worth of output
  in most caption flows).
- **Beta:** OutcomeRibbon (needs engagement hydration) + LearningLately
  card (needs the decision-nudge ledger).
- **Post-beta:** the ledger feeds back into param-suggest and the daemon
  auto-generator — closing the loop. That's a Dev/architecture project,
  not a UX one.

---

## 5. Cross-Cutting Design Principles

The four areas share three rules. Enforce them in code review:

1. **Reasoning is a first-class UI object, not a tooltip.** If pi decided
   something, the user can see a bulleted "Why this?" and override it.
   No more italic one-liners.
2. **Every AI surface uses the same source-tag visual language** —
   `pi` / `pi+rules` / `rules` / `history` / `trend` / `default` pills,
   same shape, same palette. Consistency is what makes four separate
   smart behaviours feel like one smart system.
3. **Time is a signal.** Trending has a 🔥 badge that fades. Outcomes
   appear only after T+24/72h. Context chips show a "remembers since"
   timestamp. The absence of time-awareness is one of the loudest
   "dumb AI" tells.

---

## 6. Priority Ranking (what to build first)

Ranked by **user-perceived smartness gain per dev-hour**:

| # | Feature | Area | Alpha? | Why first |
|---|---|---|---|---|
| 1 | "Why this?" bullets on ParamSuggestionCard | B | ✅ | Data exists, one-file change, huge perceived-smartness jump |
| 2 | TrendContextCard (reasoning-first Sidebar reply) | C | ✅ | Reformats data we already fetch, zero backend work |
| 3 | Context Rail chips (ideas only) + "↳ Referencing" | A | ✅ | Unlocks conversational memory; backend = pass pinned ids through |
| 4 | Skip-reason chips in approval flow | D | ✅ | Captures the single most valuable training signal we lack today |
| 5 | 🔥 badge on Ideas generated during trending window | C | ✅ | Tiny UI, closes the loop between Sidebar Content and Ideas Board |
| 6 | Caption A/B swap with confidence pill | D | ✅ | Doubles training-signal density per post |
| 7 | "Not this — show alternatives" on param card | B | ⏭ beta | Needs Dev to expose second-rank pass |
| 8 | OutcomeRibbon on posted cards | D | ⏭ beta | Needs IG insights hydration job |
| 9 | TrendPulseStrip on Ideas Board header | C | ⏭ beta | Needs background trend poller |
| 10 | LearningLately card on Pipeline view | D | ⏭ beta | Needs decision-nudge ledger |

---

## 7. Open Questions for Hermes

- Is the **outcomes store** (D2, D3) in scope for the same initiative, or
  a follow-on? Alpha-viable pieces above don't need it; betas do.
- Should **context chips persist per user account** or per session? User
  memory mentions content-status tags are universal across manual and
  pipeline flows — chat-context probably wants the same universality.
- **Trend poller cadence** (C1): 15 min? Hourly? Affects perceived
  "liveness" of the pulse strip.

## 8. Handoff

On approval of this brief, expected hand-offs:
- **Dev:** backend shapes for (a) context-payload on `/api/pi/prompt`, (b)
  second-rank pass from param-suggest, (c) trending poller + score, (d)
  outcomes store + decision-nudge ledger.
- **QA:** eval harness for "did pi actually get smarter" — need a
  before/after metric per alpha feature.
- **Designer (me):** high-fidelity mocks for top-6 Alpha items, then wait
  on Dev before mocking beta items in detail.
