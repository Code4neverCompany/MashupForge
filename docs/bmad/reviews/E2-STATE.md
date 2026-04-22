# E2 — Structured State (Completion Report)

**Epic:** EPIE-002 — Structured State
**Agent:** Developer (claude-code)
**Status:** ✅ Done — all 4 stories shipped, smoke-tested
**Date:** 2026-04-22
**Depends on:** E1 Reliability (shipped earlier today)

---

## Stories Delivered

| Story | What | Where | Tested |
|-------|------|-------|--------|
| S6 | Session state YAML | `~/.hermes/sessions/active.yaml` + lib helpers | ✅ read/write + agent_state merge |
| S7 | Envelope schema v2 | `lib_hermes.make_envelope/push_envelope` + `send-envelope.py` CLI | ✅ v2 + `--legacy` mode + v1 backward compat |
| S8 | Decision log | `~/.hermes/decisions.jsonl` + lib helpers + `seed-decisions.py` | ✅ 15 historical decisions backfilled, lookup verified, idempotent re-run |
| S9 | Typed escalation queues | `~/.hermes/escalations/{code,infra,human}.md` + PROP-022 migrated | ✅ files seeded with headers, ESC-HUMAN-001 created |

---

## File Inventory

**Helpers added to `~/.hermes/scripts/lib_hermes.py`:**
- `read_session_state()` / `write_session_state()` / `update_session_state(**fields)` — YAML active-session I/O under flock
- `make_envelope(...)` — v2 envelope builder (backward compatible)
- `push_envelope(env)` — flock-protected inbox append
- `record_decision(...)` / `lookup_decisions(...)` — decisions.jsonl helpers
- New constants: `ACTIVE_SESSION`, `DECISIONS`, `ESCALATIONS_DIR`, `ENVELOPE_SCHEMA_VERSION = 2`, `DEFAULT_AGENTS`

**New scripts:**
- `~/.hermes/scripts/send-envelope.py` — argparse CLI wrapping `make_envelope` + `push_envelope`. Supports `--dry-run` and `--legacy`.
- `~/.hermes/scripts/seed-decisions.py` — one-shot bootstrap for `decisions.jsonl` from `proposals.md`. Idempotent.

**New runtime files:**
- `~/.hermes/sessions/active.yaml` — single source of truth for hot-tier session state
- `~/.hermes/decisions.jsonl` — append-only decision log (15 historical entries backfilled)
- `~/.hermes/escalations/code.md`, `infra.md`, `human.md` — typed escalation queues

**Mutations to existing files:**
- `~/.hermes/proposals.md` — added migration banner at top, stamped PROP-022 with `Status: MIGRATED → ESC-HUMAN-001`

---

## Schema Notes

### S6 — `active.yaml` shape

```yaml
active_project: mashupforge
agent_state:
  designer: idle
  dev: idle
  qa: idle
  vault_keeper: idle
last_commit: 2fba6f7
open_tasks:
- EPIE-002
provider: xiaomi/mimo-v2-pro
session: '2026-04-22'
updated_at: '2026-04-22T17:05:57Z'
```

`update_session_state(...)` is the merge-friendly entry point — pass
`agent_state={'dev': 'busy'}` and only that key changes (the other
agents stay as they were). Always atomic two-phase write under flock.

### S7 — Envelope schema v2

Envelopes now carry a `schema: 2` marker plus the v2 fields from the
brief. Backward compatibility is double-rooted:

1. **Old readers ignore unknown keys.** v1 readers see `from`/`task`/`ts`
   exactly as before; the extra fields are no-ops to them.
2. **Old writers still work.** `inbox-append.sh` from E1 still appends
   any JSON line without modification — confirmed via smoke test.

`send-envelope.py` shape:

```bash
~/.hermes/scripts/send-envelope.py \
  --from developer --task EPIE-002 --type done \
  --confidence 0.95 --summary "..." \
  --context-bundle file1,file2 --proposal-id PROP-022
```

Result:
```json
{"confidence":0.95,"context_bundle":["file1","file2"],"from":"developer",
 "proposal_id":"PROP-022","schema":2,"summary":"...","task":"EPIE-002",
 "to":"hermes","ts":"2026-04-22T17:06:20Z","type":"done"}
```

`--legacy` strips the `schema` key and any default-empty v2 fields, for
emitting in contexts where strict v1 jq filters are still in play.

