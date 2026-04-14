# BMAD Workflow Analysis

**Researched by:** Developer agent
**Date:** 2026-04-14
**Repo analyzed:** https://github.com/bmadcode/BMAD-METHOD @ tag `v4.44.3` (last stable v4 tree with the canonical `bmad-core/` layout; v5/v6 reorganized into `src/bmm-skills/` modules but the phase/agent/artifact model is unchanged).
**Primary source files:**

- `bmad-core/workflows/greenfield-fullstack.yaml`
- `bmad-core/workflows/greenfield-service.yaml`
- `bmad-core/workflows/greenfield-ui.yaml`
- `bmad-core/workflows/brownfield-fullstack.yaml`
- `bmad-core/workflows/brownfield-service.yaml`
- `bmad-core/workflows/brownfield-ui.yaml`
- `bmad-core/agents/{analyst,pm,architect,po,sm,dev,qa,ux-expert}.md`
- `bmad-core/templates/*.yaml`
- `bmad-core/tasks/{shard-doc,create-next-story,document-project,brownfield-create-epic,brownfield-create-story}.md`
- `docs/user-guide.md`
- `docs/working-in-the-brownfield.md`

BMAD splits work into two macro-phases:

1. **Planning Workflow** — ideally run in a web UI (Gemini/Claude.ai) for cheap large-context reasoning. Produces `docs/prd.md`, `docs/architecture.md`, and optional UX/brief artifacts.
2. **Core Development Cycle** — run in an IDE (Cursor/Claude Code) after PO shards the planning docs into `docs/prd/` and `docs/architecture/`. SM drafts stories, Dev implements, QA gates.

The planning-vs-dev split is explicit in `docs/user-guide.md` lines 5–98 and is the same for greenfield and brownfield. What differs is the planning front-end: greenfield starts at `analyst → project-brief.md`; brownfield starts at `analyst → enhancement classification` plus `architect → document-project` to build a snapshot of the existing system first.

---

## Greenfield workflow — phases

Canonical sequence taken from `bmad-core/workflows/greenfield-fullstack.yaml` (the service and UI variants are identical except for which architecture template they use and whether the UX phase runs). Phase numbers are mine; the YAML is a linear `sequence:` list, not a numbered one.

