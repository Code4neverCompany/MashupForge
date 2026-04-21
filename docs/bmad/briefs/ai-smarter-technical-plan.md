# AI Smarter — Technical Plan
**Date:** 2026-04-21  
**Author:** QA Agent  
**Status:** Analysis only — no implementation

---

## Executive Summary

MashupForge's AI layer (pi.dev → GLM-5.1) is architecturally sound but operating well inside its theoretical capability ceiling. The five improvements below are ordered by impact-to-risk ratio. Three are quick wins deployable in Alpha. Two are deep-work items for Beta.

**Alpha scope (2–4 weeks):** Memory via session state, web search injection, feedback loop scaffolding.  
**Beta scope (4–8 weeks):** Full tool use in pi.dev, multi-step reasoning pipeline.

---

## Current Architecture

```
Browser
  │
  ├─ streamAI() / streamAIToString()          lib/aiClient.ts
  │     POST /api/pi/prompt
  │
Server (Next.js route handler)
  │
  ├─ MODE_DIRECTIVES lookup                    app/api/pi/prompt/route.ts
  │     composes system directive + user systemPrompt
  │     → piPrompt(composed_message)
  │
  ├─ pi-client.ts (singleton process)
  │     spawn: pi --mode rpc --no-session --no-tools
  │     protocol: JSONL over stdin/stdout
  │     queue: one request at a time (single-threaded)
  │
  └─ pi.dev (GLM-5.1 via ZAI, or other provider)
        200K context window
        no tools, no session, no memory

Supporting:
  param-suggest.ts ── rule engine + one-ai-call-per-model (parallel)
  usePipelineDaemon.ts ── autonomous idea→caption→schedule loop
  leonardo-api-docs.ts ── model doc slices fed to param-suggest AI
```

**Key constraints identified:**
- `--no-session`: each RPC request is stateless. No built-in memory.
- `--no-tools`: pi cannot call web search, file read, or any native tool.
- Single-threaded queue: concurrent pipeline steps serialize through one pi process.
- System prompt is baked at spawn time (`setUserSystemPrompt` + `BASE_SYSTEM_PROMPT`). Per-request variation goes into the message body via directive prepend — a workaround, not a feature.
- `abort` kills the whole process (only reliable stop mechanism) — concurrent abort during queue draining could strand other callers.

---

## Improvement 1: Enable Tool Use in pi.dev

### What changes if we remove `--no-tools`?

**Current spawn args:**
```
pi --mode rpc --no-session --no-tools --system-prompt "..."
```

**Proposed:**
```
pi --mode rpc --no-session --system-prompt "..."
```
(drop `--no-tools`)

**What tools pi supports natively** (from pi.dev docs / `pi --list-tools`):
- `web_search` — Brave/SerpAPI search, returns snippets
- `read_file` / `write_file` — filesystem access
- `run_command` — shell exec
- `browser` — headless fetch

For MashupForge, only `web_search` is useful. `run_command`, `write_file`, and `browser` are dangerous in an always-on desktop app context.

### Impact on the text-output contract (`streamAI`)

This is the **critical risk** of this improvement.

Currently `dispatchEvent()` in `pi-client.ts` only handles:
- `message_update` → `text_delta` → `onDelta(delta)`
- `agent_end` → `onDone()`

With tools enabled, pi emits additional event types **before `agent_end`**:
```
tool_use_start    { type: "tool_use", name: "web_search", input: {...} }
tool_result       { type: "tool_result", content: "..." }
```

These arrive as `message_update` events with `assistantMessageEvent.type` of `tool_use` or `tool_result` instead of `text_delta`. The current parser ignores them (falls through to the last `if` branch which does nothing for these types) — so **no crash, but the text stream contract is preserved accidentally**.

However, with tool use, pi's `agent_end` arrives **after the tool round-trip**, which can take 2–10 seconds. The existing `PER_IDEA_TIMEOUT_MS = 10 * 60 * 1000` in the pipeline daemon is wide enough, but the param-suggest parallel calls (one per model) have no individual timeout — a stalled tool call could hang one slot indefinitely.

### Can we enable only web_search?

pi.dev does not expose a `--allow-tools web_search` flag in its RPC mode (as of v0.67.6 pinned in `pi-setup.ts`). Tool access is binary: all or none.

**Mitigation:** Add a `--tools-allowlist` feature request to pi upstream. Until then, workaround is to implement web search on our side (see Improvement 2) and keep `--no-tools` on pi.