### S8 — `decisions.jsonl` schema

```json
{"decision_id":"D-0001","proposal_id":"PROP-001","decision":"approved",
 "rationale":"...","decided_by":"maurice","ts":"2026-04-14T07:48:00+02:00"}
```

Valid `decision` values: `approved`, `rejected`, `modified`. Backfilled
entries carry `"backfilled": true` so the orchestrator can distinguish
historical reconstruction from real-time decisions.

`lookup_decisions(proposal_id="PROP-XXX")` and
`lookup_decisions(contains="signing-key")` are the query helpers
agents use when proposing similar items — Pillar 2 calls this
"agents cite precedent."

### S9 — Typed escalation queues

Each file carries a header explaining its routing rule and the
`## ESC-{KIND}-NNN` block format. The decision lifecycle ends in
`decisions.jsonl` (the `Resolution` field on each block stores the
`decision_id` once decided), keeping audit/decision trails unified.

PROP-022 (Tauri updater signing-key hardening) was the only PENDING
item in `proposals.md` and got migrated to `human.md` as **ESC-HUMAN-001**.
That's a security/policy call — `human.md` is hard-block, no auto-approve.

---

## Done Criteria

| Criterion | Status |
|-----------|--------|
| `sessions/active.yaml` reflects machine-readable hot-tier state | ✅ Initialized from live `agent-state/*.json` snapshot. Update helper merges per-agent fields cleanly. |
| Envelope schema v2 fields available, backward-compatible | ✅ `make_envelope` builds v2 + `inbox-append.sh` v1 callers still work. Smoke-tested both ways. |
| `decisions.jsonl` exists, append-only, flock-protected | ✅ 15 entries backfilled from proposals.md; lookup-by-proposal-id verified; idempotency on re-run verified. |
| Typed escalation queues exist with active items migrated | ✅ Three files seeded; PROP-022 migrated to `ESC-HUMAN-001`. proposals.md banner points readers to the new home. |

---

## Smoke Test Evidence

1. **active.yaml round-trip** — wrote initial state from live `agent-state/*.json`, called `update_session_state(agent_state={'dev':'busy'})`, confirmed only `dev` flipped (other three stayed `idle`), `updated_at` advanced. Reset back to `idle`.

2. **v2 envelope construction** — `send-envelope.py --dry-run` produced the expected v2 shape with `schema: 2`, all fields populated. `--legacy` stripped `schema` and default-empty fields.

3. **v1 backward compat** — `inbox-append.sh '{"from":"smoketest","task":"BC-1","status":"done"}'` appended cleanly; no schema field was injected by the wrapper. Old jq filters keep working.

4. **decisions.jsonl seeding** — first run wrote 15 entries (PROP-001 through PROP-021, skipping PROP-022 which is still pending); second run reported `no new decisions to seed` (idempotent). `lookup_decisions(proposal_id="PROP-001")` returned the expected single entry.

5. **PROP-022 migration** — proposals.md PROP-022 stamped `MIGRATED`, `human.md` carries the full ESC-HUMAN-001 block with summary, deliverables, blast-radius, and a backlink to the original proposals.md range.

---

## Follow-ups (out of scope for E2)

- **Wire `update_session_state` into agent-side state transitions.** Each agent should call it on `task_start`/`task_done`/`busy`/`idle` flips so `active.yaml` stays current without polling. The helper is shipped; the call sites are the orchestrator's responsibility.
- **Vault-keeper post-write hook.** S6 calls for vault-keeper updating `active.yaml` after every vault write. The helper exists; vault-keeper integration lands with E5 (Vault Hooks).
- **Symlink `~/Documents/HermesVault/sessions/active.yaml → ~/.hermes/sessions/active.yaml`** per the architecture doc's vault layout. Skipped here because vault layout is out of E2 scope and the symlink target should be owned by E5 to avoid double-writes.
- **Migrate other `echo >> inbox.jsonl` callers to `send-envelope.py`** so all new writes land as v2. Callers in agent CLAUDE.md docs are the orchestrator's surface, deferred per E1 follow-up.
- **TUI rendering of decisions.jsonl precedent** — Pillar 2 mentions dashboard renders precedent on relevant proposals. Lands with E6 (Dashboard).

---

## Inbox Notification

```json
{"from":"developer","task":"EPIE-002","status":"done","ts":"2026-04-22T17:03:48Z","summary":"E2 Structured State shipped"}
```
