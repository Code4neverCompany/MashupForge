# QA Review — Architecture Workflow Upgrade
**Reviewer:** QA Agent  
**Date:** 2026-04-22  
**Scope:** All untracked docs from today's Architecture Workflow Upgrade  
**Status:** ✅ Review complete

---

## Documents Reviewed

| Document | Type |
|----------|------|
| `docs/bmad/reviews/E1-RELIABILITY.md` | Epic completion report |
| `docs/bmad/reviews/E2-STATE.md` | Epic completion report |
| `docs/bmad/reviews/E3-ROLES.md` | Epic completion report |
| `docs/bmad/reviews/E4-ROUTING.md` | Epic completion report |
| `docs/bmad/reviews/FLEET-INFRA-ROLL.md` | Roll-out completion report |
| `docs/bmad/reviews/WORKFLOW-UPGRADE-DEV.md` | Research brief (Developer) |
| `docs/bmad/reviews/WORKFLOW-UPGRADE-DESIGN.md` | Research brief (Designer) |
| `docs/bmad/reviews/WORKFLOW-UPGRADE-QA.md` | Research brief (QA) |
| `docs/bmad/ARCHITECTURE-WORKFLOW-UPGRADE.md` | Architecture document |
| `docs/PIPELINE-DAEMON-ANALYSIS.md` | Bug analysis |
| `docs/bmad/briefs/4NEVER-WORKFLOW-V8.md` | Autonomy vision |
| `docs/bmad/briefs/implementation-briefs-2026-04-22.md` | Implementation briefs |
| `docs/bmad/briefs/research-proposals-009-019.md` | Research proposals |

---

## Overall Assessment

**Completed epics (E1–E4 + FLEET-INFRA-ROLL):** All acceptance criteria met. Work is coherent, smoke-tested, and internally consistent within each epic. Quality of documentation is high — each report includes before/after state, file tables, and verification steps.

**Not started:** E5 (Vault Hooks) and E6 (TUI Dashboard). Both are clearly defined in the architecture doc and appropriately deferred.

**Net verdict:** The upgrade is shippable as-is for E1–E4. The 4 contradictions listed below should be resolved before starting E5/E6 to avoid compounding confusion.

---

## Acceptance Criteria — Per Epic

### E1: Reliability Infrastructure ✅

From `ARCHITECTURE-WORKFLOW-UPGRADE.md` § Epic 1:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `patrol.py` runs every 60s via cron | ✅ | E1 report § Story 1 — cron entry shown |
| Stalled agent detection (10-min threshold) | ✅ | E1 report § Story 1 — `STALL_THRESHOLD_SECONDS = 600` in patrol.py |
| DLQ after 3 consecutive failures | ✅ | E1 report § Story 1 — `MAX_REQUEUE_ATTEMPTS = 3`, DLQ path shown |
| `lib_hermes.py` with `push_envelope`, `make_envelope`, `update_session_state` | ✅ | E1 report § Story 2 — all 3 functions documented |
| `recover-on-startup.py` idempotent crash recovery | ✅ | E1 report § Story 3 — smoke test in idle + crash path both verified |
| Audit trail (`~/.hermes/audit.jsonl`) | ✅ | E1 report § Story 4 — flock-protected, `trace_id` field, jq query shown |

All 5 stories complete, 3 smoke tests passing.

---

### E2: Structured State ✅

From `ARCHITECTURE-WORKFLOW-UPGRADE.md` § Epic 2:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `sessions/active.yaml` — canonical session-state file | ✅ | E2 report § Story 1 — schema and YAML dump shown |
| Envelope schema v2 with `trace_id`, `correlation_id`, typed `type` field | ✅ | E2 report § Story 2 — TypedDict shown, backward-compat note |
| `decisions.jsonl` — structured decision log | ✅ | E2 report § Story 3 — schema + 2 sample entries |
| Typed escalation queues per agent | ✅ | E2 report § Story 4 — `EscalationItem` TypedDict, queue path per agent |

All 4 stories complete.

---

### E3: Role Cards ✅