| # | Phase | Agent (persona) | Inputs | Outputs (artifact) | Standard path | Template / task |
|---|---|---|---|---|---|---|
| 1 | Project brief (optional brainstorming + market research first) | `analyst` (**Mary**, Business Analyst) | User idea; optional brainstorm, market research, competitor analysis | `project-brief.md` | `docs/brief.md` (template default) / `docs/project-brief.md` (workflow note) | `project-brief-tmpl.yaml`; optional tasks `facilitate-brainstorming-session.md`, `create-deep-research-prompt.md` |
| 2 | PRD | `pm` (**John**, Product Manager) | `project-brief.md` | `prd.md` with FRs, NFRs, epics, stories | `docs/prd.md` | `prd-tmpl.yaml` via `create-doc.md` (`*create-prd`) |
| 3 | UX spec (fullstack + UI workflows only) | `ux-expert` (**Sally**, UX Expert) | `prd.md`; optional user research | `front-end-spec.md` | `docs/front-end-spec.md` | `front-end-spec-tmpl.yaml` (`*create-front-end-spec`) |
| 3a | AI UI prompt (optional) | `ux-expert` | `front-end-spec.md` | v0/Lovable prompt (no repo artifact) | — | `generate-ai-frontend-prompt.md` (`*generate-ui-prompt`) |
| 4 | Architecture | `architect` (**Winston**, Architect) | `prd.md` + `front-end-spec.md` (fullstack); just `prd.md` (service); `front-end-spec.md` (ui) | `fullstack-architecture.md` / `architecture.md` / `front-end-architecture.md` | `docs/architecture.md` (or `docs/ui-architecture.md` for the frontend template) | `fullstack-architecture-tmpl.yaml` / `architecture-tmpl.yaml` / `front-end-architecture-tmpl.yaml` |
| 4a | PRD revision loop (conditional) | `pm` | Architect's suggested changes | Updated `prd.md` | `docs/prd.md` | condition: `architecture_suggests_prd_changes` |
| 5 | Artifact validation | `po` (**Sarah**, Product Owner) | All planning artifacts in `docs/` | Validation report + change requests | — | `execute-checklist.md` + `po-master-checklist.md` (`*execute-checklist-po`) |
| 5a | Flag fixes (conditional) | `various` (analyst / pm / architect / ux-expert) | PO findings | Updated artifacts | — | return-to-author loop |
| 6 | Document sharding (Web→IDE transition) | `po` | Validated `docs/prd.md`, `docs/architecture.md` | Sharded epics + architecture sections | `docs/prd/` (epics + sections), `docs/architecture/` | `shard-doc.md` (`@po *shard-doc docs/prd.md docs/prd`) — uses `md-tree explode` |
| 7 | Story drafting (repeats per story) | `sm` (**Bob**, Scrum Master) | Sharded epic + sharded architecture | `story.md` in Draft status | `docs/stories/{epic_num}.{story_num}.{story_title_short}.md` | `create-next-story.md` (`*draft`), `story-tmpl.yaml` |
| 7a | Story review (optional) | `analyst` or `pm` | Draft story | Story status Draft → Approved | same | story-review task (noted as "coming soon") |
| 7b | Risk + test-design (optional, high-risk stories) | `qa` (**Quinn**, Test Architect) | Draft story | `docs/qa/assessments/{epic}.{story}-risk-{date}.md`, `…-test-design-{date}.md` | `docs/qa/assessments/` | `*risk`, `*test-design` |
| 8 | Implementation (repeats per story) | `dev` (**James**, Full Stack Developer) | Approved story + `devLoadAlwaysFiles` from `core-config.yaml` | Code + updated Dev Agent Record section of story (Tasks checkboxes, File List, Debug Log, Completion Notes, Change Log); status → Review | source tree + story file | `develop-story` command (no separate task file) |
| 8a | Mid-dev QA checks (optional) | `qa` | In-progress story + code | `…-trace-{date}.md`, `…-nfr-{date}.md` | `docs/qa/assessments/` | `*trace`, `*nfr-assess` |
| 9 | QA review (optional but default) | `qa` | Code + story marked Review | Updated story QA Results section + gate file PASS/CONCERNS/FAIL/WAIVED | `docs/qa/gates/{epic}.{story}-{slug}.yml` | `review-story.md` (`*review`), `qa-gate.md` (`*gate`), `qa-gate-tmpl.yaml` |
| 9a | QA fix loop (conditional) | `dev` | QA unchecked items | Updated code + story | same | `apply-qa-fixes.md` (`*review-qa`) |
| 10 | Epic retrospective (optional, per epic) | `po` | Completed epic | `epic-retrospective.md` | `docs/` | noted "coming soon" in YAML |

Phases 7–9 repeat per story inside an epic, and the epic loop (phases 7–10) repeats per epic until the sharded PRD is exhausted. Phases 1–6 are one-shot planning; phases 7–10 are the "Core Development Cycle" from `docs/user-guide.md`.

Key greenfield conditionals (from `greenfield-fullstack.yaml` lines 36–71):

- `condition: user_wants_ai_generation` — phase 3a (v0/Lovable prompt) runs only if the user opts in.
- `condition: architecture_suggests_prd_changes` — phase 4a PM update loop.
- `condition: po_checklist_issues` — phase 5a return loop.
- `condition: user_has_generated_ui` — extra `project_setup_guidance` and `development_order_guidance` steps (8-dev-order guidance) tell the team whether to start frontend-first or backend-first when an external tool generated scaffolding.

### Greenfield — differences between the three workflow variants