### Architecture with tools enabled

```
Current:
  piPrompt → text_delta stream → onDelta → yield

With tools:
  piPrompt → [tool_use event] → [tool_result event] → text_delta stream → onDelta → yield
               (transparent to caller — pi handles internally)
```

### Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| `run_command` / `write_file` executed on desktop | Critical | Medium | Keep `--no-tools` until allowlist is available |
| Tool round-trip delays break param-suggest timeouts | High | Medium | Add per-call timeout to `suggestParametersAI` |
| `agent_end` never arrives if tool errors | High | Low | Existing abort mechanism (kill process) still works |
| Non-`text_delta` events corrupt JSON output | Low | Low | Parser already silently drops unknown types |

**Recommendation: DEFER to Beta.** Risk/reward requires a pi version bump that supports `--allow-tools` flag, or we implement our own tool-dispatch layer.

---

## Improvement 2: Web Search in AI Pipeline

### Where to inject

The pipeline has three places where search results would add the most value:

```
Idea generation  ← HIGH VALUE: trending character/crossover awareness
      │
Prompt enhance   ← MEDIUM: "what does this scene look like in real art?"
      │
Caption gen      ← LOW: hashtag trend checking (not worth latency)
```

**Primary injection point: before idea generation.**

Current flow in `usePipelineDaemon`:
```
ideas (manual/existing) → processIdea → generatePrompt → generateImage → caption → schedule
```

Proposed with web search:
```
ideas → [web_search: "trending crossover {fandom}"] → context enrichment → processIdea → ...
```

### How to pass results without bloating prompts

GLM-5.1 has 200K context but pi.dev's effective prompt budget is unknown — the RPC protocol doesn't expose token counts. Strategy:

1. **Summarize first.** Never pass raw search HTML. Run a 2-sentence compress step:
   ```
   GET /api/web-search?q=... → [snippets] → pi summarize → 150-word context blob
   ```

2. **Inject as a context block, not conversation history:**
   ```
   [WEB CONTEXT — 2026-04-21]
   • Spider-Man × Mandalorian gaining traction after Disney+ crossover leak
   • Warhammer Space Marine popularity peak after Amazon show
   ---
   Generate ideas for: {concept}
   ```
   This keeps the context scoped and easy to strip in future turns.

3. **Cache per session.** Search results fetched once per pipeline run are cached in a `useRef` inside `usePipelineDaemon`. No re-fetch per idea.

### Token budget management

```
Budget allocation (estimated for GLM-5.1):
  Base system prompt        ~200 tokens
  Mode directive            ~100 tokens
  Web context block         ~200 tokens (capped)
  Idea generation prompt    ~400 tokens
  ─────────────────────────────────────
  Total input               ~900 tokens

  GLM-5.1 200K context → 0.5% used. No budget pressure.
```

Even if we're wrong by 10×, we have headroom. The real risk is latency, not tokens.

### New API route (Developer is building `/api/web-search`)

```typescript
// Proposed contract
POST /api/web-search
{ query: string, maxResults?: number }
→ { results: Array<{ title: string; snippet: string; url: string }> }
```

**Integration point in `usePipelineDaemon`:** add `fetchWebContext(concept: string)` helper that calls `/api/web-search` then summarizes via `streamAIToString(..., { mode: 'idea' })`. Returns a `string | null`. Pass as `context` parameter to `processIdea`.

### Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Search adds 2–5s per idea, pipeline feels slow | Medium | High | Fetch async, overlap with prior idea processing |
| Search API key cost / rate limits | Medium | Medium | Cache per-session, max 3 searches per pipeline run |
| Irrelevant results pollute prompts | Medium | Medium | Summarize + validate before inject; model ignores bad context |
| `/api/web-search` not available yet | Low | High | Gate with feature flag `WEB_SEARCH_ENABLED` in settings |

**Recommendation: Alpha.** Low blast radius. Can be behind a settings toggle.

---

## Improvement 3: Memory System

### The problem

`--no-session` means every pi call starts fresh. Across a pipeline run of 10 ideas, pi learns nothing from idea #1 that could help idea #10.

### Options compared

| Approach | Complexity | Value | State location |
|----------|------------|-------|---------------|
| **Conversation history in prompt** | Low | Medium | In-memory, per-run |
| **JSON state file** | Low | Medium | `~/.hermes/` or `localStorage` |
| **Vector store** | High | High | External service (Chroma, Pinecone) |
| **pi `--session` mode** | Medium | High | pi's own session file |