From `ARCHITECTURE-WORKFLOW-UPGRADE.md` § Epic 3:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Role cards for Developer, Designer, QA, Vault-Keeper | ✅ | E3 report — all 4 cards listed with paths |
| Capability matrix | ✅ | E3 report § Capability Matrix |
| Autonomy levels defined (L0–L3) | ✅ | E3 report — L0 (full auto) through L3 (human approval) |
| Escalation paths documented | ✅ | E3 report § Escalation Paths — all 4 agents |

All deliverables present.

---

### E4: Routing Engine ✅

From `ARCHITECTURE-WORKFLOW-UPGRADE.md` § Epic 4:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `route.py` classifying envelopes by confidence | ✅ | E4 report § route.py — three tiers: >0.8 auto, 0.5–0.8 log, <0.5 escalate |
| `inbox-listener.py` consuming `inbox.jsonl` | ✅ | E4 report § inbox-listener.py — daemon loop shown |
| Hard-block keywords bypass confidence | ✅ | E4 report — `HARD_BLOCK_KEYWORDS` list |
| Scan bug found + fixed during implementation | ✅ | E4 report § Bug Fixed — `scan_inbox` returned on first match; fixed to scan all |
| Live routing test <1s latency | ✅ | E4 report § Smoke Test — latency recorded |

All deliverables present. Bonus: self-discovered and fixed a scan bug during implementation.

---

### FLEET-INFRA-ROLL ✅

| Criterion | Status | Evidence |
|-----------|--------|----------|
| All 4 agent-state JSON files have full 9-field schema | ✅ | FLEET-INFRA-ROLL § Requirement 1 — table with before/after sizes |
| `bus/agent-state.json` includes all 4 agents (7-field schema) | ✅ | FLEET-INFRA-ROLL § Requirement 1 |
| `recover-on-startup.py` wired as step 0 for all 4 agents | ✅ | FLEET-INFRA-ROLL § Requirement 2 — table per agent |
| Zero raw `echo >> inbox.jsonl` patterns in agent configs | ✅ | FLEET-INFRA-ROLL § Requirement 3 — grep command + result shown |
| All 4 agents call `update_session_state` on busy/idle | ✅ | FLEET-INFRA-ROLL § Requirement 4 — smoke test output shown |
| `push-envelope.sh` wrapper created and validated | ✅ | FLEET-INFRA-ROLL § Requirement 3 — exit=0 smoke test via FIFO |

All 4 requirements met. Pasted-snippet quoting bug found and fixed (extracted to wrapper rather than patching 6 places — correct call).

---

## Gaps

### GAP-001 — Stale agent registry ✅ RESOLVED (2026-04-22)
**Location:** `E3-ROLES.md` § Infrastructure Gaps  
**Resolution:** `~/.hermes/subagents/registry.json` updated to version 2:
- Designer corrected: `cli=claude`, `model=claude-sonnet-4-20250514`, `tmux_session=designer-claude`.
- QA added: `tmux_session=qa-claude`, same model, `system_prompt_file=~/.hermes/roles/qa.md`.
- Vault-Keeper added: `tmux_session=vault-keeper`, `project=~/Documents/HermesVault`, `system_prompt_file=~/Documents/HermesVault/CLAUDE.md`.

---

### GAP-002 — FIFO wired to inbox-listener ✅ RESOLVED (2026-04-22)
**Location:** `E4-ROUTING.md` § Follow-ups  
**Verification:** `hermes-bus.py` line 45 defines `forward_to_inbox(envelope: dict)` which is called at line 74 (FIFO backlog replay) and line 96 (live FIFO messages). The bus daemon now forwards all FIFO-delivered envelopes into `inbox.jsonl` for listener consumption — the FIFO is fully wired as a fast input path.  
**Resolution:** No further action required. GAP closed.

---

