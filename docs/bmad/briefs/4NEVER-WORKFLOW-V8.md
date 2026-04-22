---
type: brief
created: 2026-04-22
updated: 2026-04-22
status: active
tags: [workflow, orchestration, 4nevercompany, production, autonomy]
version: 8.0.0
---

# 4neverCompany Workflow v8 — Full Autonomy Orchestrator

## TLDR

Complete rewrite of the multi-agent orchestration system. Zero human input required to start, run, or recover. Hermes wakes, detects agents, dispatches work, handles failures, and only escalates genuine conflicts. Every agent contributes research and improvement ideas continuously. Vault-keeper is a first-class orchestrator participant, not a sidecar.

## Problem Statement

The current workflow (v6.1) requires Maurice to:
1. Manually start the orchestrator session
2. Tell Hermes to "resume" or "go full orchestrator mode"
3. Manually trigger plan creation
4. Check on stuck agents
5. Authorize routine decisions

This violates the core principle: **FULL AUTONOMY. Maurice is CEO. CEOs don't micromanage dispatch queues.**

### Specific Pain Points

- **Cold start problem**: Every session begins with "resume your last session" — Hermes should auto-detect state
- **Communication fragility**: inbox.jsonl works but has no ack/nack, no retry, no dedup
- **Vault-keeper isolation**: Vault sits in a corner, only consulted when explicitly asked
- **Agent passivity**: Agents wait for tasks instead of proposing work
- **No self-healing**: Stuck agents stay stuck, crashed orchestrators stay crashed
- **Research bottleneck**: Hermes does all research; agents have web search too

## Architecture v8

### Core Principle: Deterministic Backbone + Intelligence at Edges

From CrewAI's "Agentic Systems" pattern: the orchestrator is a thin deterministic backbone. It does NOT think — it routes, validates, and recovers. Intelligence lives in the agents.

### Agent Topology

```
                    ┌─────────────────────┐
                    │    Maurice (CEO)     │
                    │   Escalation only    │
                    └──────────┬──────────┘
                               │ (only for genuine conflicts)
                    ┌──────────┴──────────┐
                    │   Hermes (CTO)       │
                    │   Orchestrator       │
                    │   xiaomi/mimo-v2-pro │
                    └──┬───┬───┬───┬──────┘
                       │   │   │   │
              ┌────────┘   │   │   └────────┐
              ▼            ▼   ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │Developer │ │Designer  │ │   QA     │ │Vault-Keeper  │
        │Opus 4.7  │ │Opus 4.7  │ │Sonnet 4.6│ │Sonnet 4.6    │
        │CODE      │ │UI/DESIGN │ │REVIEW    │ │KNOWLEDGE     │
        └──────────┘ └──────────┘ └──────────┘ └──────────────┘
              │            │           │              │
              └────────────┴───────────┴──────────────┘
                         │
                    ┌────┴────┐
                    │  VAULT  │
                    │~/wiki/  │
                    │SHARED   │
                    │MEMORY   │
                    └─────────┘
```

### Communication Protocol v2: Event Bus

Replace the fragile inbox.jsonl + tail -f with a structured event bus:

```
~/.hermes/bus/
├── events.jsonl          # Append-only event log ( replaces inbox.jsonl )
├── agent-state.json      # Live agent status (replaces separate state files)
├── dispatch-log.jsonl    # Every dispatch with ack tracking
└── escalations.jsonl     # Items requiring Maurice's attention
```

#### Event Format

```json
{
  "id": "evt-uuid",
  "from": "developer",
  "to": "hermes",
  "type": "task_complete|task_blocked|task_failed|research_done|proposal|escalation",
  "task": "PROP-019",
  "timestamp": "2026-04-22T18:30:00Z",
  "correlation_id": "batch-2026-04-22-001",
  "payload": { "summary": "...", "files_changed": [...] },
  "ack": false
}
```

#### Ack/Nack Protocol