| Variant | File | Phase 3 (UX) | Phase 4 arch template | Arch output file |
|---|---|---|---|---|
| `greenfield-fullstack` | `bmad-core/workflows/greenfield-fullstack.yaml` | yes, with optional v0 prompt | `fullstack-architecture-tmpl.yaml` | `docs/architecture.md` (saved as `fullstack-architecture.md` per workflow note) |
| `greenfield-service` | `bmad-core/workflows/greenfield-service.yaml` | skipped | `architecture-tmpl.yaml` | `docs/architecture.md` |
| `greenfield-ui` | `bmad-core/workflows/greenfield-ui.yaml` | yes, with optional v0 prompt | `front-end-architecture-tmpl.yaml` | `docs/ui-architecture.md` (template default) / `front-end-architecture.md` (workflow note) |

Everything from phase 5 (PO validation) onward is identical across the three.

---

## Brownfield workflow — phases

Source: `bmad-core/workflows/brownfield-fullstack.yaml`. Brownfield adds a routing header (classify enhancement size) and a documentation-snapshot step before the PRD. After that it rejoins the same PO→shard→SM→Dev→QA loop as greenfield.

| # | Phase | Agent | Inputs | Outputs | Standard path | Template / task |
|---|---|---|---|---|---|---|
| 0 | Enhancement classification | `analyst` | User description of the change | Routing decision: `single_story` / `small_feature` / `major_enhancement` | — | inline YAML logic |
| 0a | Single-story fast path | `pm` | Routing=single_story | One story, exit workflow | `docs/stories/…` | `brownfield-create-story.md` (`*create-brownfield-story`) |
| 0b | Small-feature fast path | `pm` | Routing=small_feature | 1–3-story epic, exit workflow | `docs/stories/…` | `brownfield-create-epic.md` (`*create-brownfield-epic`) |
| 1 | Documentation check | `analyst` | Existing repo docs | Decision: existing docs adequate or run `document-project` | — | informal review |
| 2 | Project snapshot (conditional: docs inadequate) | `architect` | Source tree, optional flattened codebase (`npx bmad-method flatten`) | `brownfield-architecture.md` (one doc) or multiple per `document-project` template | `docs/architecture.md` / `docs/brownfield-architecture.md` | `document-project.md` (`*document-project`); uses fullstack-architecture template; operates on flattened XML when the project is large |
| 3 | Brownfield PRD | `pm` | Existing docs or phase-2 output | `prd.md` scoped to the enhancement, referencing existing system | `docs/prd.md` | `brownfield-prd-tmpl.yaml` (`*create-brownfield-prd`) |
| 3a | Architecture decision | `pm` / `architect` | `prd.md` | Verdict: need a new architecture doc or reuse existing patterns | — | inline |
| 4 | Brownfield architecture (conditional) | `architect` | `prd.md` + existing system notes | `architecture.md` with integration strategy, migration plan, API evolution | `docs/architecture.md` | `brownfield-architecture-tmpl.yaml` (`*create-brownfield-architecture`) |
| 5 | Artifact validation | `po` | All artifacts | Validation, this time keyed on **integration safety** and **API compatibility** (workflow YAML line 38, 90) | — | `po-master-checklist.md` |
| 5a | Flag fixes | `various` | PO findings | Updated artifacts | — | return-to-author loop |
| 6 | Sharding | `po` | Validated docs | Sharded `docs/prd/` and `docs/architecture/` | same as greenfield | `shard-doc.md` |
| 7 | Story drafting | `sm` | Sharded docs OR brownfield docs (varied formats) | Draft story; for brownfield docs uses a different task that gathers extra context | `docs/stories/…` | **two paths**: `create-next-story.md` (if sharded) or `create-brownfield-story.md` (if brownfield docs) |
| 7a-b | Review / risk / test-design | analyst/pm or qa | same as greenfield | same | same | same |
| 8 | Dev implementation | `dev` | Story | Code + story updates | same | `develop-story` |
| 8a | Mid-dev QA | `qa` | In-progress story | assessments | `docs/qa/assessments/` | same |
| 9 | QA review | `qa` | Story+code | Gate file | `docs/qa/gates/…` | `review-story.md`, `qa-gate.md` |
| 9a | QA fix loop | `dev` | Unchecked items | Updated story | same | `apply-qa-fixes.md` |
| 10 | Epic retrospective | `po` | Completed epic | `epic-retrospective.md` | `docs/` | "coming soon" |

