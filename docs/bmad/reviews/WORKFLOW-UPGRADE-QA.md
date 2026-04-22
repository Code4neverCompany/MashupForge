# WORKFLOW-UPGRADE-QA — Multi-Agent Reliability Research

> ⚠️ **Status: research-only — superseded by E1–E4 implementation.** Adoption priorities listed here reflect pre-implementation research. See `E1-RELIABILITY.md` for what was actually built and `ARCHITECTURE-WORKFLOW-UPGRADE.md` for the authoritative architecture.

**Author:** QA Agent  
**Date:** 2026-04-22  
**Task:** WORKFLOW-UPGRADE-RESEARCH  
**Scope:** Hermes + Developer + QA subagent fleet (file-based queues, FIFO pipes, WAL protocol)

---

## Executive Summary

This report covers five reliability pillars for the 4neverCompany multi-agent workflow. Current architecture uses flat-file queues (`~/.hermes/queues/*.md`), a FIFO pipe (`~/.hermes/agent-push.fifo`), JSON state files, and a WAL protocol. The gaps identified below are all solvable without external infrastructure — no Redis, no broker, just disciplined file I/O and protocol conventions.

**Critical gaps today:**
1. No ACK/NACK on FIFO writes — messages can be lost silently
2. No checkpoint/resume — a mid-task crash loses all in-progress work
3. No orchestrator-level tests — the routing logic itself is untested
4. Audit trail is human-readable WAL prose, not machine-queryable structured log
5. Quality gate thresholds are not defined — no criteria for when to escalate to human review

---

## Topic 1: Quality Gates — Automated Review vs Human Review

### Industry Standard

Modern agentic pipelines run automated evaluation at every commit (offline golden-dataset checks) and at runtime (LLM-as-judge scoring). The rule of thumb from production RAG and agentic deployments:

- **Automated gate** when: output is deterministic enough to score (code compiles, tests pass, JSON schema valid, format correct, no forbidden strings present)
- **LLM-as-judge gate** when: quality is subjective but a rubric can be written (caption tone, prompt clarity, task completion)
- **Human gate** when: the blast radius of a wrong decision is high, the domain requires expertise automated graders lack, or confidence scores fall below a threshold

LLM evaluations cost 500–5,000× less than human review, making them viable for continuous monitoring. But when stakes are high (production deploy, financial action, irreversible file operation), human review remains mandatory.

### Failure Modes

- **No gate at all:** silent regression — a changed prompt degrades output quality with no alert
- **Gate with wrong metric:** pass rate on a flawed rubric gives false confidence
- **Always-human gate:** doesn't scale; developer fatigue causes rubber-stamping
- **Always-automated gate:** misses edge cases that require contextual judgment

### What to Adopt for Hermes

| Condition | Gate Type | Action |
|---|---|---|
| Routine task (< 50 LOC, single file) | Automated: tsc + vitest | Self-approve if green |
| New feature, cross-file | Automated: tsc + vitest + LLM diff review | Flag to Hermes if score < threshold |
| Config change, schema change | Human | Always lift to PROP, never self-execute |
| Any task touching auth/secrets/CI | Human | Hard block — no exceptions |
| Confidence in plan < 80% | Human | Write `question` envelope before starting |

**Threshold to adopt:** if automated test suite green AND LLM self-review scores task as "low risk" (single concern, bounded scope, reversible), self-approve. Otherwise escalate.

---

## Topic 2: Agent Communication Reliability — Message Loss, Idempotency, ACK/NACK

### Industry Standard

Production message systems (RabbitMQ, Kafka) achieve 99.999% delivery reliability through:

1. **At-least-once delivery** — retry until acknowledged; consumers handle duplicates
2. **Explicit ACK/NACK** — producer gets confirmation of receipt; on NACK, message goes to DLQ or retries
3. **Idempotent consumers** — every message carries a UUID; consumer skips if already processed
4. **Durable storage** — messages persisted to disk before ACK sent to producer

UUID v4 + timestamp versioning for message IDs achieves 99.998% deduplication accuracy at 75,000 msg/s in benchmarks.