### Recommended: lightweight JSON state (session memory)

The lightest approach with real value is a **per-pipeline-run memory blob** injected into each pi call:

```typescript
interface PipelineMemory {
  conceptsUsed: string[];           // avoid repeating mashup concepts
  successfulStyles: string[];       // styles that produced good results
  avoidedNegatives: string[];       // negative prompt patterns that helped
  sessionSummary?: string;          // 2-sentence pi-authored summary of run so far
}
```

**How it works:**
1. `PipelineMemory` initializes empty at run start
2. After each idea succeeds, append its concept + style to memory
3. Before each new idea call, serialize memory into the prompt prefix:
   ```
   [SESSION MEMORY]
   Already generated: Spider-Man × Mandalorian (Dynamic style), Batman × Vader (Ray Traced)
   Avoid: overexposed lens flare, purple chromatic aberration
   ---
   Next idea: ...
   ```
4. After 5 ideas, trigger a pi `summarize` call: compress memory to 2 sentences, reset full list

**Why not `--session`?**  
Pi session mode persists to `~/.pi/agent/sessions/`. On desktop, this interacts with our process singleton in unknown ways — if pi crashes and restarts mid-run, the session may be corrupted. `--no-session` is the safe baseline; we implement memory ourselves so we control the state.

**Why not vector store?**  
Over-engineered for the use case. We have at most 30 ideas per run. Linear string match is sufficient.

### Storage location

`localStorage` key `mashup_pipeline_memory` — consistent with existing `PIPELINE_STORAGE_KEY` pattern. Cleared at run start. No disk I/O required.

### Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Memory prompt grows unbounded across long runs | Medium | Medium | 5-idea summarize cycle caps growth |
| Stale memory from previous run bleeds in | Low | Low | Always clear on new run start |
| Memory summary itself fails | Low | Low | On error, fall back to raw list truncated to 10 items |

**Recommendation: Alpha.** Minimal implementation (no summarize cycle) can ship in a day. Summarize cycle is polish.

---

## Improvement 4: Multi-Step Reasoning Pipeline

### GLM-5.1's long-horizon capability

GLM-5.1 is rated for 8-hour / 600-iteration agentic tasks. MashupForge currently uses it for single-shot prompts (one call per step). We're not using its chain-of-thought capability at all.

### Proposed pipeline: generate → evaluate → refine → select → caption → schedule

```
Current:
  idea → [1× pi: enhance prompt] → generate image → [1× pi: caption] → schedule

Proposed (multi-step):
  idea
    │
    ├─ [pi: generate 3 prompt variants]    ← one call, returns JSON array
    │
    ├─ [leonardo: generate 3 images]       ← parallel, existing
    │
    ├─ [pi: evaluate images] ─────────────── NEW: "which is best and why?"
    │     uses image URLs + prompt context
    │
    ├─ [pi: refine winner prompt] ─────────── NEW: "improve based on eval"
    │
    └─ [leonardo: generate refined image]
         │
         └─ caption → schedule
```

**Net result:** 2 extra pi calls per idea, 1 extra Leonardo generation. Quality ceiling rises significantly.

### Implementation notes

**Prompt variants:** Change `generatePrompt` to request JSON array of 3 prompts instead of 1 string. Parser already handles JSON extraction via `extractJsonArrayFromLLM`.

**Image evaluation:** pi.dev can receive image URLs in the prompt text. GLM-5.1 is multimodal (see `getPiModels()` — `images: true` column). The eval call would be:
```
Review these 3 generated images [url1] [url2] [url3].
Prompt used: {prompt}
Which has the best composition, lighting, and concept clarity? Return JSON:
{ "winner": 0|1|2, "reason": "...", "improve": "..." }
```

**Pipeline integration:** `usePipelineDaemon` calls `processIdea` from `lib/pipeline-processor.ts`. The evaluate+refine steps would live inside `pipeline-processor` as optional stages gated by a settings flag `enableMultiStep: boolean`.

**Timeout concern:** Each extra pi call adds ~3–8s. A 10-idea run with multi-step adds ~1.5–2 minutes. `PER_IDEA_TIMEOUT_MS = 10 min` absorbs this, but the daemon's `pipelineInterval` default (120s between runs) may need review.

**Queue serialization:** The pi-client serializes all calls through one queue. Multi-step means more queue depth but no parallelism change — the queue handles it correctly as long as we don't parallelize evaluate + refine (they're sequential by design).

### Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| 2× Leonardo credits per idea | High | Certain | Gate with `enableMultiStep` toggle, off by default |
| Eval call sees wrong image (URL mismatch) | Medium | Medium | Pass explicit `(imageId, url)` pairs in eval prompt |
| GLM eval is wrong / inconsistent | Medium | Medium | Accept: "best of 3" beats "random 1 of 3" even if imperfect |
| Per-idea time doubles (10 ideas = 20+ min runs) | Medium | High | Show per-step progress in existing `pipelineProgress` UI |
| Adds complexity to already-complex pipeline | Low | Certain | Keep behind `enableMultiStep` flag; existing path untouched |

**Recommendation: Beta.** High value but high credit cost. Needs a credit budget UI before shipping to users.

---

## Improvement 5: Feedback Loop

### What to track

```typescript
interface ImageOutcome {
  imageId: string;
  generatedAt: string;          // ISO8601
  promptStyle: string;          // style used
  modelId: string;
  posted: boolean;
  postedAt?: string;
  engagementScore?: number;     // from Instagram API
  skippedReason?: 'manual' | 'auto-rejected' | 'expired';
}
```

### Where to collect

**Post events** already flow through `approveScheduledPost` / `rejectScheduledPost`. Both functions are pure mutations on `ScheduledPost[]` state in `useImages`. Adding outcome recording here is safe:

```typescript
// In approveScheduledPost — record "this image was approved for posting"
recordOutcome(post.imageId, { posted: true, approvedAt: now() });

// In rejectScheduledPost — record "this image was skipped"
recordOutcome(post.imageId, { posted: false, skippedReason: 'manual' });
```

**Engagement data** is already fetched by `smartScheduler.ts` (`fetchInstagramEngagement`). After a post goes live, we can correlate `post.id` → engagement score via the Instagram Graph API's media insights endpoint. This is a batch job, not real-time.

### How to feed back into generation

Short loop (Alpha): After recording `N=10` outcomes, compute:
- `topStyles`: styles with highest post rate → bias next pipeline run's style suggestions in `param-suggest`
- `topModels`: models whose images get approved most → increase their weight in model shortlisting

This feeds into `param-suggest.ts` via a `FeedbackHints` parameter alongside existing `RuleHints`.

Long loop (Beta): Engagement scores from Instagram → weight prompt patterns that drove clicks. Requires Instagram business API access (already configured via `INSTAGRAM_ACCOUNT_ID` / `INSTAGRAM_ACCESS_TOKEN`).

### Privacy / data considerations

- All data stays local (localStorage or app-local DB). No telemetry.
- Instagram engagement data is already fetched by `smartScheduler` — no new API permissions needed.
- `engagementScore` is a simple like count from our own account's posts. No third-party data.
- Opt-in only: default off. Setting key `FEEDBACK_LOOP_ENABLED` in `DESKTOP_CONFIG_KEYS`.

### Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Outcome storage grows unbounded | Low | Medium | Cap at 200 entries, rotate oldest |
| Feedback biases toward one style permanently | Medium | Low | Decay factor: older outcomes weighted less |
| Instagram API rate limit on insights | Low | Low | Batch fetch once per day, cache results |
| User doesn't want app tracking outcomes | Low | Medium | Default off, clear disclosure in Settings |

**Recommendation: Alpha scaffold, Beta full loop.** Record outcomes in Alpha (zero risk, pure logging). Compute feedback signal in Beta after we have enough data to validate it works.

---

## Implementation Order

```
ALPHA (2–4 weeks)
─────────────────────────────────────────────────────────
Week 1:  Memory system (session JSON, per-run context block)
         Risk: LOW | Value: MEDIUM | Effort: 1 day

Week 2:  Web search injection (after /api/web-search lands)
         Risk: LOW | Value: HIGH  | Effort: 2 days
         Dependency: Developer's /api/web-search route

Week 3:  Feedback loop scaffold (outcome recording only)
         Risk: NONE | Value: LOW now, HIGH later | Effort: 1 day

Week 4:  Integration testing, polish, settings toggles for all three

BETA (4–8 weeks)
─────────────────────────────────────────────────────────
Week 5–6: Multi-step reasoning pipeline
          Risk: HIGH (credits) | Value: HIGH | Effort: 1 week

Week 7:   Feedback signal → param-suggest integration
          Dependency: 10+ runs of outcome data

Week 8:   Tool use in pi.dev (requires pi version with --allow-tools)
          Risk: MEDIUM | Value: MEDIUM | Effort: 3 days + pi version bump
```

