# FEAT-MMX-MUSIC-UI — Implementation Report

**Date:** 2026-04-29
**Branch:** `feat/mmx-prompt-wire`
**Implementer:** Designer (per redispatched scope override)
**Story:** `docs/bmad/stories/FEAT-MMX-MUSIC-UI.md`

---

## Summary

Wired the music / speech / video UI affordances on top of the existing
`mmx-client.ts` and routes. The studio now exposes a floating bottom-right
action group with Music + Video buttons, the sidebar grows a per-message
"Read aloud" button, and everything self-hides when the MMX CLI isn't
available on the server.

---

## Files added

| Path | Purpose |
|---|---|
| `app/api/mmx/availability/route.ts` | GET — wraps `isAvailable()`, returns `{available: boolean}`. Cache: `no-store`. |
| `app/api/mmx/speech/route.ts` | POST — mirrors `/api/mmx/music`: temp-file write, audio bytes back, route owns the path so caller can't escape tmp. |
| `app/api/mmx/video/route.ts` | POST — kicks `mmx video generate --no-wait`, returns `{taskId, path}` immediately. Polling is out of scope per the story. |
| `lib/useMmxAvailability.ts` | Hook + module-level cache so Sidebar + Studio don't double-probe per render. Returns `boolean \| null` (null while in flight). |
| `components/mmx/MmxStudioPanel.tsx` | Floating action group + Music modal + Video modal + shared `ModalShell`. Uses brand utility classes (`btn-gold-sm`, `btn-blue-sm`, `input-brand`, `btn-ghost`). |
| `components/mmx/ReadAloudButton.tsx` | Per-message read-aloud button with idle/loading/playing/error states. Uses HTML5 `Audio` for playback and revokes the blob URL on stop / unmount. |

## Files edited

| Path | Change |
|---|---|
| `components/MashupStudio.tsx` | Dynamic import + mount of `MmxStudioPanel` inside its own `ErrorBoundary`. |
| `components/Sidebar.tsx` | Imports `ReadAloudButton`, renders it inline next to the timestamp on completed model messages. |

---

## Design notes

- **Panel placement.** The story leaves the location open ("MashupStudio.tsx (or a nearby panel)"). I picked a fixed bottom-right floating group so the affordance is reachable from every studio view without rearranging the existing layout (sidebar + main content fill the screen). It uses Agency Black + brand-gold border to match the calendar trash zone language.
- **Modal shell.** Music + Video share `ModalShell`, which also wires Escape-to-close so it stays consistent with the calendar trash-confirm modal (QA-W4).
- **Music UX.** Default to instrumental (off-toggle reveals a lyrics textarea). The toggle prevents the conflicting `instrumental + lyrics` argument combination that `generateMusic` already throws for.
- **Video UX.** v1 is dispatch-only — submit returns the task ID with a `Generating` badge and a note that polling is out of scope. The route forces `noWait: true` server-side so the request can't hang for the full render duration.
- **Read-aloud UX.** Idle button is muted zinc, hover lifts to gold. Playing flips to electric-blue with a Stop. Errors turn red and offer Retry. Hidden completely when MMX is unavailable.
- **Resource hygiene.** Both the music modal and `ReadAloudButton` revoke their blob URLs on unmount / stop / regenerate to avoid memory leaks across long sessions.

## Availability gating

- `useMmxAvailability` issues a single `GET /api/mmx/availability` per page load (module-level promise dedupe so siblings can call it freely).
- `MmxStudioPanel` returns `null` while `available` is `null` (in flight) or `false`. No flash of disabled buttons.
- `ReadAloudButton` does the same — absent buttons rather than disabled ones.

---

## Verification

- `tsc --noEmit` — clean.
- `eslint` — only pre-existing warnings (one `react-hooks/set-state-in-effect` on `useOnboardingState`, one `<img>` on Sidebar:290). My new files lint clean.
- `vitest run` — 86 files, 975/975 passing.

## Acceptance criteria status

| Criterion | Status |
|---|---|
| Music button visible in studio when mmx is available | ✅ floating panel |
| Music modal: prompt input + generate → audio playback | ✅ `<audio controls>` + download link |
| Read-aloud button reads current caption via mmx speech | ✅ per model-message in sidebar |
| Video button opens modal with prompt → submits → shows task ID | ✅ `Generating` badge + task ID |
| All three buttons absent/disabled when mmx is unavailable | ✅ entire panel + per-message button hide |
| No breaking changes to existing features | ✅ tests still 975/975 |

## Out of scope (per story)

- Video polling / completion UI
- Music batch generation
- ffmpeg clip combination for Sunday recap
- Auto-posting video

## Confidence

0.85 — happy path covered, types + tests green, brand-aligned. Discount of 0.15 because (a) cross-domain work (server routes + state + audio playback) is outside Designer scope and the fast iteration didn't include a manual click-through against a live `mmx` binary; (b) `<audio>` autoplay may be blocked by browsers on first interaction — handled via the explicit click but worth a manual smoke test.