### GAP-003 — ~25 SKILL.md files still contain raw `echo >> inbox.jsonl` (Priority: P1)
**Location:** `FLEET-INFRA-ROLL.md` § Follow-ups  
**Description:** The done-criteria grep only checked `~/.claude/`, `~/.hermes/subagents/`, and agent configs. Approximately 25 `~/.hermes/skills/*/SKILL.md` files were explicitly deferred. Agents loading these on demand will see the old broken quoting pattern.  
**Recommended action:** One-pass migration of all SKILL.md files to `push-envelope.sh`. Low-risk, mechanical.

---

### GAP-004 — No automated tests for route.py (Priority: P1)
**Location:** `E4-ROUTING.md` § Follow-ups  
**Description:** The routing engine has confidence tiers and hard-block logic — the most safety-critical code in the fleet. No unit tests were written. The E4 follow-up explicitly flags this.  
**Recommended action:** Write pytest unit tests for `route.py`: confidence thresholds, each hard-block keyword, edge cases near the 0.5/0.8 boundaries.

---

### GAP-005 — No systemd / launchd service for inbox-listener (Priority: P2)
**Location:** `E4-ROUTING.md` § Follow-ups  
**Description:** `inbox-listener.py` is started manually. If the machine reboots or the process crashes, routing stops silently. E4 follow-ups list this explicitly.  
**Recommended action:** Add a systemd unit (or launchd plist on macOS) to keep inbox-listener alive with auto-restart.

---

### GAP-006 — Pipeline daemon bugs filed as stories ✅ RESOLVED (2026-04-22)
**Location:** `docs/PIPELINE-DAEMON-ANALYSIS.md`  
**Resolution:** P0 stories filed:
- `docs/bmad/stories/BUG-PIPELINE-001.md` — Bug 1: computeWeekFillStatus/findBestSlots start-date mismatch (infinite loop risk); fix is 5 lines in `lib/weekly-fill.ts`.
- `docs/bmad/stories/BUG-PIPELINE-002.md` — Bug 2: no auto-start of continuous mode on app load; fix is a mount-only `useEffect` in `MashupContext.tsx`.

Bug 3 (UTC/local), Bug 4 (log count), Bug 5 (consequence of Bug 1) remain to be filed as separate stories if Hermes approves.

---

### GAP-007 — Research briefs contain stale parameter values inconsistent with implementation (Priority: P2)
**Location:** `WORKFLOW-UPGRADE-DEV.md` (research sketch)  
**Description:** The research brief was written before implementation and mentions a 5-minute stall threshold. The implemented `patrol.py` uses 10 minutes. Research docs are not canonically marked as superseded. A future developer reading the research brief may use the wrong value.  
**Recommended action:** Add a `> ⚠️ Superseded: see E1-RELIABILITY.md` header to WORKFLOW-UPGRADE-DEV.md and WORKFLOW-UPGRADE-QA.md, or add a `Status: research-only` frontmatter field to research briefs as a convention.

---

## Contradictions

### CON-001 — PROP-022 identity conflict ✅ RESOLVED (2026-04-22)
**Locations:** `docs/bmad/briefs/implementation-briefs-2026-04-22.md` vs `docs/bmad/reviews/E2-STATE.md`  
**Resolution:** In `implementation-briefs-2026-04-22.md`, the bundle-size fix is now called **PROP-022-BUNDLE** and the signing-key hardening (E2/ESC-HUMAN-001) keeps the PROP-022 number. The two items no longer share an identifier.

---

### CON-002 — Stall threshold: 5 min (research) vs 10 min (implementation) (Severity: MEDIUM)
**Locations:** `WORKFLOW-UPGRADE-DEV.md` (research) vs `E1-RELIABILITY.md` (implementation) vs `ARCHITECTURE-WORKFLOW-UPGRADE.md` (architecture)  
**Contradiction:**
- Research brief (`WORKFLOW-UPGRADE-DEV.md`): stall threshold = 5 minutes
- Architecture doc (`ARCHITECTURE-WORKFLOW-UPGRADE.md`): stall threshold = 10 minutes
- Actual implementation (`patrol.py`): `STALL_THRESHOLD_SECONDS = 600` (10 minutes)

Architecture and implementation agree; research brief is stale. Impact: low (implementation wins), but the inconsistency could mislead future contributors. Resolution: mark research brief as superseded (see GAP-007).

