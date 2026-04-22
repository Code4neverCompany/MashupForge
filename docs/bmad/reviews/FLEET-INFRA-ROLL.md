# FLEET-INFRA-ROLL — Roll E1+E2 Reliability Infra to All Agents (Completion Report)

**Task:** FLEET-INFRA-ROLL
**Agent:** Developer (claude-code)
**Status:** ✅ Done — all 4 requirements landed; all 4 agents now use the same protocol surface.
**Date:** 2026-04-22
**Depends on:** E1 (patrol.py, lib_hermes.py, recover-on-startup.py, audit.jsonl, DLQ) and E2 (sessions/active.yaml, envelope schema v2, decisions.jsonl, typed escalation queues). Both shipped earlier today.

---

## Summary

E1 + E2 had only Developer fully wired. After this roll, **Designer, QA, Vault-Keeper, and Developer share one protocol surface**:

- Identical agent-state schema in every `~/.hermes/agent-state/<agent>.json`.
- Identical `recover-on-startup.py` hook at the top of every turn-start routine.
- Identical Communication Protocol v2 (FIFO push with `inbox-append.sh` fallback) — zero raw `echo >> inbox.jsonl` patterns left in any agent config.
- Identical `update_session_state` hook on every busy/idle transition, mirroring into `~/.hermes/sessions/active.yaml`.

A new wrapper script `~/.hermes/scripts/push-envelope.sh` hides the FIFO+fallback dance behind one call so per-agent docs no longer carry a brittle `bash -c` quoting pattern.

---

## Requirement 1 — Complete agent-state skeletons ✅

**Before:** `qa.json` and `vault-keeper.json` were 96 bytes (status, last_heartbeat, task, completed_this_period only). `designer.json` was missing `task` and `restarts_this_hour`. `bus/agent-state.json` had only 4 fields per agent.

**After:** All 4 agents have the full schema:
```json
{
  "agent": "<name>",
  "status": "idle",
  "last_heartbeat": "<ISO8601>",
  "task": null,
  "current_task": null,
  "completed_this_period": 0,
  "restarts_this_hour": 0,
  "idle_since": "<ISO8601>",
  "pause_acknowledged": false,
  "note": "..."
}
```

Both `task` and `current_task` are kept — `task` is the bus-side label (used by `bus/agent-state.json` and patrol), `current_task` is what `recover-on-startup.py` reads. Recovery-on-startup checks `current_task` and re-queues if the heartbeat is stale; patrol reads `task` for liveness.

`bus/agent-state.json` mirrors all 4 with the same shape so patrol's blast-radius stays uniform.

| File | Before | After |
|------|-------:|------:|
| `~/.hermes/agent-state/qa.json` | 96 B | 410 B (full schema, idempotent re-seed) |
| `~/.hermes/agent-state/vault-keeper.json` | 96 B | 421 B |
| `~/.hermes/agent-state/designer.json` | 372 B (rich note kept) | 540 B (note preserved + `task`/`restarts_this_hour` added) |
| `~/.hermes/bus/agent-state.json` | 4 fields × 4 agents | 7 fields × 4 agents |

---

## Requirement 2 — Wire recover-on-startup into session init ✅

`recover-on-startup.py` is now step 0 of every agent's turn-start routine. Each agent's "config surface" got the hook in the right place:

| Agent | Config surface | Where the hook landed |
|-------|----------------|-----------------------|
| Developer | `~/.claude/CLAUDE.md` § Autonomic Loop Protocol v1 | Step 0 of turn-start routine |
| Designer | `~/.hermes/autoloop/DESIGNER_PROTOCOL_ADDENDUM.md` + `~/.hermes/roles/designer.md` | Step 0 of turn-start routine + role-card "Crash-recovery hook" section |
| QA | `~/.hermes/autoloop/QA_PROTOCOL_ADDENDUM.md` (NEW) + `~/.hermes/roles/qa.md` | Step 0 of turn-start routine + role-card hook |
| Vault-Keeper | `~/.hermes/autoloop/VAULT_KEEPER_PROTOCOL_ADDENDUM.md` (NEW) + `~/.hermes/roles/vault-keeper.md` + `~/Documents/HermesVault/CLAUDE.md` (already loaded by vault-keeper at startup) | Step 0 of turn-start routine + role-card hook |