### Brownfield — differences from greenfield (concrete)

1. **Router at the top.** Greenfield assumes you need the full planning chain. Brownfield's first step is `enhancement_classification` (`brownfield-fullstack.yaml` lines 16–41). Only `major_enhancement` continues into the full pipeline; the other two terminate after a single task.
2. **No analyst project brief.** Phases 1–2 of greenfield (brief→PRD) collapse into documentation-check + optional `document-project`. The "brief" is replaced by a snapshot of the existing system.
3. **`document-project` is architect-owned, not analyst-owned.** In brownfield-fullstack it's conditional (only if docs are inadequate); in `brownfield-service.yaml` and `brownfield-ui.yaml` it is the first mandatory step (no routing, no conditional — see `brownfield-service.yaml` lines 17–21 and `brownfield-ui.yaml` lines 16–20). brownfield-fullstack is the only brownfield variant with the classification-router.
4. **Different PRD template.** `brownfield-prd-tmpl.yaml` vs `prd-tmpl.yaml`. Both write to `docs/prd.md` but the brownfield template has sections for existing-system analysis and integration constraints. The PM agent (`pm.md`) exposes both `*create-prd` and `*create-brownfield-prd` commands.
5. **Different architecture template.** `brownfield-architecture-tmpl.yaml` (integration strategy, migration plan) vs `fullstack-architecture-tmpl.yaml`. Also only runs if the PM+architect decide architectural changes are actually needed — in greenfield the architecture phase is unconditional.
6. **No UX phase in brownfield-fullstack.** `brownfield-ui` does have a UX phase (`front-end-spec.md` via `front-end-spec-tmpl.yaml`) but `brownfield-fullstack` goes straight from PRD to architecture-decision.
7. **Dual story path at SM.** Greenfield SM always uses `create-next-story.md`. Brownfield SM picks between `create-next-story.md` (sharded PRD path) and `create-brownfield-story.md` (varied/legacy docs path) based on what the PO produced. See `brownfield-fullstack.yaml` lines 107–118 and the `po_to_sm` handoff prompt at line 288.
8. **PO validation is keyed on "integration safety".** Same checklist file (`po-master-checklist.md`), but the workflow notes read "Validates all documents for integration safety and completeness" and specifically mention "API compatibility" in brownfield-service. The checklist itself is shared; the emphasis is a cultural hand-wave in the notes, not a separate file.

---

## Agent handoff model

The BMAD handoff model is **artifact-first with out-of-band ritual**, not command-based RPC and not conversational IPC. Agents do not message each other directly. The model has three layers:

### Layer 1: Artifacts as the shared substrate

Every agent persona writes its output to a well-known path under `docs/`. Those paths are:

```
docs/brief.md                                 (analyst, project-brief-tmpl)
docs/prd.md                                   (pm, prd-tmpl / brownfield-prd-tmpl)
docs/front-end-spec.md                        (ux-expert, front-end-spec-tmpl)
docs/architecture.md                          (architect, architecture-tmpl / fullstack / brownfield)
docs/ui-architecture.md                       (architect, front-end-architecture-tmpl)
docs/prd/*.md                                 (po, shard-doc on prd.md)
docs/architecture/*.md                        (po, shard-doc on architecture.md)
docs/stories/{epic}.{story}.{slug}.md         (sm, story-tmpl)
docs/qa/assessments/{epic}.{story}-risk-{date}.md         (qa, risk-profile)
docs/qa/assessments/{epic}.{story}-test-design-{date}.md  (qa, test-design)
docs/qa/assessments/{epic}.{story}-trace-{date}.md        (qa, trace-requirements)
docs/qa/assessments/{epic}.{story}-nfr-{date}.md          (qa, nfr-assess)
docs/qa/gates/{epic}.{story}-{slug}.yml       (qa, qa-gate-tmpl)
```

