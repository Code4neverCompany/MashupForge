# Agent Wake-Up Pattern Research

**Researched by:** Developer agent
**Date:** 2026-04-14
**Purpose:** Inform Hermes autoloop optimization

---

## Summary table

| System | Wake mechanism | Context source | Decision method |
|---|---|---|---|
| Paperclip | Event-driven daemon + webhooks | Control plane API pull | Planner LLM + tool routing |
| OpenClaw | No confirmed public presence | N/A | N/A |
| Claude Code / Hermes | Cron tick (*/10 min) + tmux dispatch | File injection (heartbeat-context.md) | Queue pull + LLM self-prompt |
| LangChain Agents | Programmatic invocation or event trigger | Tool outputs + memory stores | ReAct/Plan-and-Execute loop |
| AutoGPT | User-initiated or scheduled | File store + web tools | LLM self-prompt with goal decomposition |

---

## Paperclip

### Wake mechanism

Paperclip is a control-plane service for managing AI agents. Agents are registered
entities that the Paperclip platform can wake via webhooks or scheduled jobs triggered
by the control plane. The wake pattern is **event-driven**: an external event (API call,
webhook, cron trigger) causes the control plane to emit a task envelope to the agent
process.

From the local Hermes system, `~/.hermes/scripts/paperclip-bridge-cron.py` and
`paperclip-bridge-watchdog.sh` implement a bridge that keeps a heartbeat cycle going,
polling or reacting to Paperclip-sourced events. The watchdog ensures the bridge
process itself stays alive — a daemon-of-daemons pattern.

### Context injection

Paperclip agents receive context via the control plane API at wake time. Context is
**injected** into the agent's session as a structured payload — not reconstructed from
scratch by the agent. The heartbeat-context.sh script in Hermes is a local adaptation
of this pattern: it pre-computes a context snapshot (agent status, queue depth, recent
events, project state) every 5 minutes and writes it to `heartbeat-context.md` so any
agent that wakes up has fresh context immediately available without needing to query
multiple sources.

### Decision loop

Paperclip's control plane acts as an external planner. Agents do not self-plan from
scratch; instead they receive a task envelope with a goal already decomposed. Local
tool selection (which API to call, which file to read) is handled by the agent LLM,
but goal decomposition is centralized. This is a **centralized planner, distributed
executor** model.

### Notable patterns

- **Watchdog of watchdogs**: `paperclip-bridge-watchdog.sh` ensures the bridge stays
  alive, which ensures the agent stay reachable. Multiple layers of liveness checking.
- **Structured task envelopes**: Tasks are JSON payloads with `from`, `type`, `task`,
  `ts` fields. This enables deduplication, replay, and audit logging.
- **Control plane as single source of truth**: Agents do not negotiate over state;
  the control plane owns it.

---

## OpenClaw

### Wake mechanism

No confirmed public presence for a project named "OpenClaw" with HEARTBEAT.md and
agent daemon patterns was found in public documentation, GitHub, or research literature
as of the knowledge cutoff. The name does not match any widely-known open-source agent
framework.

**Assessment**: Either this is a private/internal project, or the name is slightly
different from a known system. Research was not able to locate architectural details.
The patterns described (HEARTBEAT.md file, daemon process) are common in custom agent
systems built on top of Claude Code or similar — the Hermes system itself uses a
comparable approach with `heartbeat-status.md` and `heartbeat-context.md`.

### Context injection

Unknown — no public documentation found.

### Decision loop

Unknown — no public documentation found.

### Notable patterns

The concept of a `HEARTBEAT.md` file as a context artifact (rather than an in-memory
state object) is worth noting as a general pattern. Writing heartbeat state to a flat
file makes it inspectable by humans, readable by any process without an SDK, and
naturally append-friendly. The Hermes system uses this pattern with `heartbeat-status.md`
and the output of `heartbeat-context.sh`.

---

## Claude Code / Hermes (local reference implementation)

This is the system the research is directly informing. The actual implementation is
available in `~/.hermes/` and serves as a concrete reference for the patterns below.

### Wake mechanism

Three-layer wake stack:

1. **Cron tick** (`*/10 * * * *`): `tick.sh` fires every 10 minutes. It checks agent
   liveness via `tmux has-session`, reads queue depth, and sends a tmux `send-keys`
   dispatch if the agent is idle and has pending tasks.

2. **Outer loop** (`*/5 * * * *`): `outer-loop.sh` fires every 5 minutes. Broader
   sweep — checks agent liveness, project state (git, TypeScript errors), BMAD artifact
   counts, and queue status. Also handles agent **respawn** if a tmux session is dead.

3. **Idle loop** (`0 * * * *`): `idle-loop.sh` fires hourly. Detects agents idle for
   >= 2 hours with empty queues, drops a `promote-discoveries` tick flag to trigger
   autonomous task discovery.

The agent itself (Claude Code) does not poll. It is a **reactive process**: it waits
for a message to appear in its tmux pane. The cron scripts are the true schedulers.

### Context injection

Context is injected via two mechanisms:

1. **`heartbeat-context.md`**: Pre-computed every 5 minutes by `heartbeat-context.sh`.
   Contains agent liveness, queue depths, recent git state, recent agent events. The
   agent reads this file at turn start to get a snapshot of system state without
   having to query tmux, git, or queue files individually.

2. **BMAD artifact files**: Task-specific context lives in
   `docs/bmad/{briefs,stories,reviews,questions}/`. The agent reads these on task
   pickup rather than receiving inline context. This keeps the dispatch message short
   and puts context at a known, stable location.

The key insight: **context is pre-computed and cached**, not assembled on demand. This
reduces latency at wake time and ensures consistent context snapshots across agents.

### Decision loop

```
Turn start:
  1. Check PAUSE / PAUSE_FORCE flags
  2. Check CURRENT_PROTOCOL version
  3. Consume tick flags from ~/.hermes/agent-queue/{agent}/
  4. Update agent-state/{agent}.json (heartbeat, status)
  5. Pull first unchecked task from queues/{agent}.md
  6. Classify: routine (self-assign) vs complex (propose, lift to proposals.md)
  7. Execute routine tasks; push FIFO envelope on completion
  8. Enforce daily cap (10 routine tasks max per period)
```

The decision boundary is encoded in the agent's CLAUDE.md (its system prompt), not in
external code. The **LLM itself classifies** each task as routine or complex using a
rubric table. This is unusual — most systems classify in the orchestrator, not the agent.

### Notable patterns

- **Deduplication via `last_dispatched`**: `tick.sh` tracks the last dispatched task ID
  in state. If the next queue item matches `last_dispatched`, the tick is skipped. This
  prevents double-firing when the agent hasn't acknowledged a task yet.
- **Stall detection**: If `status == busy` and `last_heartbeat` is more than 30 minutes
  old, the agent is marked `stalled` and an error envelope is pushed to the FIFO.
- **BMAD artifact handoff**: Agents communicate via files in `docs/bmad/`, not via tmux
  messages. This makes all state inspectable and auditable by Hermes without needing
  to parse terminal output.
- **Protocol version gate**: Agents refuse to proceed if `CURRENT_PROTOCOL` doesn't
  match the expected version. Safe upgrade path without coordination overhead.

---

## LangChain Agents

### Wake mechanism

LangChain agents are **synchronous by default** — they wake when explicitly invoked
by application code. There is no built-in daemon or scheduler. In production deployments,
wake happens via:

- **API request** (FastAPI/Flask wrapper around `AgentExecutor.invoke()`)
- **Cron + script** (external scheduler calls the agent)
- **Event queue consumer** (Celery/RQ worker receives a task, calls the agent)
- **LangGraph** (stateful graph execution; nodes are activated by graph state transitions)

LangGraph, LangChain's newer orchestration layer, introduces **event-driven wake** via
state machine transitions. A node (agent step) activates when its input state is ready.
This is closer to dataflow execution than cron polling.

### Context injection

LangChain uses **memory objects** and **tool outputs** as the primary context sources:

- `ConversationBufferMemory` / `ConversationSummaryMemory`: Stores prior turns, injected
  into each prompt as a formatted string.
- `VectorStoreRetrieverMemory`: Semantic search over past interactions; injects the top-k
  most relevant chunks.