### Failure Modes (specific to file/FIFO architecture)

- **FIFO write with no reader:** write blocks indefinitely or fails silently depending on open mode
- **Partial write:** interrupted write leaves malformed JSON envelope in pipe
- **Race on markdown queue file:** two agents write simultaneously, one overwrites the other's change
- **Envelope consumed but task fails mid-flight:** no way to replay from current protocol
- **`inbox.jsonl` append races:** concurrent appends from multiple agents corrupt lines

### What to Adopt for Hermes

**Immediate (no new infra):**

1. **Task IDs as idempotency keys.** Every envelope already has `task` field — before executing, check if `task` ID exists in `completed[]` of the board. Skip if yes.

2. **Two-phase FIFO write.** Write to a temp file, then `mv` (atomic on Linux). Ensures no partial writes reach the reader.
   ```bash
   printf '%s\n' "$ENVELOPE" > ~/.hermes/agent-push.fifo.tmp.$$
   mv ~/.hermes/agent-push.fifo.tmp.$$ ~/.hermes/agent-push.fifo
   ```

3. **Heartbeat timeout = implicit NACK.** If `last_heartbeat` in agent state is > 10 minutes old and `status == busy`, Hermes treats the task as dropped and re-queues it.

4. **Append-only queue files with flock.** Wrap all writes to `queues/*.md` and `inbox.jsonl` in `flock`:
   ```bash
   flock ~/.hermes/queues/developer.md.lock -c "echo '- [ ] TASK' >> ~/.hermes/queues/developer.md"
   ```

5. **Dead letter section in queue file.** After 3 failed attempts, move queue item to `## Dead Letter` section with failure reason. Hermes reviews DLQ on standup.

---

## Topic 3: Error Recovery — Crash Mid-Task, Checkpoint, Resume

### Industry Standard

Best-in-class systems use one of three patterns:

**A. Checkpoint/restore (LangGraph model):**  
After each atomic step, serialize full agent state to durable storage (PostgreSQL or file). On restart, load last checkpoint and resume from that step. Microsoft Durable Task does this automatically for Azure-hosted agents.

**B. Event sourcing:**  
Store the log of state transitions, not the state itself. Reconstruct by replaying from beginning. Maps naturally to conversation/WAL history — the WAL *is* an event log.

**C. Safe-point checkpointing:**  
Checkpoint only after completing a well-defined atomic unit of work (a committed git change, a completed test run). Between safe points, work is considered tentative and discarded on crash.

### Failure Modes

- **No checkpoint:** crash at step 8 of 10 loses all work; must restart from scratch
- **Mid-step checkpoint:** checkpoint captured during a non-atomic operation leaves state inconsistent
- **Checkpoint too frequent:** overhead exceeds benefit for short tasks
- **No crash detection:** orchestrator doesn't know agent died; task stays `in_progress` forever → stuck

### What to Adopt for Hermes

The current WAL protocol is essentially event sourcing already. Strengthen it:

1. **Safe-point = git commit.** A task is checkpointed when a commit is made. If the agent crashes before committing, the task is re-runnable from the queue item. No partial state to clean up.

2. **Status transitions are atomic.** Before starting a task, write `status: busy, current_task: TASK-ID` to agent state. On completion, write `status: idle, current_task: null` + mark queue item `[x]`. On crash + restart, a `busy` status with stale heartbeat means the task needs recovery.

3. **Recovery protocol on startup:**
   ```
   if state.status == 'busy' AND (now - state.last_heartbeat) > 10min:
     read state.current_task
     check if already in board.completed[] → if yes, mark queue [x], set idle
     if not: re-queue task with priority flag, set status idle
   ```

4. **Never mark a task complete before the commit lands.** The sequence must be:
   `commit → push` → mark `[x]` → update state → send done envelope. Not before.

---

## Topic 4: Testing Multi-Agent Workflows — Orchestrator Correctness

### Industry Standard

Amazon's agentic systems team (published 2025) uses three layers:

1. **Unit tests per agent:** each agent's routing logic, state transitions, and output format tested in isolation with mocked inputs
2. **Contract tests between agents:** verify that what agent A emits matches what agent B expects — shape, field names, required fields, allowed values
3. **Simulation / chaos testing:** inject faults (missing files, malformed envelopes, stale heartbeats, FIFO timeouts) and verify the orchestrator recovers correctly

LLM simulator personas (as used by Amazon) drive diverse inputs — equivalent to fuzz testing for agent inputs.

Digital twin environments replicate production state for safe destructive testing.

### Failure Modes

- **Testing only leaf agents:** the orchestrator routing logic itself goes untested; bugs appear in production
- **No contract tests:** agent A changes its output format, agent B silently misparses → wrong behavior with no error
- **No fault injection:** reliability only tested in happy-path conditions
- **Tests that mock too aggressively:** mock and real behavior diverge (same failure as the DB mock incident)

### What to Adopt for Hermes

**What currently has zero test coverage:**
- `tick()` cron routing logic
- FIFO envelope parsing
- Agent state machine transitions
- Queue item classification (routine vs complex)
- Recovery protocol on stale heartbeat

**Recommended test additions:**

1. **Envelope contract tests** (pure unit, no I/O):
   ```typescript
   // validate every envelope type has required fields
   test('done envelope has from, type, task, ts', () => { ... })
   test('question envelope has from, type, task, ts', () => { ... })
   ```

2. **Queue parser tests**: given a markdown queue file with `[ ]`, `[x]`, `[~]` items, verify correct item is selected

3. **State machine tests**: given `status: busy` + stale heartbeat, verify recovery path fires

4. **Fault injection**: write a malformed envelope to the FIFO, verify Hermes logs and skips rather than crashes

5. **Idempotency tests**: submit the same task ID twice, verify it runs only once

---

## Topic 5: Audit Trails and Traceability

### Industry Standard

The EU AI Act (2025) requires traceability for high-risk AI systems: which agents ran, what inputs they received, what model and prompt version was used, what they produced. Immutable storage required.

Modern observability platforms (Langfuse, Portkey, Maxim AI) emit OpenTelemetry-compatible traces with:

- **Span model:** each agent action = one span with `trace_id`, `span_id`, `parent_span_id`, `start_ts`, `end_ts`, `agent`, `action_type`, `input_hash`, `output_hash`, `status`
- **Correlation IDs:** single `trace_id` threads through all spans of one task, even across agent boundaries
- **Structured JSON log lines:** machine-queryable; not prose

Key insight: non-deterministic agent control flow (an agent may loop unpredictably) makes it impossible to pre-define the trace structure — logs must be emitted dynamically as spans start and end.

### Failure Modes

- **Prose WAL only:** human-readable but not grep/jq queryable; can't answer "which tasks ran on 2026-04-20?" without reading every file
- **No correlation ID:** task spans in Developer and Hermes logs can't be linked back to the originating request
- **Mutable log files:** overwritten entries hide what actually happened
- **No input/output hashing:** can't detect prompt drift or verify a cached result is for the same input

### What to Adopt for Hermes

**Minimal structured audit log** — no external infra, one append-only file:

**File:** `~/.hermes/audit.jsonl` (append-only, never overwritten)

**Line format:**
```json
{
  "ts": "2026-04-22T09:00:00Z",
  "trace_id": "T-20260422-001",
  "agent": "developer",
  "action": "task_start | task_done | task_failed | message_sent | message_received | proposal_lifted",
  "task_id": "PROP-018",
  "detail": "Started OPT-003 proxy-image LRU cache",
  "input_hash": "sha256:abc...",
  "output_ref": "commit:f05f2cb"
}
```

**Rules:**
1. Every state transition writes one line — task start, task done, error, proposal, message
2. `trace_id` is set at task assignment and carried through all spans of that task
3. File is append-only — use `>>` never `>`; wrap writes in `flock` to prevent corruption
4. Weekly rotation: `mv audit.jsonl audit-$(date +%Y-W%V).jsonl && touch audit.jsonl`