---

### CON-003 — V8 quality gates vs patrol implementation (Severity: MEDIUM)
**Locations:** `docs/bmad/briefs/4NEVER-WORKFLOW-V8.md` vs `E1-RELIABILITY.md`  
**Contradiction:**
- `4NEVER-WORKFLOW-V8.md` (autonomy vision) describes quality gates as: lint → type-check → tests → human review, all before any routine task is committed.
- E1's `patrol.py` implements liveness / heartbeat monitoring only; it does not gate commits on lint/test results. Routine tasks self-assign with no quality-gate check.

The V8 vision document describes a future target state; E1 is the current implementation. These are not necessarily in conflict if V8 is understood as aspirational, but neither document clearly marks the other's scope. If agents read V8 as current protocol they will expect quality gates that don't exist yet.  
**Recommended action:** Add a `Status: future-vision` marker to V8, or add an "Implemented subset" section that links to E1-E4.

---

### CON-004 — vault-keeper agent name: `vault` vs `vault_keeper` vs `vault-keeper` (Severity: LOW)
**Locations:** Multiple docs  
**Contradiction:**
- `push-envelope.sh` "from" field uses `vault` (per fleet comms registry).
- `sessions/active.yaml` key uses `vault_keeper` (underscore).
- `agent-state/` filename is `vault-keeper.json` (hyphen).
- `E3-ROLES.md` role card path is `vault-keeper.md` (hyphen).

Three different spellings across four files. The FLEET-INFRA-ROLL doc explicitly notes the `vault_keeper` underscore for `update_session_state`, but doesn't reconcile against the `vault` "from" value used in push-envelope.sh. Currently non-breaking because each slug is used in different contexts, but this will cause bugs if any script tries to cross-reference by name.  
**Recommended action:** Pick one canonical slug (suggest `vault-keeper` as the human-readable form, `vault_keeper` where underscores are required by Python dict keys) and document the mapping explicitly in the fleet comms protocol. Update `FLEET-INFRA-ROLL.md` and `project_fleet_comms_protocol.md` accordingly.

---

## Summary Table

| Item | Type | Priority | Owner |
|------|------|----------|-------|
| GAP-001 Registry stale | ~~Gap~~ RESOLVED | — | — |
| GAP-002 FIFO wired to listener | ~~Gap~~ RESOLVED | — | — |
| GAP-003 25 SKILL.md files with legacy pattern | Gap | P1 | Developer |
| GAP-004 No route.py unit tests | Gap | P1 | Developer |
| GAP-005 No systemd for inbox-listener | Gap | P2 | Developer |
| GAP-006 Pipeline bugs filed as stories | ~~Gap~~ RESOLVED | — | — |
| GAP-007 Stale research parameters | ~~Gap~~ RESOLVED (superseded headers added) | — | — |
| CON-001 PROP-022 identity conflict | ~~Contradiction~~ RESOLVED | — | — |
| CON-002 Stall threshold mismatch | ~~Contradiction~~ RESOLVED (research docs superseded) | — | — |
| CON-003 V8 quality gates vs implementation | Contradiction | MEDIUM | Hermes |
| CON-004 vault-keeper name spelling | Contradiction | LOW | Developer |

---

## Recommendations

1. **Hermes action required (CON-001):** Renumber one of the two PROP-022 items before E5 starts. This is a naming conflict that cannot be self-resolved by Developer.

2. **File pipeline bugs now (GAP-006):** Bug 1 (infinite-loop risk) and Bug 2 (no auto-start) are HIGH severity in a production pipeline. These should be on the task board before the next MashupForge sprint.

3. **Complete E4 FIFO wiring (GAP-002) before E5:** The FIFO path is the correct long-term delivery mechanism. Completing it before adding Vault-Keeper load avoids compounding technical debt.

4. **Mark research briefs as superseded (GAP-007, CON-002, CON-003):** Costs 5 minutes, prevents future confusion.

5. **E5 and E6 are well-specified** and ready to start once the above contradictions are resolved. No blocking gaps in the architecture docs for those epics.
