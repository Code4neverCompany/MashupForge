# WORKFLOW-UPGRADE-DESIGN — Research + Design Brief for 4neverCompany Agent Fleet

**Author:** Developer (standing in for Designer)
**Date:** 2026-04-22
**Task:** `/tmp/hermes-task-designer.txt` — research 5 topics, propose applications for the HERMES fleet
**Target reader:** Hermes (orchestrator) + Maurice
**Design goal:** Reduce Maurice's input burden. The system should be self-explanatory — he should not have to poll `task-board.json`, remember which agent owns what, or re-brief agents after restarts.

---

## Why this document exists

The HERMES fleet has grown: Hermes (orchestrator), Developer, Designer, vault-keeper, QA, claude-code, plus a cron-driven tick/queue/state layer under `~/.hermes/`. It works, but the visible interface for Maurice is:

- `cat ~/.hermes/subagents/developer/task-board.json`
- `tmux attach` to watch an agent scroll
- `cat ~/.hermes/inbox.jsonl | tail`
- Ad-hoc `memory.md` reads

Prior incidents that motivate this brief:
- **STORY-021/022/023** — stub-story pattern: 3 of 4 filed with just a `why` line, all had to be lifted as proposals (role/scope clarity gap, see PROP-005).
- **Designer ownership transfer** — Gemini CLI Designer agent was unreliable on `MainContent.tsx` (hallucinated edits), Maurice manually reassigned UI work to Developer. No system-level signal prevented it.
- **14 unpushed commits** on developer's main branch (as of 2026-04-21) — visibility lag between "Developer says done" and "work is on origin."
- **PROP-010 dual-store settings** — stuck in proposals.md awaiting Hermes decision with no escalation prompt.

These are not bugs in any one agent. They are gaps in the **orchestrator surface** between Maurice and the fleet. This doc maps five design areas onto concrete HERMES upgrades.

---

## Executive summary — five upgrades, ranked by input-burden ROI

| # | Upgrade | Replaces | Input burden cut |
|---|---------|----------|------------------|
| 1 | **Unified fleet dashboard** (web or TUI) with per-agent status lanes | Manual `cat task-board.json` polling | HIGH |
| 2 | **Role cards** + explicit capability/boundary manifest per agent | Implicit tribal knowledge in CLAUDE.md | HIGH |
| 3 | **Approval queue UI** with full-context one-tap decisions | `proposals.md` scroll + manual decision merging | HIGH |
| 4 | **Vault-graph side-panel** (Obsidian MCP integration) wired into dashboard | Agents re-discovering context each session | MEDIUM |
| 5 | **Kanban state machine** per agent (LangGraph-style checkpoints) | Free-form queue files with no progress signal | MEDIUM |

The common thread: **move the orchestration surface from files-in-a-directory to a single rendered view.** File layout can stay (agents still read/write JSON/Markdown); what changes is Maurice's read path.

---

## Topic 1 — Multi-agent dashboard patterns

### What production systems do in 2026

Observed across the Composio agent-orchestrator, Addy Osmani's "Code Agent Orchestra" writeup, MIT Technology Review's agent-orchestration piece, and the Antigravity multi-agent setup docs:

- **Worktree-per-agent.** Each agent runs in its own git worktree + branch + PR surface. The dashboard shows one lane per agent and merges happen via PR review, not direct commits.
- **Shared workspace, isolated context.** Agents see the same files but each has its own conversation history. The human is the router — agents do NOT message each other directly.
- **Status-first layout.** Dashboards open on a port and surface, at a glance: which agents are running, what each is doing right now, and which ones need attention. Idle/busy/blocked/done are the four visible states.
- **Reactions handle feedback.** CI failures and review comments get auto-routed back to the spawning agent without human re-dispatch.
- **Real-time outcome monitoring** — agent decisions tied to business metrics in the same view.

### Concrete visual patterns