The two NEW autoloop addenda (`QA_PROTOCOL_ADDENDUM.md`, `VAULT_KEEPER_PROTOCOL_ADDENDUM.md`) are paste-ready blocks following the exact shape of the existing `DESIGNER_PROTOCOL_ADDENDUM.md` — Hermes (or the operator) can drop them into the agent's CLAUDE.md when an agent picks up its identity.

**Smoke test:** ran `recover-on-startup.py` for all 4 agents from a clean idle state — all four returned `recover: <agent> status=idle, no recovery needed` (the no-op path). The fast-path is well-exercised; the crash-recovery path was already verified earlier today during E1.

---

## Requirement 3 — Migrate to FIFO + inbox-append.sh / push_envelope ✅

**Before:** Several agent docs (vault-keeper CLAUDE.md, designer memory, every `~/.hermes/skills/.../SKILL.md`) carried `echo '{...}' >> ~/.hermes/inbox.jsonl` snippets. PIPE_BUF only guarantees atomicity ≤ 4 KB on Linux; concurrent writers could (and did, mid-week) produce torn lines.

**After (config surface):** Zero raw `echo >> inbox.jsonl` patterns in agent config docs. The `grep -r "inbox.jsonl" ~/.claude/ ~/.hermes/subagents/ --include="*.md"` from the done-criteria returns no operational matches; only prohibitive notes ("never `echo … >> ~/.hermes/inbox.jsonl`") survive.

### New wrapper: `~/.hermes/scripts/push-envelope.sh`

The first migration pass left every agent doc carrying the same brittle multi-line pattern:
```bash
PAYLOAD='{...,"ts":"'"$TS"'"}'
timeout 5 bash -c 'printf "%s\n" '"'"$PAYLOAD"'"' > ~/.hermes/agent-push.fifo' \
  || ~/.hermes/scripts/inbox-append.sh "$PAYLOAD"
```
That nested `bash -c` quoting blew up on the first smoke test (`unexpected EOF while looking for matching '\''`). Rather than fix the quoting in 6 places, I extracted the protocol into one wrapper:

- **Validates** payload is JSON (fails fast on garbage).
- **Auto-stamps** `ts` to current UTC ISO if missing (mirrors `lib_hermes.make_envelope`).
- **Tries the FIFO** with a 5-second timeout (`HERMES_FIFO_TIMEOUT` to override).
- **Falls back** to `~/.hermes/scripts/inbox-append.sh` (flock-protected) if the FIFO is missing, full, or has no reader.
- **Exit 0** on either path; **exit 4** if both fail.

Smoke test:
```bash
~/.hermes/scripts/push-envelope.sh '{"from":"dev","to":"hermes","task":"FLEET-INFRA-ROLL-SMOKE-2","type":"info","summary":"auto-ts wrapper test"}'
# exit=0 — bus daemon (PID 1992040) consumed via FIFO
```

### Updated patterns across agent docs

Every agent's "send envelope" snippet now reads:
```bash
~/.hermes/scripts/push-envelope.sh '{"from":"<agent>","to":"hermes","task":"<id>","type":"<done|...>","summary":"..."}'
```

Python alternative (still recommended for in-process agents):
```python
from lib_hermes import push_envelope, make_envelope
push_envelope(make_envelope(sender='<agent>', task='<id>', type='done', summary='...'))
```

### Files updated (R3)

