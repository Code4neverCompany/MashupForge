# QA Skills Summary

**Written by:** QA agent  
**Date:** 2026-04-14  
**Source:** `~/.claude/skills/bmad/bmad-qa-generate-e2e-tests/`, `bmad-review-adversarial-general/`, `bmad-review-edge-case-hunter/`

---

## 1. `bmad-qa-generate-e2e-tests`

**Trigger:** User says "create QA automated tests for [feature]"  
**Files:** `SKILL.md` → `workflow.md`, `checklist.md`

### What it does

Generates automated API and E2E tests for already-implemented code. It is a test-generation tool only — it does not review, audit scope drift, or validate stories (use `bmad-code-review` for that).

### Execution steps

| Step | Action |
|---|---|
| 0 | Detect test framework: checks `package.json` deps (Playwright, Jest, Vitest, Cypress). If none exists, analyses project type and recommends one. |
| 1 | Identify features: asks user for a specific feature/component, a directory to scan, or auto-discovers. |
| 2 | Generate API tests (if applicable): status codes (200/400/404/500), response structure, happy path + 1–2 error cases. |
| 3 | Generate E2E tests (if UI exists): full user workflows, semantic locators (roles/labels/text), linear & simple, assert visible outcomes. |
| 4 | Run tests and fix failures immediately. |
| 5 | Write summary to `{impl_artifacts}/tests/test-summary.md`. |

### Output

- Test files in `tests/api/` and `tests/e2e/`
- Summary at `{impl_artifacts}/tests/test-summary.md`
- Validate against `./checklist.md` before closing

### Integration with QA reviews

Use **after** a story passes `bmad-code-review`. The generated tests become the "Test Coverage" evidence that QA cites in a review artifact. If a story has no E2E tests, this skill closes that gap before QA signs off.

---

## 2. `bmad-review-adversarial-general`

**Trigger:** User requests a critical review of any artifact  
**Files:** `SKILL.md` only

### What it does

Performs a cynical, skeptical review of any content (diff, spec, story, doc). Assumes problems exist. Finds at least **10 issues** — missing things matter as much as wrong things. Outputs a Markdown findings list.

### Execution steps

| Step | Action |
|---|---|
| 1 | Load content; identify type (diff, branch, uncommitted, document). Halt if empty. |
| 2 | Adversarial analysis: extreme skepticism, minimum 10 findings — what's wrong AND what's missing. |
| 3 | Present findings as a Markdown list (descriptions only). |

### Halt conditions

- Zero findings → suspicious, re-analyze before stopping
- Empty or unreadable content

### Output format

Plain Markdown list of findings. No JSON. No structure requirement beyond that.

### Integration with QA reviews

Use this **before** writing a QA review artifact when a story or diff looks suspiciously clean. Feed the adversarial findings into the "Security", "Scope Drift", or "Obsolete Items" sections of the standard QA review format. If adversarial analysis surfaces ≥1 blocker → review Status = `fail` or `warn`.

---

## 3. `bmad-review-edge-case-hunter`

**Trigger:** Need exhaustive edge-case analysis of code, spec, or diff  
**Files:** `SKILL.md` only

### What it does

Pure path-tracing — mechanically walks every branch and boundary condition in the provided content. Reports **only unhandled paths**. Orthogonal to adversarial: method-driven, not attitude-driven. No editorialising.

Scope rules:
- **Diff provided** → scan only changed hunks; report only boundaries directly reachable from those lines without an explicit guard in the diff
- **Full file/function provided** → entire content is scope; ignore external functions unless explicitly referenced

### Execution steps

| Step | Action |
|---|---|
| 1 | Load content (halt with sentinel JSON if empty/undecodable). Identify type (diff / full file / function). |
| 2 | Exhaustive path analysis: walk all control flow (conditionals, loops, error handlers, early returns) and domain boundaries (value/state transitions). Derive edge classes from content. Discard handled paths silently. |
| 3 | Validate completeness: revisit all edge classes (null/empty inputs, off-by-one, arithmetic overflow, implicit coercion, race conditions, timeout gaps). Add any newly found unhandled paths. |
| 4 | Present findings as a JSON array. |

### Output format

```json
[{
  "location": "file:start-end",
  "trigger_condition": "one-line description (max 15 words)",
  "guard_snippet": "minimal code sketch (single-line escaped string)",
  "potential_consequence": "what could actually go wrong (max 15 words)"
}]
```

Empty array `[]` is valid when no unhandled paths exist.

### Integration with QA reviews

Use on the **diff** of a story implementation before writing the QA gate. The JSON output maps directly to the "Test Coverage" and "Security" sections — each unhandled path is either a test gap or a bug risk. If any finding has a `potential_consequence` involving auth, data corruption, or crash → escalate to `warn` or `fail` in the review.

---

## Skill selection guide

| Situation | Skill |
|---|---|
| Story is implemented, no automated tests exist | `bmad-qa-generate-e2e-tests` |
| Diff looks suspiciously clean; want a second opinion | `bmad-review-adversarial-general` |
| Need to know what edge cases the diff doesn't handle | `bmad-review-edge-case-hunter` |
| Routine QA review of a developer artifact | Neither — use standard review format from `QA.md` |
| Both adversarial + edge-case needed | Run both; feed combined findings into QA review |

---

## How these fit into the BMAD QA phase (Phase 9)

```
Dev → Status: Ready for Review
         ↓
QA reads story + diff
         ↓
  [optional] bmad-review-adversarial-general  ← catches missing/wrong things
  [optional] bmad-review-edge-case-hunter     ← catches unhandled paths in diff
         ↓
QA writes docs/bmad/qa/{review-id}.md
  (Status, Scope Drift, Obsolete Items, Test Coverage, Security, Recommendation)
         ↓
  [optional] bmad-qa-generate-e2e-tests       ← if no tests exist
         ↓
Gate: pass → push JSON {"from":"qa","type":"done","task":"..."}
Gate: fail → push JSON {"from":"qa","type":"blocked","task":"..."}
```
