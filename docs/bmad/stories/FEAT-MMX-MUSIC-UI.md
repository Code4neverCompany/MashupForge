# FEAT-MMX-MUSIC-UI — Music + Speech + Video generate buttons in studio UI

**Date:** 2026-04-29
**Project:** MashupForge
**Status:** open
**Priority:** medium — MMX CLI fully implemented, UI wiring is all that remains

---

## Background

`mmx-client.ts` implements all 6 MiniMax capabilities. `/api/mmx/music` and `/api/mmx/describe` routes exist. The studio UI has zero MMX buttons beyond image generation.

Maurice wants music generation, speech synthesis, and video generation accessible from the studio.

---

## Scope

### 1. Music generate button (studio)

- Add a "Generate Music" button to `MashupStudio.tsx` (or a nearby panel).
- Clicking opens a modal/sheet with:
  - Prompt input (what kind of music: mood, genre, instruments)
  - Lyrics input (optional — toggle between instrumental/lyrical)
  - "Generate" → POST `/api/mmx/music`
- After generation: show a play button / audio player for the result.
- Save result to post metadata so it can be attached to a post.

### 2. Read aloud / speech synthesis (sidebar or studio)

- Add a "Read caption aloud" button to `Sidebar.tsx` or studio.
- Reads the current caption text via `mmx speech synthesize`.
- Plays back the result in-browser.
- One-shot — no save required.

### 3. Video generate button (studio, lower priority)

- Add a "Generate Video" button to studio.
- Opens a modal with a prompt input.
- POST `/api/mmx/video` — returns task ID immediately (no-wait).
- Show task ID with a "video generating..." status badge.
- Polling not required for v1 — just show task started.

### 4. Availability gating

- On studio load, call `GET /api/mmx/availability` (new route, calls `isAvailable()` from mmx-client).
- If mmx is unavailable, hide or disable the music/speech/video buttons.
- Graceful — buttons absent is fine, error on click is not.

---

## Out of scope

- Video polling / completion UI (task ID display only for v1)
- Music batch generation
- ffmpeg clip combination for Sunday recap
- Auto-posting video to social

---

## Acceptance criteria

- [ ] Music button visible in studio when mmx is available
- [ ] Music modal: prompt input + generate → audio playback
- [ ] Read aloud button reads current caption via mmx speech
- [ ] Video button opens modal with prompt → submits → shows task ID
- [ ] All three buttons absent/disabled when mmx is unavailable
- [ ] No breaking changes to existing features