### Quick wins (can ship this week)

1. **Session memory** — 50 lines in `usePipelineDaemon` + `lib/pipeline-memory.ts`. Zero external dependencies.
2. **Feedback outcome recorder** — 20 lines in `useImages`. Zero UI changes needed initially.

### Deep work (Beta only)

1. **Multi-step pipeline** — touches `pipeline-processor.ts`, adds 2 pi call stages, new Leonardo credit exposure. Needs credit budget UI first.
2. **Tool use** — blocked on pi upstream adding `--allow-tools` or we build our own tool-dispatch proxy.

---

## ASCII Architecture — Target State (Beta)

```
Browser
  │
  ├─ streamAI() / streamAIToString()
  │     POST /api/pi/prompt
  │
  ├─ POST /api/web-search  ← NEW (Developer building)
  │
Server
  │
  ├─ /api/pi/prompt
  │     MODE_DIRECTIVES + systemPrompt + [WEB CONTEXT] + [SESSION MEMORY]
  │     → piPrompt()
  │
  ├─ /api/web-search ← NEW
  │     → Brave/SerpAPI → summarize via pi → context blob
  │
  ├─ pi-client.ts (singleton, --no-tools still)
  │     JSONL queue, one request at a time
  │
  └─ pi.dev (GLM-5.1)
        200K context, no native tools

Pipeline (usePipelineDaemon → pipeline-processor)
  │
  ├─ fetchWebContext(concept)         ← NEW (web search)
  ├─ buildSessionMemory(priorIdeas)   ← NEW (memory)
  ├─ generatePromptVariants(3)        ← NEW (multi-step Alpha)
  ├─ evaluateImages(urls, prompts)    ← NEW (multi-step Beta)
  ├─ refineWinnerPrompt()             ← NEW (multi-step Beta)
  ├─ recordOutcome(imageId, result)   ← NEW (feedback loop)
  └─ [existing] caption → schedule

Feedback Store (localStorage)
  ├─ ImageOutcome[]    (capped 200)
  └─ FeedbackHints     (computed: topStyles, topModels)
       └─ feeds into → param-suggest.ts suggestParameters()
```

---

## Test Strategy

### Per-improvement test approach

| Improvement | Test type | Location |
|-------------|-----------|----------|
| Memory | Unit — pure function tests on `buildSessionMemory`, `compressMemory` | `tests/lib/pipeline-memory.test.ts` |
| Web search | Integration — mock `/api/web-search`, verify context injection | `tests/integration/web-search-context.test.ts` |
| Feedback loop | Unit — outcome recording, rotation, decay | `tests/lib/feedback-loop.test.ts` |
| Multi-step | Integration — mock pi responses, verify evaluate→refine→select flow | `tests/integration/multi-step-pipeline.test.ts` |
| Tool use | Manual only — requires live pi process with tool flag | `docs/bmad/qa/tool-use-manual-checklist.md` |

### Regression surface

All improvements are **additive behind feature flags**. The existing 567-test suite covers the current pipeline paths. New tests cover only the new paths. Feature flag off = existing behavior = existing tests pass.

**Required regression check after each Alpha item:**
```
npx vitest run   →  567+ tests pass
```

### What cannot be unit-tested

- pi.dev tool call round-trips (live process required)
- Instagram engagement score correlation (requires production data)
- Multi-step image eval quality (subjective — needs human review session)

---

## Alpha vs Beta Scope Summary

| Feature | Alpha | Beta | Blocker |
|---------|-------|------|---------|
| Session memory | ✓ | — | None |
| Web search context | ✓ | — | /api/web-search route |
| Feedback outcome recording | ✓ | — | None |
| Feedback → param-suggest signal | — | ✓ | 10+ runs of data |
| Multi-step reasoning (variants + eval + refine) | — | ✓ | Credit budget UI |
| Tool use in pi.dev | — | ✓ | pi --allow-tools flag |

**Alpha ships a meaningfully smarter pipeline** (contextual awareness + memory + outcome tracking) with zero breaking changes and no new external dependencies beyond the web search route Developer is already building.

**Beta ships the quality ceiling raise** (multi-step reasoning) and the full feedback loop — the two changes that require the most careful rollout given credit exposure and data dependency.
