# E4 — Routing Engine (Completion Report)

**Epic:** EPIE-004 — Routing Engine
**Agent:** Developer (claude-code)
**Status:** ✅ Done — all 3 stories shipped, listener live as background process
**Date:** 2026-04-22
**Depends on:** E2 (Structured State, envelope schema v2 + decisions.jsonl) and E3 (Role Cards, specialization matrix). Both shipped earlier today.

---

## Stories Delivered

| Story | What | Where | Tested |
|-------|------|-------|--------|
| S12 | Confidence routing (auto / log / escalate / human) | `route.py:decide()` | ✅ 8 CLI scenarios, 4 live envelopes |
| S13 | Typed routing table (prefix → matrix → topic → default) | `route.py` (`PREFIX_TO_AGENT`, `_load_owners`, `TOPIC_TO_AGENT`) | ✅ All routes verified, scan-bug found and fixed |
| S14 | inbox-listener.py real-time reactor | `inbox-listener.py` + `notify-hermes.sh` integration | ✅ Daemonized, end-to-end Hermes nudge confirmed in <1s |

---

## File Inventory

**New scripts (`~/.hermes/scripts/`):**
- `route.py` — single-entry `decide(envelope) → RoutingDecision` with CLI. Combines S12 and S13.
- `inbox-listener.py` — long-lived tail-follower of `inbox.jsonl`. Calls `route.decide()` on every new envelope, audits the decision, and pings Hermes via `notify-hermes.sh` when the route requires human attention. Has `--once` mode for cron-style draining and `--reset` to skip backlog.
- `notify-hermes.sh` — direct tmux-pane nudge for Hermes (built earlier this session in response to user ask). Listener uses it under the hood; agents can also call it ad-hoc.

**New runtime files:**
- `~/.hermes/inbox-listener.offset` — tiny cursor file so a restart doesn't re-fire on already-seen envelopes.
- `~/.hermes/inbox-listener.log` — listener stdout/stderr.

**Background process:**
- `inbox-listener.py` running under `nohup` (PID confirmed via `pgrep -af inbox-listener.py`). Survives shell exits; kill with `pkill -f inbox-listener.py` and re-launch on demand.

---

## Routing Logic (S12 + S13 Combined)

`decide(envelope)` evaluates these rules in order — first match wins:

1. **Hard human-block** — any of `auth`, `oauth`, `password`, `credential`, `secret`, `signing-key`, `signing key`, `private key`, `minisign`, `payment`, `stripe`, `billing`, `brand voice`, `trademark`, `security`, `exploit`, `cve`, `vulnerab`, `pii`, `gdpr` appearing in `task | topic | summary | proposal_id | detail | reason` → `escalate:human` regardless of confidence. The `human.md` queue is hard-block; no auto-approval ever.

2. **Explicit `type=escalate`** — route by topic to `escalate:infra` (CI/workflow/config), `escalate:human` (security/policy), or `escalate:code` (default).

3. **Owner selection** — first non-None of:
   - **Task-ID prefix** match (`BUG-` → developer, `DESIGN-` → designer, `QA-` → qa, `VAULT-` → vault-keeper, etc.)
   - **Specialization-matrix match** (loaded from `~/.hermes/roles/matrix.md` `OWNS` cells; cached after first load)
   - **Topic substring** match (vault keywords first, then qa, designer, developer in that order — order matters because earlier matches win)
   - **Default**: developer

4. **Confidence band** within owner:
   - `classification == complex` → `escalate:code` (or `:infra`/`:human` if topic warrants)
   - `confidence > 0.8` → `auto-execute` by owner
   - `0.5 ≤ confidence ≤ 0.8` → `auto-execute-log` (run + log for batch review)
   - `confidence < 0.5` → `escalate:code`
   - `confidence missing` (legacy v1 envelope) → `queue:owner` and flag in audit detail so v1 holdouts surface

5. Every call appends one audit line (`proposal_lifted` for escalations, `message_received` otherwise) tagged with the trace_id from the envelope (or a fresh one if missing).

### Routing decision matrix — verified outcomes

| Test envelope | Expected route | Owner | Got |
|---|---|---|---|
| `BUG-077 conf=0.92 routine "fix typescript any"` | auto-execute | developer | ✅ |
| `POLISH-014 conf=0.65 "tailwind layout polish"` | auto-execute-log | designer | ✅ |
| `FIX-200 conf=0.3 "refactor pipeline"` | escalate:code | developer | ✅ |
| `PROP-022 conf=0.99 "tauri signing-key rotation"` | escalate:human | (none) | ✅ — hard-block beats high confidence |
| `ESC-CI-007 type=escalate "github actions workflow"` | escalate:infra | (none) | ✅ |
| `TEST-100 conf=0.7 complex "regression test strategy"` | escalate:code | qa | ✅ |
| `BUG-001 (no confidence) "fix bug"` | queue:developer | developer | ✅ — legacy flagged |
| `VAULT-77 conf=0.9 "wiki cross-ref"` | auto-execute | vault-keeper | ✅ |

