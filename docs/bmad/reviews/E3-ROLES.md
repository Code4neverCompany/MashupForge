# E3-ROLES — Completion Report

**Task:** Epic 3 — Role Cards & Identity (S10 + S11)
**Epic ID:** EPIE-003-ROLES
**Priority:** P1
**Effort:** ~0.5 day (executed in ~1h)
**Executed by:** Designer (standing in via Developer session — Designer's tmux was attached but task was dispatched to this session)
**Date:** 2026-04-22

---

## What shipped

### Story S10 — Agent Role Cards (4 files)

All four role cards live under `~/.hermes/roles/` with identical schema:

| File | Agent | tmux | State file exists? |
|------|-------|------|:---:|
| `~/.hermes/roles/developer.md` | Developer | `claude-code` | ✅ |
| `~/.hermes/roles/designer.md` | Designer | `designer-claude` | ✅ |
| `~/.hermes/roles/qa.md` | QA | `qa-claude` | ❌ (flagged) |
| `~/.hermes/roles/vault-keeper.md` | Vault-Keeper | `vault-keeper` | ❌ (flagged) |

Every card has the full schema sections: **Identity**, **Scope** (Owns / Collaborates / Avoids), **Boundaries** (must_escalate_when, max_autonomous_lines, max_autonomous_tasks_per_period, blast_radius), **Communication**.

### Story S11 — Specialization Matrix (1 file)

`~/.hermes/roles/matrix.md` — 14 task categories × 4 agents, cells marked `OWNS` / `COLLAB` / `AVOIDS`. Includes a row-by-row reading guide and a revision protocol (changes route through `proposals.md` as `PROP-MATRIX-NNN`).

Categories covered per spec:
code-implementation, ui-design, css-styling, accessibility, code-review, testing, ci-infra, vault-management, knowledge-distillation, research, documentation, config-changes, security, release-management.

---

## Key design decisions

1. **Schema is symmetric across all 4 agents.** Every role card has the same sections in the same order, even where a field doesn't apply (e.g. Vault-Keeper's `max_autonomous_lines: unbounded` for vault pages). This makes the dashboard tooltip rendering trivial and eliminates the asymmetry that motivated this epic.

2. **Anchored `Avoids` sections to real incidents.**
   - **Designer** has an explicit rule "no direct edits to files > 2000 LOC" — this captures the Gemini-hallucination incident on `MainContent.tsx` (5553 LOC) that triggered the original UI-ownership transfer to Developer. The card documents the transfer rather than leaving it as tribal knowledge in Developer's `memory.md`.
   - **Developer** inherits and formalizes the classification rubric from `~/.claude/CLAUDE.md` — routine/complex tripwires explicitly list config files, cross-file refactors ≥ 3 files, dep changes, and schema-shape changes.
   - **QA** has `max_autonomous_lines: 0` for production code — QA writes tests and review notes; Developer ships fixes. Prevents the anti-pattern of QA silently editing production code during a review.
   - **Vault-Keeper** has `max_autonomous_lines: unbounded` for vault pages but `0` for project code — mirrors the symmetric constraint.

3. **`config-changes` has no autonomous owner.** The matrix marks Developer as `COLLAB (after Hermes approval)` and everyone else `AVOIDS`. The only path to a config change is a proposal lifted to Hermes. This codifies the existing autoloop protocol v1 behavior.

4. **`ci-infra` is Developer-owned.** History supports this: Developer shipped `tauri-windows.yml` (commit fd93edb), `build-windows.ps1`, the fetch-node / bake-pi / copy-standalone scripts, and the pre-commit hook. QA collaborates only on test-gate thresholds.

5. **`security` is QA-owned.** QA does the review; Developer implements the fix once QA scopes it. This is the cleanest separation — the agent that writes code should not also be the agent that approves it as secure.

6. **Vault-Keeper owns `research` and `documentation` categories.** Any agent can *conduct* research (web searches, exploration) but output flows into the vault for cross-referencing. This matches the existing pattern where `WORKFLOW-UPGRADE-RESEARCH` envelopes come in from all four agents but vault-keeper files the distilled wiki pages.

---

## Gaps flagged

These are real infrastructure gaps surfaced by the exercise — worth filing as follow-up stories:

| Gap | Impact | Suggested fix |
|---|---|---|
| No `~/.hermes/queues/developer.json` file (Developer's CLAUDE.md expects one at v1 protocol; work currently routes via `task-board.json`) | Developer's autoloop can't pull tasks by file per spec | Seed as `[]` and let the protocol v1 tick consume it |
| No state file for QA or Vault-Keeper | Patrol loop (Pillar 1 per ARCHITECTURE doc) can't detect stuck QA / vault-keeper sessions | Create `~/.hermes/agent-state/qa.json` + `vault-keeper.json` with initial `{status: "idle", last_heartbeat: "...", completed_this_period: 0}` |
| No subagent directory for QA or Vault-Keeper (`~/.hermes/subagents/qa/`, `/vault-keeper/`) | No task-board history, no persistent memory file | Create both dirs with empty `task-board.json` + `memory.md` seed |
| Registry is stale — shows Designer as `gemini-3.1-flash-lite-preview` on tmux `gemini-designer`; reality is Claude on `designer-claude` | Any automated dispatcher that reads `~/.hermes/subagents/registry.json` will mis-route to a dead session | Update `registry.json` in a follow-up — this is a config-change-adjacent fix that likely routes through Hermes |
| No `qa` or `vault-keeper` entry in the registry at all (file only lists developer + designer) | Same mis-routing risk | Add both agents to `registry.json` |

None of these block Epic 3 completion. All are listed here so Hermes can file them as follow-ups (suggested ID: `FLEET-INFRA-SEED`).

---

## How this composes with the ARCHITECTURE-WORKFLOW-UPGRADE doc

Per `docs/bmad/ARCHITECTURE-WORKFLOW-UPGRADE.md`, Epic 3 is part of **Pillar 3 — Routing & Identity (P1)**. The role cards + matrix shipped here are the foundation for:

- **E4 — Routing Engine** — needs the matrix to resolve "which agent gets dispatched for category X"
- **E6 — TUI Dashboard** — renders role cards as tooltips and the matrix as a reference tab

Specifically, the `confidence routing` planned for E4 (> 0.8 → auto, 0.5–0.8 → auto+log, < 0.5 → escalate) can now consult both the agent's role-card `must_escalate_when` list and the matrix cell to decide routing. Those two signals are authoritative together; alone, either is insufficient.

---

## Done criteria (from story)

- [x] 4 role cards created with identical schema
- [x] Specialization matrix covers all task categories
- [x] Each role card has concrete `must_escalate_when` list (5–8 items each)
- [x] No asymmetric gaps between agents (every card has all sections filled; any "to be seeded" entry explicitly flagged)

---

## Files changed / created

```
~/.hermes/roles/developer.md         NEW
~/.hermes/roles/designer.md          NEW
~/.hermes/roles/qa.md                NEW
~/.hermes/roles/vault-keeper.md      NEW
~/.hermes/roles/matrix.md            NEW
docs/bmad/reviews/E3-ROLES.md        NEW (this file)
```

No code changes, no config-file touches. Pure documentation artifact under `~/.hermes/` plus the completion report in the project repo.