The `output.filename` field at the top of every template YAML is literal — it's what `create-doc.md` writes to. The story template's filename includes a Jinja-style interpolation: `docs/stories/{{epic_num}}.{{story_num}}.{{story_title_short}}.md` (`story-tmpl.yaml` line 8).

The `requires:` field in every workflow YAML phase names the artifact the next agent needs. Example from `greenfield-fullstack.yaml`:

```yaml
- agent: architect
  creates: fullstack-architecture.md
  requires:
    - prd.md
    - front-end-spec.md
```

That's the handoff contract. No agent starts its phase until its `requires:` list exists in `docs/`. No agent touches another agent's sections (see below for the fine-grained story file rules).

### Layer 2: The `*command` invocation from the human

BMAD agents are single-persona processes invoked by a human typing `@<agent> *<command>` into a chat window. Example from the SM phase: `@sm → *create` (= `*draft`, runs `create-next-story.md`). Handoff prompts are baked into the workflow YAML so the orchestrator knows what to tell the user when one phase ends:

```yaml
handoff_prompts:
  analyst_to_pm: "Project brief is complete. Save it as docs/project-brief.md in your project, then create the PRD."
  pm_to_ux: "PRD is ready. Save it as docs/prd.md in your project, then create the UI/UX specification."
  ux_to_architect: "UI/UX spec complete. Save it as docs/front-end-spec.md in your project, then create the fullstack architecture."
  architect_to_pm: "Please update the PRD with the suggested story changes, then re-export the complete prd.md to docs/."
  updated_to_po: "All documents ready in docs/ folder. Please validate all artifacts for consistency."
  po_issues: "PO found issues with [document]. Please return to [agent] to fix and re-save the updated document."
  complete: "All planning artifacts validated and saved in docs/ folder. Move to IDE environment to begin development."
```
(from `greenfield-fullstack.yaml` lines 233–241)

These are human-facing prompts, not agent-to-agent messages — the user reads them, opens a new chat with the next agent, and pastes/provides the artifact.

Each agent persona file exposes a `commands:` block of `*`-prefixed verbs (`bmad-core/agents/*.md`). Representative entries:

- `analyst` — `*create-project-brief`, `*brainstorm`, `*perform-market-research`, `*create-competitor-analysis`
- `pm` — `*create-prd`, `*create-brownfield-prd`, `*create-epic`, `*create-brownfield-epic`, `*create-brownfield-story`, `*shard-prd`
- `ux-expert` — `*create-front-end-spec`, `*generate-ui-prompt`
- `architect` — `*create-full-stack-architecture`, `*create-backend-architecture`, `*create-front-end-architecture`, `*create-brownfield-architecture`, `*document-project`, `*execute-checklist`
- `po` — `*execute-checklist-po`, `*shard-doc {document} {destination}`, `*validate-story-draft {story}`, `*create-epic`, `*create-story`, `*correct-course`
- `sm` — `*draft` (= `create-next-story`), `*story-checklist`, `*correct-course`
- `dev` — `*develop-story`, `*review-qa`, `*run-tests`, `*explain`
- `qa` — `*review {story}`, `*gate {story}`, `*risk-profile {story}`, `*test-design {story}`, `*trace {story}`, `*nfr-assess {story}`

Each command maps to a task file under `bmad-core/tasks/` and/or a template under `bmad-core/templates/`. Dependencies are declared explicitly in the agent file's `dependencies:` block so lazy-loading works (`bmad-core/agents/sm.md` lines 56–65 is a tight example).

### Layer 3: Fine-grained ownership inside shared files

The story file is the one place where two agents write to the same markdown file, and BMAD solves that by hard-coding **section-level ownership** in the dev persona:

From `bmad-core/agents/dev.md` lines 60–68 (the `develop-story` command):

```
CRITICAL: You are ONLY authorized to edit these specific sections of story files —
Tasks / Subtasks Checkboxes, Dev Agent Record section and all its subsections,
Agent Model Used, Debug Log References, Completion Notes List, File List,
Change Log, Status
CRITICAL: DO NOT modify Status, Story, Acceptance Criteria, Dev Notes, Testing sections,
or any other sections not listed above
```