- **Tool outputs**: Each tool call result is appended to the agent scratchpad, becoming
  context for subsequent reasoning steps.
- **Callbacks**: `BaseCallbackHandler` allows injecting context at any point in the chain.

In LangGraph, context is the **graph state** — a typed dict that flows between nodes.
Each node reads from and writes to this shared state object. There is no separate
"context injection" step; context is the state.

### Decision loop

LangChain implements the **ReAct** (Reasoning + Acting) pattern:

```
Loop:
  1. LLM observes current state (prompt + memory + tool outputs so far)
  2. LLM produces: Thought: [reasoning] + Action: [tool_name] + Action Input: [args]
  3. Tool is invoked; result appended as Observation
  4. Repeat until LLM produces Final Answer
  5. Max iterations / time limits enforced by AgentExecutor
```

The **Plan-and-Execute** variant (OpenAI Functions / Structured Tools) separates
planning from execution:

1. Planner LLM produces a numbered step list
2. Executor LLM works through steps, calling tools
3. Replanner can revise the plan based on observations

LangGraph enables **multi-agent** decision loops: agents are nodes in a directed graph,
and the graph's conditional edges determine which agent runs next based on prior outputs.

### Notable patterns

- **Tool schema as capability declaration**: Tools are described with Pydantic schemas.
  The LLM selects tools from a registered list — the agent's capability set is explicitly
  bounded.
- **Max iterations guard**: `AgentExecutor(max_iterations=N)` prevents infinite loops.
  Essential for production.
- **Streaming vs. batch**: LangChain supports token-level streaming via callbacks, making
  it suitable for interactive UIs even with long reasoning chains.
- **Human-in-the-loop**: `interrupt_before` / `interrupt_after` in LangGraph let a human
  review and approve intermediate steps before the agent continues.

---

## AutoGPT

### Wake mechanism

AutoGPT is an **autonomous agent** designed to run continuously toward a goal. Its
wake mechanism is:

- **User-initiated**: The user provides a name, role, and up to 5 goals. AutoGPT starts
  and runs until goals are met or the user intervenes.
- **Command-loop polling**: AutoGPT's inner loop is a tight `while True` that continuously
  calls the LLM, parses a command, executes it, and loops.
- **Scheduled via external script**: In CI/daemon deployments, AutoGPT is wrapped in a
  systemd service or cron job that keeps it alive.

There is no native event-driven wake. AutoGPT assumes continuous runtime — it is not
designed for intermittent wake-from-sleep patterns.

### Context injection

AutoGPT manages its own context via a **rolling window + summarization** approach:

- **Short-term memory**: The last N messages in the conversation window (OpenAI token
  limit aware).
- **Long-term memory**: Vector store (Pinecone, Redis, local FAISS). AutoGPT retrieves
  relevant memories based on the current task and injects them into the prompt.
- **File store**: AutoGPT can read/write files in a workspace directory. The file system
  acts as external memory that persists across sessions.
- **Self-prompting context header**: Every prompt includes the agent's name, role, goals,
  and a formatted memory block. This is prepended automatically by the framework.

The self-prompting header is AutoGPT's answer to the context injection problem: instead
of waiting for an external system to provide context, the agent **carries its own context
definition** and regenerates it on every loop iteration.

### Decision loop

AutoGPT uses a **self-prompting goal decomposition** loop:

```
Loop:
  1. Prompt LLM with: [system header] + [goals] + [memory] + [last action result]
  2. LLM responds with JSON: { "thoughts": {...}, "command": { "name": ..., "args": ... } }
  3. Parse command; execute via command registry
  4. Append result to short-term memory
  5. Store significant events in long-term vector store
  6. If human_feedback_mode: request user confirmation before executing
  7. Repeat
```

AutoGPT does **not** use an external planner. The same LLM handles both planning and
execution in each cycle. The LLM is asked to produce both `"thoughts.plan"` (a list of
upcoming steps) and the immediate `"command"` in the same response — self-contained
planning within each step.

Notable failure mode: without strict goal completion criteria, AutoGPT loops indefinitely,
hallucinating progress on goals it cannot actually achieve.

