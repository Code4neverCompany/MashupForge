# BMAD Brownfield Workflow Analysis

**Researched by:** Designer agent  
**Date:** 2026-04-14  
**Sources:** BMAD-METHOD official docs, DeepWiki, Medium guide, opencode-async-agents reference

---

## 1. Greenfield vs Brownfield — Core Difference

| Dimension | Greenfield | Brownfield |
|---|---|---|
| Starting point | Blank slate — requirements first | Existing codebase — understand first |
| First action | `brainstorming` or `create-prd` | `document-project` or `generate-project-context` |
| Planning artifacts | Created from requirements | Derived from codebase analysis |
| Architecture | Designed upfront | Discovered, documented, then extended |
| Test strategy | Forward-only | Regression safety required (QA/Test Architect mandatory) |
| Templates | Standard prd-tmpl, architecture-tmpl | Specialised brownfield-prd-tmpl, brownfield-architecture-tmpl |

**The fundamental rule:** AI agents need comprehensive documentation of the *existing* system before they can safely plan or implement changes. This is the brownfield prerequisite that greenfield skips entirely.

---

## 2. When to Use Brownfield Workflow

**Use brownfield when:**
- Adding significant features to a live application (MashupForge ← this is us)
- Modernising legacy code patterns
- Integrating new services/APIs
- Complex refactors that span multiple files
- Architecture-dependent bug fixes

**Do NOT use brownfield if:**
- You completed an MVP with BMAD and are continuing — create a new epic within the existing PRD instead
- The change is a simple isolated bug fix — use `*create-brownfield-story` directly

---

## 3. The Two Brownfield Approaches

### Approach A — PRD-First (large / well-defined codebases)
1. Define requirements first (`@pm → *create-brownfield-prd`)
2. Document only the *relevant* code areas the PRD identified (not the whole codebase)
3. Architecture (`@architect → *create-brownfield-architecture`)
4. Validate → Shard → Develop

**Best for:** Large codebases, monorepos, well-scoped feature requests.

### Approach B — Document-First (smaller / unfamiliar codebases)
1. Document the entire system first (`@architect → *document-project`)
2. Then plan: PRD, architecture, epics/stories
3. Validate → Shard → Develop

**Best for:** Smaller projects, unfamiliar codebases, exploratory work.

---

## 4. Full Brownfield Workflow (Major Enhancement)

```
1. npx bmad-method flatten          → single-file codebase snapshot
2. @architect → *document-project   → docs/project-architecture.md
3. @pm → *create-brownfield-prd     → docs/brownfield-prd.md
4. @architect → *create-brownfield-architecture → docs/brownfield-architecture.md
5. @po → *execute-checklist-po      → compatibility + risk validation
6. @po → shard docs/brownfield-prd.md + brownfield-architecture.md
7. Enhanced IDE Development Workflow (agent per story)
```

---

## 5. Lightweight Brownfield Paths (Small Changes)

For scoped work that doesn't warrant a full architecture pass:

| Scope | Command | When to use |
|---|---|---|
| Single story / bug fix | `@pm → *create-brownfield-story` | Isolated change, clear implementation path |
| Focused feature (1 epic) | `@pm → *create-brownfield-epic` | Well-defined, isolated, existing docs sufficient |
| Full new feature | Full workflow above | Multi-file, architectural, integration risks |

---

## 6. Agents & Their Brownfield Roles

| Agent | Brownfield Role |
|---|---|
| **Analyst / Architect** | Runs `*document-project`; analyses existing patterns |
| **PM** | Creates brownfield PRD, epics, stories |
| **Architect** | Designs integration strategy respecting existing patterns |
| **PO** | Validates compatibility, prevents breaking changes |
| **QA / Test Architect** | **Mandatory in brownfield** — regression safety net |
| **Dev agents** | Execute stories within guardrails set by above |

---

## 7. Artifacts Produced

```
docs/
  project-architecture.md       ← full codebase documentation
  brownfield-prd.md             ← requirements with integration focus
  brownfield-architecture.md    ← integration strategy + risk plan
  brownfield-epic.md            ← (lightweight path)
  brownfield-story.md           ← (single change path)
```

State tracking: `sprint-status.yaml` (frontmatter) — agents can resume interrupted flows.

---

## 8. Best Practices

1. **Document first, even for familiar codebases** — captures undocumented patterns
2. **Respect existing conventions** — templates prompt agents to identify patterns before suggesting changes
3. **Plan gradual rollout** — feature flags, rollback plans, backwards compatibility
4. **Regression test integration points** — QA is not optional in brownfield
5. **Communicate changes** — document what changed, why, and any migration instructions

---

## 9. Relevance to MashupForge (Our Project)

MashupForge is unambiguously **brownfield** — it is an existing Next.js 15 + React 19 + TypeScript application with established patterns, a working pipeline, and live features.

### Decision tree for us

```
Large new feature (new tab, new pipeline stage)?
  → PRD-First: brownfield-prd → brownfield-architecture → stories

Focused addition to existing tab (e.g. new button row, new modal)?
  → *create-brownfield-story directly (what we already do with autoloop)

Bug fix / responsive patch / brand sweep?
  → No BMAD overhead — ad-hoc is correct (our routine queue)
```

### What we already do right
- Design artifacts: `docs/bmad/reviews/{id}.md` (our new protocol) maps well to BMAD's artifact-based handoff
- Story-level execution: the autoloop handles routine stories without full workflow overhead
- Regression awareness: AUTO-D002 was effectively a manual QA pass

### What we're missing vs. full BMAD brownfield
- No `project-architecture.md` — no single-file documentation of MashupForge's current state. If a new agent joins, there's no BMAD-style onboarding doc.
- No formal brownfield-prd for larger features — decisions are made in-session and not persisted.
- No QA / Test Architect role — regression testing is informal.

### Recommended adoption (incremental)

| Priority | Action |
|---|---|
| High | Create `docs/bmad/project-architecture.md` — one-time `*document-project` run to give all agents a shared ground truth |
| Medium | For any new-tab or new-pipeline-stage work: require a `docs/bmad/briefs/{feature}.md` (brief) before implementation |
| Low | Formal QA agent / test-architect for regression — adopt when test suite is established |

---

*Sources:*
- [Greenfield vs Brownfield in BMAD — Medium](https://medium.com/@visrow/greenfield-vs-brownfield-in-bmad-method-step-by-step-guide-89521351d81b)
- [Brownfield Development — DeepWiki (bmad-code-org)](https://deepwiki.com/bmad-code-org/BMAD-METHOD/4.9-brownfield-development)
- [working-in-the-brownfield.md — opencode-async-agents](https://github.com/solaraai-official/opencode-async-agents/blob/master/.bmad-core/working-in-the-brownfield.md)
- [BMad Method Implementation Guide 2025 — buildmode.dev](https://buildmode.dev/blog/mastering-bmad-method-2025/)
- [BMAD-METHOD Issue #563 — Brownfield Document-First](https://github.com/bmad-code-org/BMAD-METHOD/issues/563)