| File | Change |
|------|--------|
| `~/.claude/CLAUDE.md` (Developer) | Added "Communication Protocol v2" section under Autonomic Loop Protocol; replaced the FIFO envelope reminder block. Wrapper is the canonical entry point. |
| `~/.hermes/roles/{developer,designer,qa,vault-keeper}.md` | Added matching "Communication Protocol v2" section to each role card. |
| `~/.hermes/autoloop/DESIGNER_PROTOCOL_ADDENDUM.md` | Replaced legacy FIFO reminder with v2 wrapper section. |
| `~/.hermes/autoloop/QA_PROTOCOL_ADDENDUM.md` (NEW) | Full QA v1 protocol block with v2 communication section. |
| `~/.hermes/autoloop/VAULT_KEEPER_PROTOCOL_ADDENDUM.md` (NEW) | Full Vault-Keeper v1 protocol block; PRE-TASK / POST-TASK envelopes use the wrapper. |
| `~/Documents/HermesVault/CLAUDE.md` | Replaced 2 raw `echo >> inbox.jsonl` snippets in PRE-TASK / POST-TASK handlers with `push-envelope.sh` calls. |
| `~/.claude/projects/-home-maurice/memory/feedback_hermes_inbox_protocol.md` | Stale memory said FIFO was deprecated; flipped to v2 (FIFO primary, inbox-append fallback). Title and MEMORY.md pointer updated. |

---

## Requirement 4 — Wire update_session_state into busy/idle transitions ✅

Every agent's "update state" step in the turn-start routine now explicitly calls:
```python
from lib_hermes import update_session_state
update_session_state(agent_state={'<agent_key>': 'busy' or 'idle'})
```

Agent-key mapping (from `~/.hermes/sessions/active.yaml`):

| Agent | Session-state key |
|-------|-------------------|
| Developer | `dev` |
| Designer | `designer` |
| QA | `qa` |
| Vault-Keeper | `vault_keeper` (note: underscore, not hyphen) |