- **Lane layout** — horizontal lanes (one per agent), each showing current task card + last 3 completed cards. Compact. Scannable in under 3 seconds.
- **Status dot + ETA** — green/yellow/red/grey, plus "running 00:04:17" for in-flight tasks.
- **Notification badge** per lane — count of items waiting on Maurice.
- **Cross-lane flow arrows** — when agent A escalates to Hermes, or Hermes dispatches to agent B, render an arrow between their lanes. Makes the flow legible.

### HERMES application

Build `~/.hermes/dashboard/` as a single static HTML page (or TUI) that reads:

- `~/.hermes/subagents/*/task-board.json` — per-agent completed + in-flight
- `~/.hermes/agent-state/*.json` — heartbeat, status, idle_since
- `~/.hermes/queues/*.json` — pending work
- `~/.hermes/inbox.jsonl` — cross-agent envelopes (tail last N)
- `~/.hermes/proposals.md` — escalations awaiting decision

Render as five lanes (Hermes / Developer / Designer / vault-keeper / QA) × three rows (in-flight / waiting-on-human / recently-done). One glance replaces six `cat` commands.

**Phase 1** — TUI version using `~/.claude/statusline.sh`-style polling (no server, no dependencies).
**Phase 2** — Next.js `/dashboard` route inside a MashupForge-adjacent tool, or a standalone tiny Tauri app, with WebSocket live updates from a `chokidar` watcher on `~/.hermes/`.

**Input-burden delta:** Maurice stops running `cat` commands. He opens one pane.

---

## Topic 2 — Agent identity and role clarity

### What the 2026 UX literature says

From NNGroup "State of UX 2026", UXDesign.cc "AI agent doesn't know your product", Design Monks' AI UX Designer Roadmap, and Smashing Magazine's career-path piece:

- **Delegation boundaries are a design artifact, not a vibe.** The line between "agent decides on its own" and "human approves" must be written down, per-agent, per-action class.
- **Specialization drives reliability.** Narrowly-scoped agents (AI UX Designer, AI Interaction Designer, Prompt Engineer) outperform generalists because context is smaller and failure modes are known.
- **Trust requires four levers** — transparency (show reasoning), control (explicit override), consistency (same action → same outcome), support (graceful failure recovery).
- **Role titles are UX.** "Developer" vs "Designer" vs "vault-keeper" is not just organizational — it's the first signal Maurice gets about which agent should handle a task.

### Concrete patterns

- **Role card** — a one-screen artifact per agent: identity, scope, can-decide list, must-escalate list, owned files/directories, typical input, typical output. Physical analog: baseball card.
- **Specialization matrix** — a shared grid listing task categories × agents with ✅/❌/🤝 (owns / avoids / collaborates). Maurice glances at this before assigning a task.
- **Handoff contract** — explicit format for agent-to-agent passing: what inputs the receiver expects, what outputs the sender must produce.

### HERMES-specific symptoms to fix

- `CLAUDE.md` has a Developer manifest but no Designer/vault-keeper/QA equivalents at the same fidelity — roles are asymmetric.
- Designer ownership collapse (Gemini CLI hallucinations on `MainContent.tsx`) would have been caught earlier if there was a **capability boundary** saying "Designer may not edit files over 2000 LOC without Hermes sign-off."
- `developer/memory.md` says "Maurice transferred ALL UI/design ownership to Developer" — this is a role drift that should have been a first-class event, not a memory note buried in a markdown file.

### Recommended deliverables

1. **`~/.hermes/roles/<agent>.md`** — one role card per agent, same schema. Agents read their own on every session start (they already do this for CLAUDE.md). The dashboard renders them as tooltips.
2. **`~/.hermes/specialization-matrix.md`** — grid of task categories × agents. Hermes consults before dispatching.
3. **Handoff envelope schema** in `inbox.jsonl` — every envelope carries `{from, to, task, expected_inputs, expected_outputs, ts}`. vault-keeper already does this informally; formalize it.
4. **Boundary assertions** in each agent's CLAUDE.md — explicit `must_escalate_when:` list (e.g. "config file touch", "dep add", "cross-file refactor > 3 files"). Developer already has this under "Routing classification" — copy the pattern to Designer / vault-keeper / QA.