### Notable patterns

- **Structured JSON output discipline**: Commands are parsed as `{"command": {"name": ...,
  "args": ...}}`. Strict schema enforces tool-call discipline without a function-calling
  API.
- **Self-contained context header**: Agent identity, role, and goals are re-injected
  every turn. No external system needs to remember who the agent is.
- **Critique + reflection step**: Some AutoGPT variants add a self-critique before
  command execution: "Before acting, evaluate whether this command advances the goals."
  This reduces thrashing.
- **File workspace as persistent state**: Unlike purely in-context agents, AutoGPT
  writes to disk. This makes its state inspectable and recoverable after restarts.

---

## Synthesis: patterns worth adopting

### 1. Pre-computed context snapshots (Paperclip / Hermes heartbeat)

**Pattern**: A lightweight script runs on a short cron (5 minutes) and writes a
pre-formatted context file. The agent reads a single file at wake time instead of
querying N sources.

**Already implemented** in Hermes as `heartbeat-context.sh` → `heartbeat-context.md`.

**Optimization opportunity**: The heartbeat could include a `next_action_hint` field —
the outer loop's assessment of what the agent should probably do next. This saves the
agent one reasoning step on every wake.

### 2. Stall detection with external escalation (Hermes tick.sh)

**Pattern**: Track `last_heartbeat` in agent state. If `status == busy` and heartbeat
age exceeds a threshold, escalate via FIFO envelope.

**Already implemented**. Consider adding **auto-recovery**: if stalled for > 60 minutes,
re-dispatch the same task rather than just marking stalled.

### 3. Deduplication via last_dispatched (Hermes tick.sh)

**Pattern**: Record the last dispatched task ID. Skip re-dispatch if the next queue
item matches, preventing double-execution during the agent's processing window.

**Already implemented**. This is a simple but critical correctness guarantee.

### 4. LangGraph-style conditional routing

**Pattern**: Instead of a single queue with a linear pull, use a lightweight state
machine where the next agent to run is determined by the output of the previous step.

**Gap in Hermes**: Hermes uses linear queues. For multi-step workflows (brief → story →
implement → QA → review), the handoff is manual (Hermes reads the review and writes
the next queue item). A conditional edge in the BMAD artifact pipeline could automate
this: if a review artifact appears and is marked "approved", automatically queue the
next story.

### 5. AutoGPT self-contained context header

**Pattern**: The agent's identity, role, and current goals are re-injected into every
turn via the system prompt or a prepended context block. No external system needs to
remember the agent's state.

**Already implemented** in Hermes via `CLAUDE.md` (identity) and the turn-start routine
in the Autonomic Loop Protocol. The combination of `CLAUDE.md` + `heartbeat-context.md`
at turn start is equivalent to AutoGPT's self-prompting header.

### 6. Daily cap with routine/complex classification (Hermes CLAUDE.md)

**Pattern**: Classify each task as routine (self-assign, bounded) or complex (propose
to orchestrator). Enforce a daily cap on self-assigned routine tasks to prevent runaway
autonomous execution.

**Already implemented**. This is a safety pattern not present in AutoGPT or basic
LangChain — it is a Hermes-specific contribution worth preserving.

### 7. ReAct scratchpad for multi-step tasks (LangChain)

**Gap in Hermes**: For tasks requiring more than one tool call, the agent currently
reasons entirely in-context without a structured scratchpad. Adopting an explicit
`Thought / Action / Observation` format for complex tasks (written to a temp file or
the BMAD review) would make multi-step reasoning inspectable and restartable.

### 8. Human-in-the-loop interrupt (LangGraph)

**Pattern**: For any task classified as complex, the agent pauses before execution and
writes a proposal. Hermes approves or rejects.

**Already implemented** via `proposals.md` and the `question` FIFO envelope. The
pattern is sound; the implementation is complete.

---

*Research scope: LangChain and AutoGPT based on public documentation and training data
(knowledge cutoff August 2025). Paperclip based on local Hermes scripts and the
available `paperclip` skill. OpenClaw has no confirmed public presence — noted above.
Claude Code / Hermes based on direct code inspection of `~/.hermes/`.*