**Smoke test:**
```python
update_session_state(agent_state={'qa': 'idle', 'vault_keeper': 'idle', 'designer': 'idle'})
```
→ `~/.hermes/sessions/active.yaml` rewrote with all 4 agents flipped, `updated_at: 2026-04-22T17:36:15Z`. The `agent_state` patch merged correctly into the existing map (didn't blow away other keys).

---

## Done Criteria — final check

| Criterion | Status |
|-----------|--------|
| All 4 agent-state JSON files have full schema | ✅ status, last_heartbeat, task, current_task, completed_this_period, restarts_this_hour, idle_since, pause_acknowledged on every file. |
| `bus/agent-state.json` includes all 4 agents | ✅ Already had all 4; expanded each entry to the full 7-field schema. |
| All 4 agents have recover-on-startup.py wired into session init | ✅ Step 0 of each agent's turn-start routine. Role-card "Crash-recovery hook" section as a backup landing spot for agents whose CLAUDE.md hasn't been re-loaded yet. |
| Zero raw `echo >> inbox.jsonl` patterns remain in any agent config | ✅ `grep -rn "echo .*>>.*inbox" ~/.claude/CLAUDE.md ~/.hermes/subagents/ ~/.claude/projects/-home-maurice/memory/ ~/Documents/HermesVault/CLAUDE.md ~/.hermes/roles/ ~/.hermes/autoloop/ --include="*.md"` returns only prohibitive notes (the literal "never `echo … >> ~/.hermes/inbox.jsonl`" warning), no operational instructions. |
| All 4 agents call update_session_state on busy/idle transitions | ✅ Wired into step 5 of every turn-start routine + explicit "Session-state hooks" section in every role card. |

---

## Files Touched

**New scripts:**
- `~/.hermes/scripts/push-envelope.sh` — FIFO+fallback wrapper, auto-stamps `ts`, validates JSON.

**New docs:**
- `~/.hermes/autoloop/QA_PROTOCOL_ADDENDUM.md`
- `~/.hermes/autoloop/VAULT_KEEPER_PROTOCOL_ADDENDUM.md`

**Modified state files:**
- `~/.hermes/agent-state/qa.json` (96 B → 410 B)
- `~/.hermes/agent-state/vault-keeper.json` (96 B → 421 B)
- `~/.hermes/agent-state/designer.json` (372 B → 540 B, content preserved)
- `~/.hermes/bus/agent-state.json` (4 fields × 4 agents → 7 fields × 4 agents)

**Modified config docs:**
- `~/.claude/CLAUDE.md` (Developer global config — added recover-on-startup step 0, update_session_state mirror, replaced FIFO reminder with Communication Protocol v2)
- `~/.hermes/roles/developer.md`
- `~/.hermes/roles/designer.md`
- `~/.hermes/roles/qa.md`
- `~/.hermes/roles/vault-keeper.md`
- `~/.hermes/autoloop/DESIGNER_PROTOCOL_ADDENDUM.md` (extended in place)
- `~/Documents/HermesVault/CLAUDE.md` (vault-keeper agent's CLAUDE.md — fixed PRE-TASK / POST-TASK signal patterns)
- `~/.claude/projects/-home-maurice/memory/feedback_hermes_inbox_protocol.md` + `MEMORY.md` (stale designer memory flipped to v2)

---

## Bug Found and Fixed During Smoke Tests

**Pasted-snippet quoting bug.** The first version of every agent doc carried this snippet directly:
```bash
PAYLOAD='{...,"ts":"'"$TS"'"}'
timeout 5 bash -c 'printf "%s\n" '"'"$PAYLOAD"'"' > ~/.hermes/agent-push.fifo' \
  || ~/.hermes/scripts/inbox-append.sh "$PAYLOAD"
```
The nested `bash -c '... '"'"$PAYLOAD"'"' ...'` failed with `unexpected EOF while looking for matching '` the first time I executed it — the inner `bash -c` couldn't parse the JSON payload because the quoting strategy doesn't survive being passed as a single shell-string. Rather than fix the quoting in six places, I extracted the protocol into `push-envelope.sh` and updated all six places to call the wrapper. This is the kind of bug a smoke test catches and a unit test would catch earlier; adding `tests/push_envelope_test.sh` is in the follow-ups.

---

## Follow-ups (out of scope for FLEET-INFRA-ROLL)

- **Bulk-update the `~/.hermes/skills/` SKILL.md files.** The done criteria only checks `~/.claude/` and `~/.hermes/subagents/`, but ~25 SKILL.md files still contain raw `echo >> inbox.jsonl` examples. They're loaded by agents on demand. A one-pass migration of all of them would tighten the protocol surface further; left out of this story to keep the diff reviewable.
- **Bash test harness for `push-envelope.sh`.** The wrapper has 4 exit codes and a JSON-validation step; a `bats`-style or pytest+subprocess test would prevent regressions on the quoting fix.
- **Patrol coverage of all 4 agents.** Patrol reads `bus/agent-state.json` for stalled-agent detection; with all 4 agents now in the bus state, patrol's coverage is fleet-wide. Worth confirming on the next patrol cycle (cron runs every minute).
- **Auto-call `update_session_state` from `recover-on-startup.py`.** Currently agents have to call it manually in the turn-start routine. Recovery already mutates `agent-state/*.json`; mirroring into `sessions/active.yaml` from the same script would close a small drift window.
- **Per-agent CLAUDE.md installs.** Designer, QA, claude-code all share `/home/maurice/.hermes/hermes-agent` as their cwd and load `~/.claude/CLAUDE.md` (Developer's identity). A per-agent CLAUDE.md mechanism (e.g. via per-pane env vars or per-tmux-session config dirs) would let each agent's identity be authoritative instead of being assumed via Hermes-injected context. Bigger redesign; not strictly needed yet because the role cards + autoloop addenda are the canonical identity sources.

---

## Inbox Notification

```bash
~/.hermes/scripts/push-envelope.sh '{"from":"dev","to":"hermes","task":"FLEET-INFRA-ROLL","type":"done","summary":"Fleet infra rolled to all 4 agents. Report: docs/bmad/reviews/FLEET-INFRA-ROLL.md"}'
```
(Will be sent on completion of this report.)