**Input-burden delta:** Maurice stops having to say "this is Designer work, go ask Designer." The fleet routes itself because the matrix is written down.

---

## Topic 3 — Communication UX between human and agent fleet

### What HITL literature says in 2026

From Strata.io "Human-in-the-Loop 2026 Guide", Elementum AI, CrewAI HITL docs, MyEngineeringPath, and AllDaysTech "AI Review Queues":

- **The review interface is a product, not an afterthought.** The single most common failure: a textarea and a yes/no button with no context, leading to rubber-stamp approvals or review fatigue.
- **Approval queues need four things** — proposed action, context, agent's reasoning, one-tap decision affordance.
- **Escalation is first-class.** Agents should escalate on three triggers: stuck (no progress for N minutes), lacks permissions (tried and failed), or uncertain (confidence under threshold). Escalation routes to the right human via Slack / email / in-app.
- **Minimal input ≠ minimal context.** Pre-load everything the reviewer needs in the notification itself. One-tap decision, full context attached.
- **Expertise-based routing** — medical decisions go to clinicians, legal to counsel, code to devs. Cross-domain escalations get rejected or re-routed, never silently auto-approved.

### Concrete visual patterns

- **Approval card** — full-width card with:
  - Header: agent name, task ID, proposed action in one sentence
  - Body: rendered diff (code) or image preview (design) or text summary (research)
  - Reasoning: 2-3 bullet rationale from the agent
  - Footer: three buttons — Approve / Approve-with-edits / Reject-with-reason. Hotkeys `a` / `e` / `r`.
- **Escalation feed** — time-ordered stream in the dashboard, most recent on top, same card schema.
- **Context attachments** — every escalation includes links/blobs: relevant files, related proposals, prior decisions on the same topic.
- **Decision memory** — when Maurice approves/rejects, the decision + rationale is stored so the next time a similar item comes up, the agent can cite precedent.

### HERMES-specific gaps

- `proposals.md` today is a 500+ line markdown file. Maurice has to scroll to find `Status: pending` items. There is no notification when a new proposal is added.
- `inbox.jsonl` is append-only; there is no read receipt or decision surface.
- `standup.sh` surfaces stale pending proposals (>24h) but only Maurice can run it and only if he remembers.
- No "approval hotkey" — every decision requires typing a full sentence in tmux or Claude.

### Recommended deliverables

1. **Proposal envelope upgrade** — every `question` envelope in `inbox.jsonl` must carry a `proposal_id`, a `context_bundle` (array of file paths/excerpts), a `recommended_action`, and a `rollback_hint`.
2. **`~/.hermes/escalations/` directory** — one file per open escalation, deleted on decision. The dashboard reads this dir and renders each file as an approval card.
3. **Decision log** — `~/.hermes/decisions.jsonl`, append-only record of every Maurice decision with `{proposal_id, decision, rationale, ts}`. Agents cite this when proposing similar items (e.g. "similar to PROP-005 which you approved on 2026-04-15 — OK to proceed with same pattern?").
4. **Notification routing** — `tmux display-message` for fast-path, optional Slack/email webhook for when Maurice is away.
5. **One-tap hotkeys** in the dashboard for `a`/`e`/`r` per card. Minimal-input is the whole point.

**Input-burden delta:** Maurice reviews a stack of cards, hits `a` or `r` on each, never reads a 500-line markdown file again.

---

## Topic 4 — Knowledge management UI patterns (vault/Obsidian integration)

### What the 2026 ecosystem shows

From Engraph (local knowledge graph for AI agents), Claude-Obsidian, Obsilo, Morph's Obsidian MCP server, and bitsofchris "AI Agents From Obsidian Notes":

