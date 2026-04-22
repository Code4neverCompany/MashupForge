# Workflow Upgrade — Architecture Document

**Date:** 2026-04-22
**Status:** Active
**Source:** WORKFLOW-UPGRADE-DEV + DESIGN + QA + VAULT research reports

---

## Problem Statement

The fleet works but has 5 critical gaps:
1. Agents get stuck silently — no heartbeat timeout, no auto-recovery
2. Messages can be lost — no ACK/NACK, no idempotency on FIFO
3. Maurice reviews everything — no confidence routing, no typed escalation
4. Agents re-discover context every session — no pre-task retrieval
5. No visibility — 6 cat commands to see state, no dashboard

---

## Architecture: 5 Pillars

### Pillar 1 — Reliability Layer (P0)
- **Patrol loop** (`~/.hermes/scripts/patrol.py`): runs every 60s via cron, checks heartbeats, kills stuck agents, respects restart budget (3/hr)
- **Implicit NACK**: heartbeat > 10min + status busy → task re-queued, agent reset to idle
- **Recovery on startup**: stale busy state → check task-board for completion → re-queue if not done
- **flock** on all queue/inbox writes — eliminates race corruption
- **Two-phase FIFO write**: temp file → atomic mv
- **Dead letter section**: 3 failed attempts → DLQ in queue file

### Pillar 2 — Structured State (P0)
- **sessions/active.yaml**: machine-readable hot-tier state (agent states, open tasks, provider, last commit)
- **audit.jsonl**: append-only, flock-protected, jq-queryable. Every state transition = one line. trace_id threads across agent boundaries
- **Envelope schema v2**: add `confidence`, `to`, `proposal_id`, `context_bundle` fields
- **decisions.jsonl**: every Maurice decision logged with rationale, agents cite precedent

### Pillar 3 — Routing & Identity (P1)
- **Role cards**: `~/.hermes/roles/<agent>.md` — identity, scope, can-decide, must-escalate, owned files
- **Specialization matrix**: `~/.hermes/roles/matrix.md` — task categories × agents
- **Confidence routing**: > 0.8 routine → auto, 0.5-0.8 → auto+log, < 0.5 → escalate
- **Typed escalation queues**: code.md, infra.md, human.md (not one big proposals.md)
- **Inbox listener**: `tail -f` + jq on inbox.jsonl → immediate Hermes reaction, no polling

### Pillar 4 — Vault Integration (P1)
- **raw/agent-output/**: Dev/Designer/QA drop findings here, vault-keeper distills
- **orchestration/routing_rules.yaml**: auditable routing rules maintained by vault-keeper
- **Pre-task retrieval**: vault-keeper receives PRE-TASK signal → retrieves top-5 relevant pages → writes context to ~/.hermes/context/<task-id>.md
- **Post-task filing**: vault-keeper receives POST-TASK signal → distills output → updates wiki

### Pillar 5 — Dashboard (P2)
- **TUI dashboard** (Phase 1): 5 lanes (Hermes/Dev/Designer/QA/Vault) × 3 rows (in-flight/waiting/done). Reads existing JSON/MD files, no schema changes
- **Approval cards**: escalation feed with one-tap hotkeys (a/r/e)
- **Kanban tab**: Backlog → Queued → Running → Blocked → Review → Done
- **Vault side-panel**: hot cache, lint health, recent edits

---

## File Schema

```
~/.hermes/
├── scripts/
│   ├── patrol.py              # NEW — heartbeat monitor + restart budget
│   ├── inbox-listener.py      # NEW — real-time envelope reaction
│   └── route.py               # NEW — confidence + typed routing
├── roles/
│   ├── developer.md           # NEW — role card
│   ├── designer.md            # NEW — role card
│   ├── qa.md                  # NEW — role card
│   ├── vault-keeper.md        # NEW — role card
│   └── matrix.md              # NEW — specialization matrix
├── queues/
│   ├── developer.json         # EXISTS — flock-wrapped writes
│   ├── designer.json          # EXISTS — flock-wrapped writes
│   └── qa.json                # EXISTS — flock-wrapped writes
├── agent-state/
│   ├── developer.json         # EXISTS — add restart_count, current_task
│   └── ...
├── escalations/
│   ├── code.md                # NEW — code escalation queue
│   ├── infra.md               # NEW — CI/config escalation queue
│   └── human.md               # NEW — security/brand/payment escalation queue
├── context/
│   └── <task-id>.md           # NEW — vault-keeper pre-task context
├── audit.jsonl                # NEW — structured audit log
├── decisions.jsonl            # NEW — Maurice decision log
├── sessions/
│   └── active.yaml            # NEW — hot-tier session state
├── inbox.jsonl                # EXISTS — envelope schema v2
└── proposals.md               # EXISTS — migration path to typed queues
```

Vault additions:
```
~/Documents/HermesVault/
├── raw/agent-output/          # NEW — agent deliverables
├── orchestration/
│   ├── routing_rules.yaml     # NEW — auditable routing
│   └── dispatch-log.jsonl     # NEW — append-only dispatch history
└── sessions/
    ├── active.yaml            # SYMLINK → ~/.hermes/sessions/active.yaml
    └── recent/                # NEW — warm-tier rolling 7-day summaries
```

---

## Implementation Order

| Epic | Stories | Agent | Effort | Depends On |
|------|---------|-------|--------|------------|
| E1: Reliability | S1-S5 | Dev | 1 day | None |
| E2: Structured State | S6-S9 | Dev | 1 day | E1 |
| E3: Role Cards | S10-S11 | Designer | 0.5 day | None |
| E4: Routing Engine | S12-S14 | Dev | 1 day | E2, E3 |
| E5: Vault Hooks | S15-S17 | Vault-Keeper | 1 day | E2 |
| E6: TUI Dashboard | S18-S20 | Designer | 2 days | E2, E3, E4 |

E1 and E3 can run in parallel (no dependency). E2 starts after E1. E4-E6 follow.
