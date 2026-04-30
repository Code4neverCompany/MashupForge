# MMX AI Agent Card — UX Visual Pass Brief

**Feature:** MMX AI Agent Settings Card
**Type:** Visual + UX polish pass
**Brief ID:** MMX-AGENT-CARD-UX-VISUAL-PASS
**Created:** 2026-04-30
**Status:** Open
**Story:** DESIGN-MMX-001
**Outlet:** `design/MMX-AGENT-CARD-UX-VISUAL-PASS.md`

---

## Context

Recent commits (1564c1a, 75e0c85, 96d271e, b2a2311) shipped functional MMX AI Agent card UX:

1. Hoisted MMX install/auth CTA visible regardless of which agent is active
2. API-key paste-and-save form with primary gold button + secondary OAuth tmux text-link fallback
3. State-aware captions and dot indicators (Not Installed / Not Authenticated / Loading / Available)
4. Status auto-refresh after save success

The logic is working. The styling is using existing tokens. But layout hierarchy, microcopy, CTA ordering, and feedback patterns were made on the fly. This brief is a visual pass to audit and reconcile those decisions.

---

## Deliverable

A visual + UX audit and refresh of the MMX card and its surrounding context in `SettingsModal.tsx`. Focus on:

- **Primary vs secondary CTA hierarchy** — which action is the user most likely to take? Is the gold button always the right primary?
- **Success/error feedback** — currently: silent flip to new state on success, inline red text on error. Are there better patterns? Toast? Inline confirmation? No-change feedback?
- **Hoisted CTA vs active-agent panel duplication** — the hoisted CTA (top of AI Agent section) and the active-agent MMX panel (below, when mmx is active) may both render MMX content simultaneously. Resolve any duplication.
- **API-key paste pattern reuse** — the paste-and-save form is a clean pattern. Could it apply to other secret fields in Settings? Document it as a reusable pattern.
- **Microcopy audit** — "Checking MMX status…", "Not Installed", "Launch MMX Setup", etc. Are these consistent with the rest of the app's tone?
- **State transitions** — what does the user actually see as they go from "Not Installed" → "Installing" → "Not Authenticated" → "Authenticated"? Does the UI guide them through that flow or just flip?

---

## Files In Scope

| File | Area | Relevant Lines |
|------|------|----------------|
| `components/SettingsModal.tsx` | Hoisted CTA | ~671–700 |
| `components/SettingsModal.tsx` | Active-agent MMX panel | ~700+ |
| `components/SettingsModal.tsx` | `handleMmxApiKeySave` | ~225 |

---

## Design Tokens Available

- `btn-gold-sm` — primary button style
- `#c5a062` — gold accent (card border, selected state)
- `zinc-900` — card background
- `text-[11px]` — caption scale
- `text-[10px]` — label scale

---

## Out of Scope

- Flow or architecture changes — the flow is settled
- Endpoint contracts or API changes
- Auto-install or PATH resolution logic
- Backend changes of any kind

---

## Acceptance Criteria

- [ ] Hoisted CTA and active-agent panel do not show duplicate MMX UI when mmx is the active agent
- [ ] Success/error feedback is visible and consistent with the app's feedback patterns
- [ ] API-key paste form is documented as a reusable pattern if it deserves reuse
- [ ] All state labels (Not Installed, Checking, Available, etc.) are consistent in tone and clarity
- [ ] Designer sign-off on the visual pass before close

---

## Meta

**Suggested by:** Hermes (orchestrator, at Maurice's request)
**Owned by:** Designer (designer-claude)
**QA review:** QA (qa-claude) — visual + functional after Designer ships