- **Five-lane hybrid search is the baseline.** Semantic embeddings + BM25 full-text + graph expansion + cross-encoder rerank + temporal scoring. Single vector search is no longer enough.
- **MCP-exposed vault tools** — 20-30 tools: search, read, section-level edit, frontmatter mutate, vault health check, context bundle build, note creation, PARA migration.
- **Wiki skill as orchestrator** — one special agent (vault-keeper) owns the vault lifecycle: ingests new sources, generates/updates pages, maintains hot cache, runs lint, files discoveries.
- **Graph awareness** — agents see backlinks, Dataview queries, outgoing links. Context is the subgraph, not the single file.
- **Temporal decay** — recent notes weigh more than old ones unless explicitly pinned.

### Concrete visual patterns

- **Side-panel vault view** — always-visible panel in the dashboard showing: last 5 edited notes, top 5 most-linked notes, current hot-cache entries.
- **"This task's context" bundle** — for any running task, render the ~5 vault entries most relevant to it. Same bundle gets passed to the agent as its context.
- **Lint-report badge** — vault-keeper surfaces broken links, duplicate pages, stale status:active notes as a badge count. One click to the lint report.
- **Decision ↔ note linking** — when a PROP is approved, vault-keeper files a note. The dashboard shows bidirectional links.

### HERMES-specific state

vault-keeper is already running and just filed its first full lint+fix pass (commit `35b93fa`, 74 entries, 44 TLDRs added, 3 archived duplicates, 6 broken links fixed). `hot.md`, `raw/.manifest.json`, and `meta/lint-report-2026-04-21.md` exist. Infrastructure is there. What's missing is visibility.

### Recommended deliverables

1. **Vault API endpoint** — a tiny local HTTP server (or MCP server) that exposes `get_hot_cache`, `get_recent`, `get_subgraph(topic)`, `get_lint_report`. All agents query it; Maurice's dashboard queries it.
2. **Context bundle helper** — when Hermes dispatches a task, it asks the vault API for a relevant subgraph and includes it in the envelope. Developer/Designer/QA stop re-discovering project context each session.
3. **Vault panel in dashboard** — real-time: hot cache size, staleness count, lint health. A green/yellow/red vault-health dot.
4. **Note-per-decision convention** — vault-keeper files a note on every approved PROP, every shipped STORY, every incident. Future agents citing precedent get a real link, not a file-line reference that rots.

**Input-burden delta:** Agents stop asking Maurice "where is X documented?" — the vault answers.

---

## Topic 5 — Workflow state visualization

### What LangGraph, CrewAI, AutoGen teach

- **LangGraph** — graph-based workflow with explicit nodes + edges, built-in checkpointing, time-travel debugging, LangSmith observability. Highest production readiness of the three.
- **CrewAI** — role-based agents passing task outputs sequentially. Cleaner for human-intuitive team structures. Less visual.
- **AutoGen** — conversations between agents. Good for exploratory work, weak for auditable state.

Common industry takeaway: **teams prototype in CrewAI and migrate to LangGraph** when they need production state management, checkpoint recovery, and visual debugging.

### Concrete visual patterns

- **DAG view** — render the task graph with nodes as tasks, edges as dependencies/handoffs. Current node highlighted. Completed nodes dimmed.
- **Checkpoint timeline** — horizontal timeline showing every checkpoint for a task; click to see state at that point. Time-travel debugging.
- **Kanban columns** — Backlog / Queued / Running / Blocked / In-Review / Done. One card per task. Agents auto-move cards; Maurice drags only when overriding.
- **WIP limits** — configurable per-column. Developer's existing `completed_this_period >= 10` daily cap is a WIP limit — make it visible.
- **Swimlane per agent** — cards stay in the agent's lane as they move across columns.

### HERMES-specific state

Today's state storage:
- `~/.hermes/agent-state/<agent>.json` — heartbeat, status, idle_since, completed_this_period
- `~/.hermes/queues/<agent>.json` — pending work
- `~/.hermes/subagents/<agent>/task-board.json` — historical completed
- `~/.hermes/proposals.md` — escalated items

Five files per agent, no visualization. The data is there; the rendering is missing.