(Note the contradiction in the source: Status is listed in both the allow-list and the deny-list. In practice Dev updates Status to `Ready for Review` at completion, so the allow-list wins. This is a real bug in the published persona file.)

The story template mirrors this with `agent_config.editable_sections` (`story-tmpl.yaml` lines 15–23) that names the SM-editable sections: Status, Story, Acceptance Criteria, Tasks / Subtasks, Dev Notes, Testing, Change Log. QA writes to a dedicated "QA Results" section via `review-story.md` and to a separate gate file (`docs/qa/gates/…yml`) so it never collides with Dev's writes.

So the ownership rules are:

| Section of story file | Who writes it | When |
|---|---|---|
| Story, Acceptance Criteria, Dev Notes, Testing, Tasks/Subtasks list | SM | at draft |
| Status | SM initially (`Draft`); PO or analyst (`Approved`); Dev (`Ready for Review`); QA (`Done` or leaves at `Review`) | phase transitions |
| Tasks/Subtasks **checkboxes** | Dev | during `*develop-story` |
| Dev Agent Record, Agent Model Used, Debug Log References, Completion Notes, File List, Change Log | Dev | during `*develop-story` |
| QA Results | QA | during `*review` |
| `docs/qa/gates/{epic}.{story}-{slug}.yml` | QA | during `*review` / `*gate` |

### The "new chat per agent" convention

User-guide lines 94–134 and the story-phase notes in `greenfield-fullstack.yaml` (lines 92–140) are explicit: every agent hop is a fresh chat. `SM Agent (New Chat): @sm → *create`, `Dev Agent (New Chat): @dev`, `QA Agent (New Chat): @qa → review-story`. The purpose is context hygiene — each agent lazy-loads only the dependencies its task needs, using the story file as the single source of truth for cross-agent state. The story file thus doubles as an asynchronous message bus.

### Summary of the handoff model

- **Artifact-based**, not message-based. Nothing is passed in-memory between agents. `docs/` is the bus.
- **Human-mediated.** A human orchestrator (or the `bmad-orchestrator` agent in web UI mode) reads handoff prompts from the workflow YAML and invokes the next agent with a `*command`.
- **Section-level ownership** inside shared files (story.md). Violations are prevented by hard-coded rules in the persona, not by technical enforcement.
- **No direct agent-to-agent messaging.** No FIFO, no tmux, no RPC. Agents are stateless re-invocations of the same LLM with a different persona prompt.

---

## Key differences from our current autoloop setup

Our Hermes autoloop (the one I live inside) uses a fundamentally different substrate — FIFO JSON envelopes, a tick-flag queue, and WAL entries. Things worth adopting from BMAD:

- **Artifact-keyed handoffs over message-keyed handoffs.** Our BMAD brief/review/question handoffs already live in `docs/bmad/{briefs,reviews,questions}/{story-id}.md` (per `feedback_bmad_protocol.md`). We should formalize the rest: adopt a fixed `docs/prd/`, `docs/architecture/`, `docs/stories/` layout so any agent — Designer, Developer, or a future SM-equivalent — picks up work by globbing a known path instead of parsing a task-board.
- **Fine-grained section ownership in shared files.** Our story files today are free-form. BMAD's `editable_sections` + Dev's "ONLY update these sections" rule prevents the class of merge-conflict bug where two agents clobber each other's edits. We could bolt this onto our story template with a header comment listing section owners and a lint check.
- **A "shard-doc" step.** BMAD's sharding converts a monolithic PRD into per-epic files so the dev agent loads only what it needs. Our loop currently hands Dev the whole brief, which burns context. `npx md-tree explode` (what `shard-doc.md` wraps) is 10 lines of shell; worth stealing.
- **Explicit `requires:` contracts per phase.** The workflow YAML's `requires: [prd.md, front-end-spec.md]` is a dependency assertion that makes it trivial to check "can this phase run yet?" Our autoloop classifies tasks as routine/complex but doesn't declare input artifacts. Adding a `requires:` field to queue items would let the idle-loop auto-skip blocked tasks.
- **A PO-style artifact validator.** BMAD's `po-master-checklist` runs once per planning cycle to assert cross-document consistency (does every epic in the PRD have matching architecture coverage? are all NFRs accounted for?). We have nothing equivalent — Hermes would benefit from a cron'd checklist that scans `docs/` for orphaned briefs and stories with no matching QA gate.