---

## inbox-listener.py Behavior (S14)

- Tails `~/.hermes/inbox.jsonl` with a 0.5s poll interval (CPU-light; below the threshold of human perception).
- Maintains a byte-offset cursor at `~/.hermes/inbox-listener.offset`. Replay-safe: if the listener crashes or the host reboots, restart resumes from the last consumed byte. If the inbox is rotated/truncated below the cursor, the listener detects that by file-size comparison and resets to 0.
- For each new envelope: parse JSON → `route.decide(env)` (which audits the decision) → if route starts with `escalate:` OR envelope has `to: hermes` AND `type ∈ {question, blocked, escalate, done}`, fire `notify-hermes.sh` with a one-line nudge.
- Crash-resistant: every loop body wrapped in try/except, errors audited and the loop continues.
- Modes:
  - `inbox-listener.py` (foreground)
  - `nohup ... &` (background daemon — current setup)
  - `--once` — drain backlog from cursor to EOF and exit (for cron polling if daemon dies)
  - `--reset` — set cursor to current EOF before listening (skip historical backlog on first install)

### End-to-end live test

Dropped a hard-block envelope into the inbox via `inbox-append.sh`:
```json
{"from":"smoketest","task":"SMOKE-E4-LIVE","type":"escalate",
 "topic":"oauth credential rotation","summary":"live test of inbox-listener tmux nudge",
 "ts":"2026-04-22T17:22:00Z"}
```
Within ~1s, Hermes' tmux pane showed:
```
Queued for the next turn: [bus] smoketest escalate SMOKE-E4-LIVE → route=escalate:human. live test of i…
```
Audit got the corresponding `proposal_lifted` line with `route=escalate:human` and `reason=hard-block keyword`. End-to-end latency: under 1 second, satisfying the brief.

---

## Bug Found and Fixed During Smoke Tests

The first version of `_scan_text(envelope)` included `from`, `to`, and `type` in the searchable blob. When a test envelope was `from: "smoketest"`, the substring `"test"` matched qa's keyword and routed everything to qa. Fixed by restricting the scan to content fields only (`task`, `topic`, `summary`, `proposal_id`, `detail`, `reason`). Re-ran all 8 routing scenarios — all correct.

This is the kind of bug a smoke-test catches and a unit-test would have caught earlier; adding routing tests to the suite is in the follow-ups list below.

---

## Done Criteria

| Criterion | Status |
|-----------|--------|
| Confidence routing active on all envelopes | ✅ `decide()` consumes `confidence`, `classification`, `type`, plus content fields. Default for legacy envelopes (no confidence) is `queue:owner` with audit flag. |
| `route.py` correctly classifies 5+ test cases | ✅ 8 distinct CLI scenarios verified; 4 live envelopes drained through the listener. |
| `inbox-listener.py` fires Hermes within 1s of envelope arrival | ✅ Live test latency ≈1s (0.5s poll + tmux send). Hermes pane received nudge before the test sleep ended. |
| All routing decisions logged to audit.jsonl | ✅ Every `decide()` call appends one audit line (`proposal_lifted` for escalations, `message_received` otherwise) with trace_id, route, owner, confidence, reason. |

---

## Follow-ups (out of scope for E4)

- **Routing unit tests.** The scan-bug would have been caught by a dozen-line pytest suite over `decide()` covering each routing rule. Adding `tests/route_test.py` is mechanical; left out of E4 to keep scope tight.
- **systemd unit for the listener.** Right now it's `nohup ... &`. A `~/.config/systemd/user/hermes-inbox-listener.service` with `Restart=on-failure` would survive logout cleanly. Pairs with E1's cron pattern.
- **Listener nudge throttling.** If a flood of envelopes arrives, Hermes gets one tmux send-keys per envelope. Coalescing (e.g. one nudge per 2s window) is worth adding once we see it under load — premature without numbers.
- **Routing matrix updates from `decisions.jsonl` precedent.** When PROP-NNN decisions accumulate in a topic area, the routing table could auto-promote/demote topic mappings. Pillar 3 alludes to this but it's a separate epic.
- **Wire `agent-push.fifo` as an alternate input** so existing `>fifo` pushes also flow through the listener. Right now FIFO has no reader; the listener only consumes inbox.jsonl. The architecture intent was real-time on FIFO + durable on inbox; this works because inbox-append also lands quickly, but a unified consumer would be cleaner.

---

## Inbox Notification

```json
{"from":"developer","task":"EPIE-004","status":"done","summary":"E4 shipped"}
```

(Will be sent via `inbox-append.sh` and `notify-hermes.sh` on completion of this report.)