### Recommended deliverables

1. **State schema normalization** — pick one of the four JSON/MD files per agent as authoritative. Developer currently has both `task-board.json` and a (missing) `~/.hermes/queues/developer.md` — consolidate.
2. **Kanban renderer** — the dashboard from Topic 1 gets a second tab: Kanban view. Same data source, different layout. Columns: Queued / Running / Blocked / Awaiting-Decision / Done-Today / Done-Past.
3. **Checkpoint log per task** — agents append to `~/.hermes/checkpoints/<task-id>.jsonl` at key moments (start, halfway, blocked, resumed, done). The dashboard lets Maurice scrub this timeline.
4. **WIP limits surfaced** — Developer's 10/day cap rendered as a gauge. When Developer hits the cap and goes idle, the dashboard shows it as a visible state, not a silent note buried in `state.json`.
5. **Graph view** for proposals — render `proposals.md` as a DAG: PROP nodes colored by status, edges for "blocks" / "depends-on" / "supersedes". Today the dependency graph is only in an ASCII block at the end of `research-proposals-009-019.md`.

**Input-burden delta:** Maurice sees at a glance what's stuck, what's at the WIP cap, what's waiting on him. He never has to reconstruct state from three JSON files.

---

## Cross-cutting recommendations

Beyond the five topics, three patterns surface in every one of them.

### A. One render surface, many data sources

The dashboard is the single render surface. All five upgrades feed into it:

- Topic 1 → lane layout + status dots
- Topic 2 → role-card tooltips + matrix tab
- Topic 3 → approval-card stack + hotkeys
- Topic 4 → vault side-panel
- Topic 5 → kanban tab + DAG tab

File layout under `~/.hermes/` does not change. Agents keep writing JSON/Markdown. What changes is **Maurice's read path** — from `cat` + `tmux attach` to one rendered view.

### B. Envelopes as the universal bus

Every cross-agent event is a JSON envelope on `~/.hermes/inbox.jsonl` or a sibling FIFO/directory. The current schema `{from, type, task, ts, summary}` is close. Extensions needed:
- `to:` — explicit recipient
- `proposal_id:` — for escalations
- `context_bundle:` — array of vault paths
- `expected_inputs/outputs:` — handoff contract

Every UI element in the dashboard is just a rendered envelope or a query over the envelope log.

### C. Decisions are data

Every Maurice decision becomes a line in `~/.hermes/decisions.jsonl`. Agents cite past decisions by ID. The dashboard renders precedent: "Similar to PROP-005, approved 2026-04-15." This compresses future conversations and reduces re-litigation.

---

## Suggested phased rollout

| Phase | Scope | Effort | Delivers |
|-------|-------|--------|----------|
| **0** (now) | Role cards + specialization matrix | ~1 day | Files under `~/.hermes/roles/` + matrix. No UI yet. Agents read them. |
| **1** | TUI dashboard (single `.sh` / `.py` script, polling) | ~2 days | `hermes-dashboard` command opens a tmux-compatible view with five lanes + approval stack. |
| **2** | Envelope schema v2 + decisions.jsonl + escalations/ dir | ~2 days | Every agent upgraded to emit richer envelopes. Decision log stands up. |
| **3** | Web dashboard (Next.js or Tauri) with WebSocket watcher | ~3-5 days | Kanban tab, vault side-panel, hotkeyed approvals, DAG view for proposals. |
| **4** | Vault MCP endpoint + context bundles auto-attached | ~3 days | Agents get context bundled by Hermes; stop re-discovering. |

Phase 0 and Phase 2 give most of the input-burden cut. Phase 1 is the gateway to everything else. Phases 3-4 are polish + scale.

---

## What not to do

- **Do not add a fifth file per agent.** Consolidate the four state files into one canonical per-agent JSON before adding anything else.
- **Do not build a Slack bot yet.** `tmux display-message` is enough for Phase 1-2. Remote notifications only after the local surface is solid.
- **Do not add voice / chat interfaces.** Maurice's input burden is read, not type. The fix is rendering, not another input channel.
- **Do not subagent this implementation.** The dashboard is architectural — it needs to hold all five topics in context at once. Main-thread work per the Lead Developer rubric.