Every event MUST be acknowledged. The orchestrator:
1. Reads event from bus
2. Processes it
3. Writes ack back: `{"event_id": "evt-uuid", "ack": true, "action_taken": "dispatched_next"}`
4. If no ack within 60s, agent retries (foreground bash)

This eliminates the #1 failure mode: "agent said sent, message never arrived."

### Self-Healing System

#### Stuck Detection

Every agent's pane is checked on a 30s cycle:
1. Capture last 20 lines of pane output
2. Match against WORKING patterns (thinking, executing, fetching, etc.)
3. Match against STUCK patterns (same prompt for >2 cycles, error repeated)
4. If stuck >90s: send Escape, clear input buffer, re-dispatch
5. If stuck >3 attempts: escalate to Maurice

#### Orchestrator Watchdog

The orchestrator itself needs a watchdog:
1. `~/.hermes/bus/orchestrator-heartbeat` — timestamp updated every 30s
2. Cron job checks: if heartbeat >2min stale → restart orchestrator
3. On restart: scan all agent states, re-dispatch any `in_progress` tasks

#### Crash Recovery

```
Orchestrator starts →
  1. Read agent-state.json → which agents alive?
  2. Check tmux sessions → respawn dead agents
  3. Read events.jsonl → any un-acked events?
  4. Read queues → any in_progress tasks? → reset to pending
  5. Read dispatch-log.jsonl → rebuild state
  6. Resume dispatch loop
```

### Auto-Start Protocol

The orchestrator starts AUTOMATICALLY when Hermes starts. No command needed.

#### Startup Sequence (automatic, no human input)

```
Hermes CLI starts →
  1. Check if agents exist in tmux → if not, spawn them
  2. Check vault-keeper → if not running, spawn it
  3. Check orchestrator process → if not running, start it
  4. Orchestrator reads state → rebuilds from bus/ files
  5. Auto-dispatch any pending tasks
  6. Report status to Maurice ONLY if attention needed
```

#### Implementation: Hermes SOUL.md Hook

Add to SOUL.md (loaded every session):

```markdown
## Auto-Orchestration (MANDATORY)

On EVERY session start, BEFORE responding to Maurice:
1. Run: ~/.hermes/scripts/auto-orchestrate.sh
2. This script:
   - Checks tmux sessions (spawn if dead)
   - Checks vault-keeper (spawn if dead)
   - Checks orchestrator process (start if dead)
   - Scans for pending tasks
   - Dispatches if agents idle
3. If everything is running: silent (don't spam Maurice)
4. If something needed fixing: brief status line
```

### Vault-Keeper as First-Class Citizen

Vault-keeper is NOT a sidecar. It participates in every dispatch cycle:

#### Pre-Dispatch Context Injection

Before any task goes to an agent, vault-keeper provides context:

```
Hermes prepares task →
  1. Query vault-keeper: "What do we know about [task topic]?"
  2. Vault-keeper searches vault, returns relevant pages
  3. Context injected into task description
  4. Agent starts with full historical context
```

Implementation: vault-keeper watches the dispatch queue and auto-injects context into task files.

#### Post-Task Learning

After any agent completes a task:

```
Agent completes task →
  1. Completion event written to bus
  2. Vault-keeper reads event
  3. Vault-keeper reads agent's review artifact
  4. Vault-keeper extracts knowledge → writes to vault
  5. Vault-keeper updates cross-references
```

#### Agent-Accessible Vault Query

All agents can query the vault directly (not just vault-keeper):

```bash
# Agent reads vault index for context before starting task
cat ~/Documents/HermesVault/index.md | grep -i "topic"

# Agent reads specific vault page
cat ~/Documents/HermesVault/Projects/mashupforge.md
```

Each task trigger includes: "Before starting, check ~/Documents/HermesVault/index.md for relevant context."

### Reduced CEO Input

#### What Maurice NEVER has to do:
- Start the orchestrator (auto-starts)
- Resume sessions (auto-detects state)
- Dispatch tasks (auto-dispatches from queue)
- Check stuck agents (auto-heals)
- Tell agents to use web search (built into every research task)
- Manually trigger releases (auto-triggers when batch complete)
- Write plans (Hermes auto-plans from feature requests)