**Querying examples:**
```bash
# All tasks completed this week
jq 'select(.action == "task_done")' ~/.hermes/audit.jsonl

# Full trace for a task
jq 'select(.trace_id == "T-20260422-001")' ~/.hermes/audit.jsonl

# All silent failures (started but no done within 2h)
# (requires external script — acceptable)
```

---

## Adoption Priority

| Priority | Action | Effort | Impact |
|---|---|---|---|
| P0 | Heartbeat timeout = implicit NACK → re-queue | 1h | Eliminates stuck agents |
| P0 | Recovery protocol on startup (stale busy state) | 1h | Eliminates lost tasks on crash |
| P1 | `flock` on all queue/inbox writes | 30m | Eliminates race corruption |
| P1 | Envelope contract tests | 2h | Catches format regressions |
| P1 | Structured audit log (`audit.jsonl`) | 2h | Full traceability |
| P2 | Two-phase FIFO write | 30m | Eliminates partial writes |
| P2 | Dead letter section in queue | 1h | Surfaces repeated failures |
| P2 | Queue parser + state machine unit tests | 3h | Orchestrator correctness |
| P3 | LLM-as-judge self-review before escalate | 4h | Reduces Hermes interrupts |
| P3 | Fault injection test suite | 4h | Validates recovery paths |

---

## References

- [Production RAG in 2025 — Evaluation Suites, CI/CD Quality Gates & Observability](https://dextralabs.com/blog/production-rag-in-2025-evaluation-cicd-observability/)
- [LLM-as-a-Judge vs Human-in-the-Loop Evaluations](https://www.getmaxim.ai/articles/llm-as-a-judge-vs-human-in-the-loop-evaluations-a-complete-guide-for-ai-engineers/)
- [Evaluations for the Agentic World — McKinsey QuantumBlack](https://medium.com/quantumblack/evaluations-for-the-agentic-world-c3c150f0dd5a)
- [RabbitMQ Reliability Guide](https://www.rabbitmq.com/docs/reliability)
- [Idempotency Patterns when Stream Processing Messages](https://medium.com/@connectmadhukar/idempotency-patterns-when-stream-processing-messages-3df44637b6af)
- [Best Practices for Message Queue Services in Distributed Systems](https://iaeme.com/MasterAdmin/Journal_uploads/IJCET/VOLUME_16_ISSUE_1/IJCET_16_01_002.pdf)
- [Checkpoint/Restore Systems for AI Agents — eunomia](https://eunomia.dev/blog/2025/05/11/checkpointrestore-systems-evolution-techniques-and-applications-in-ai-agents/)
- [Supervisor Trees and Fault Tolerance Patterns for AI Agent Systems](https://zylos.ai/research/2026-03-16-supervisor-trees-fault-tolerance-ai-agent-systems)
- [Dead Letter Queue — Redpanda](https://www.redpanda.com/blog/reliable-message-processing-with-dead-letter-queue)
- [Queue-Based Exponential Backoff](https://dev.to/andreparis/queue-based-exponential-backoff-a-resilient-retry-pattern-for-distributed-systems-37f3)
- [Multi-Agent AI Testing Guide 2025 — Zyrix](https://zyrix.ai/blogs/multi-agent-ai-testing-guide-2025/)
- [Evaluating AI Agents — Amazon AWS](https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/)
- [The Orchestration of Multi-Agent Systems — arXiv](https://arxiv.org/html/2601.13671v1)
- [The AI Audit Trail — LLM Observability](https://medium.com/@kuldeep.paul08/the-ai-audit-trail-how-to-ensure-compliance-and-transparency-with-llm-observability-74fd5f1968ef)
- [AI Agent Observability: Tracing, Debugging, Monitoring](https://coverge.ai/blog/ai-agent-observability)
- [MCP Audit Logging: Tracing AI Agent Actions](https://tetrate.io/learn/ai/mcp/mcp-audit-logging)
- [LLM Observability Best Practices 2025](https://www.getmaxim.ai/articles/llm-observability-best-practices-for-2025/)