---

## Open questions for Hermes

1. Should the dashboard live as a separate repo (`~/.hermes/dashboard/`) or embedded in MashupForge as `/ops/dashboard`? My read: separate. MashupForge is a product; HERMES ops tooling is infrastructure.
2. Who owns implementing Phase 0 role cards? Could go to any of Hermes / Developer / Designer; given the role-clarity theme of Topic 2, Designer is the right owner.
3. The "14 unpushed commits" visibility gap — do we want origin-sync status as a red/green dot in the dashboard, or a separate push-gate automation? Visibility is cheaper.
4. Decision-log retention — keep forever, or rotate at 90/180 days? My read: forever, grep-friendly, append-only. Storage is free.

---

## Sources

- [Code Agent Orchestra — Addy Osmani](https://addyosmani.com/blog/code-agent-orchestra/)
- [Composio agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)
- [AI Agent Dashboard Comparison Guide 2026](https://thecrunch.io/ai-agent-dashboard/)
- [Agent Orchestration — MIT Technology Review](https://www.technologyreview.com/2026/04/21/1135654/agent-orchestration-ai-artificial-intelligence/)
- [Agent Orchestration in Antigravity](https://antigravity.codes/blog/antigravity-agent-orchestration-multi-agent)
- [Multi-Agent Orchestration Patterns — StartupHub.ai](https://www.startuphub.ai/ai-news/artificial-intelligence/2026/multi-agent-orchestration-patterns)
- [State of UX 2026 — NN Group](https://www.nngroup.com/articles/state-of-ux-2026/)
- [Your AI agent doesn't know your product — UX Collective](https://uxdesign.cc/your-ai-agent-can-read-your-codebase-it-doesnt-know-your-product-b5ea0cd77989)
- [2026 Roadmap to Become an AI UX Designer](https://www.designmonks.co/blog/ai-ux-designer-roadmap-2026)
- [Human-in-the-Loop 2026 Guide — Strata.io](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)
- [Human-in-the-Loop AI Review Queues — AllDaysTech](https://alldaystech.com/guides/artificial-intelligence/human-in-the-loop-ai-review-queue-workflows)
- [Human-in-the-Loop Patterns for AI Agents — MyEngineeringPath](https://myengineeringpath.dev/genai-engineer/human-in-the-loop/)
- [Human-in-the-Loop Agentic AI — Elementum AI](https://www.elementum.ai/blog/human-in-the-loop-agentic-ai)
- [HITL Workflows — CrewAI docs](https://docs.crewai.com/en/learn/human-in-the-loop)
- [Engraph — Local knowledge graph for AI agents](https://github.com/devwhodevs/engraph)
- [Claude Obsidian — Self-Organizing AI Knowledge Engine](https://pyshine.com/2026/04/claude-obsidian-self-organizing-ai-knowledge-engine/)
- [Obsidian AI Second Brain 2026 — NxCode](https://www.nxcode.io/resources/news/obsidian-ai-second-brain-complete-guide-2026)
- [Obsidian MCP Server 2026 — Morph](https://www.morphllm.com/obsidian-mcp-server)
- [Running AI Agents From Obsidian Notes — bitsofchris](https://bitsofchris.com/p/how-i-run-ai-agents-from-my-obsidian)
- [LangGraph vs CrewAI vs AutoGen 2026 — DataCamp](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
- [Multi-Agent Framework Comparison 2026 — o-mega](https://o-mega.ai/articles/langgraph-vs-crewai-vs-autogen-top-10-agent-frameworks-2026)
- [Multi-Agent AI Orchestration Guide 2026 — dev.to](https://dev.to/pockit_tools/langgraph-vs-crewai-vs-autogen-the-complete-multi-agent-ai-orchestration-guide-for-2026-2d63)