#### What Maurice ONLY does:
- Provide feature requests / bug reports (screenshots, descriptions)
- Resolve genuine conflicts (agents disagree on approach)
- Approve major architectural decisions (not routine ones)
- Say "stop" when needed

#### Escalation Protocol

```
Agent encounters issue →
  Can it self-resolve? → YES → resolve, continue
                        → NO  → escalate to Hermes
  Hermes receives escalation →
    Can Hermes resolve? → YES → resolve, continue
                        → NO  → write to escalations.jsonl
    Maurice sees escalation on next interaction
    (NOT a push notification — CEO decides when to check)
```

### Agent Proactivity

Agents don't just wait. They propose:

1. **After every task completion**: Agent writes one "discovery" (something they noticed while working)
2. **When idle**: Agent audits its domain and proposes improvements
3. **Research mode**: When no tasks, agent researches best practices for its specialization
4. **Cross-pollination**: Agent reads vault pages for its domain and suggests updates

Implementation: each task trigger ends with:
"When done, also write one discovery (something you noticed) to your discoveries file: ~/.hermes/discoveries/{agent}.md"

### Parallel Research Default

When any research is needed, the default is PARALLEL across agents:

```
Research topic arrives →
  1. Hermes decomposes into sub-topics
  2. Each sub-topic dispatched to a different agent
  3. Agents research simultaneously
  4. Hermes synthesizes results
  5. Vault-keeper files synthesis to vault
```

This replaces the current sequential research pattern. 3-4x faster.

## Implementation Plan

### Phase 1: Event Bus + Ack Protocol (Day 1)
- [ ] Create ~/.hermes/bus/ directory structure
- [ ] Write event bus reader (Python daemon, replaces tail -f)
- [ ] Add ack/nack to all agent task triggers
- [ ] Test with one agent, roll out to all
- [ ] Update tmux-autonomous-workflow skill

### Phase 2: Self-Healing + Auto-Start (Day 1)
- [ ] Write auto-orchestrate.sh startup script
- [ ] Add stuck detection to orchestrator loop
- [ ] Write orchestrator watchdog cron job
- [ ] Add crash recovery logic
- [ ] Update SOUL.md with auto-start hook

### Phase 3: Vault Integration (Day 2)
- [ ] Create vault query script for agents
- [ ] Add pre-dispatch context injection
- [ ] Add post-task learning hook
- [ ] Update vault-keeper CLAUDE.md with new responsibilities
- [ ] Create agent-discoveries/ directory structure

### Phase 4: Agent Proactivity (Day 2)
- [ ] Add discovery prompt to every task trigger
- [ ] Create idle-time research protocol
- [ ] Implement domain audit suggestions
- [ ] Cross-pollination via vault reads

### Phase 5: Skill Updates (Day 2)
- [ ] Rewrite tmux-autonomous-workflow to v8
- [ ] Update subagent-fleet skill
- [ ] Create 4nevercompany-workflow skill (the main rule)
- [ ] Update Hermes system prompt references

## Quality Gates

Every phase must pass before the next starts:
1. Zero message loss in 50 test dispatches
2. Auto-start works on fresh session (no manual commands)
3. Stuck agent recovery within 90 seconds
4. Vault context injected into >80% of dispatches
5. Maurice input reduced to <5 interactions per session (from ~20)

## Success Metrics

| Metric | Current (v6.1) | Target (v8) |
|--------|----------------|-------------|
| Manual commands per session | ~10-15 | 0-2 |
| Message loss rate | ~5-10% | 0% |
| Stuck agent recovery | Manual (minutes) | Auto (90s) |
| Vault queries per session | 0-1 | 5+ |
| Agent proactivity | None | Continuous |
| Research parallelization | Sequential | 4x parallel |
| Cold start time | 5+ min manual | 0 (automatic) |