What **not** to adopt: BMAD's "new chat per agent" assumption. Our loop wants persistent subagents so WAL + memory survive; BMAD wants throwaway chats so context stays clean. The two design pressures trade off and BMAD picked the opposite corner from us. Their story-file-as-message-bus pattern is still worth copying because it works in both models.

---

## Sources

Claims in this document back to specific files and line ranges:

| Claim | Source |
|---|---|
| Greenfield phase sequence (analyst → pm → ux → architect → po → sm → dev → qa) | `bmad-core/workflows/greenfield-fullstack.yaml` lines 16–162 |
| Greenfield handoff prompts | same file, lines 233–241 |
| Greenfield conditionals (v0 prompt, arch→PRD loop, PO issues loop) | same file, lines 36–71 |
| Service variant skips UX phase | `bmad-core/workflows/greenfield-service.yaml` lines 17–36 |
| UI variant uses front-end-architecture template | `bmad-core/workflows/greenfield-ui.yaml` lines 43–49 |
| Brownfield enhancement classification router | `bmad-core/workflows/brownfield-fullstack.yaml` lines 16–41 |
| Brownfield conditional `document-project` | same file, lines 42–58 |
| Brownfield uses `brownfield-prd-tmpl` and `brownfield-architecture-tmpl` | same file, lines 60–85 |
| Brownfield SM dual story path (`create-next-story` vs `create-brownfield-story`) | same file, lines 107–118, 288–293 |
| Brownfield-service mandatory `document-project` (no routing) | `bmad-core/workflows/brownfield-service.yaml` lines 17–21 |
| Brownfield-ui mandatory `document-project` | `bmad-core/workflows/brownfield-ui.yaml` lines 16–20 |
| Agent names (Mary/John/Winston/Sarah/Bob/James/Quinn/Sally) | `bmad-core/agents/{analyst,pm,architect,po,sm,dev,qa,ux-expert}.md`, `agent.name` field in each |
| Agent `commands:` listings | same files, `commands:` block |
| Dev section-ownership rules (allow/deny lists) | `bmad-core/agents/dev.md` lines 60–68 |
| Story-template editable sections and filename | `bmad-core/templates/story-tmpl.yaml` lines 8, 15–23 |
| Template `output.filename` paths (prd.md, architecture.md, etc.) | `bmad-core/templates/{prd,brownfield-prd,fullstack-architecture,brownfield-architecture,architecture,project-brief,front-end-spec,front-end-architecture}-tmpl.yaml` `output:` blocks |
| Shard-doc uses `md-tree explode` | `bmad-core/tasks/shard-doc.md` |
| Planning→IDE transition and standard `docs/` paths | `docs/user-guide.md` lines 5–98 |
| QA command → assessment/gate paths | `docs/user-guide.md` lines 448–538 |
| Brownfield two-approach model (PRD-first vs Document-first) | `docs/working-in-the-brownfield.md` lines 30–120 |
| Flattened codebase optional tool | `docs/working-in-the-brownfield.md` line 11, `docs/flattener.md` |
| Canonical repo URL | https://github.com/bmadcode/BMAD-METHOD |
| Tag analyzed | `v4.44.3` (last v4 stable; v6.x reorganizes paths but preserves the phase model) |

All `bmad-core/` paths above are relative to the BMAD-METHOD repo root at tag `v4.44.3`. The directory was renamed to `src/bmm-skills/` in v5+; the content lives on under new names (`src/bmm-skills/1-analysis/bmad-product-brief`, `src/bmm-skills/2-plan-workflows/bmad-create-prd`, etc. — see `src/bmm-skills/module.yaml` for the module.help mapping in the current `main`).
