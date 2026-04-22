# FEAT-002 — Settings: integrate auto-update + reorganize layout (DESIGN PROPOSAL)

**Status:** Done — implemented in prior refactor batch (see FEAT-002-AUDIT.md)
**Why proposal-not-PR:** This task is classified `complex` and three of its four ACs are either already-met-but-not-obvious or underspecified in ways that make speculative execution risky. Wrong choices here would either break web mode or impose a section structure you'd reject. Let's pick before I touch the panel.
**Drafted:** 2026-04-18 (developer subagent)

---

## Current state — what's already there

I read `components/SettingsModal.tsx` (960 LOC), `components/DesktopSettingsPanel.tsx` (417 LOC), `components/UpdateChecker.tsx` (272 LOC), and `app/layout.tsx`. Here's what already exists:

### Auto-update
- `UpdateChecker` is mounted in `app/layout.tsx:56`. It runs **once per app launch** in desktop mode, calls `@tauri-apps/plugin-updater`'s `check()`, and renders a toast (Available / Downloading / Done / Error states) anchored top-right.
- It supports per-version dismissal (`mashup_update_dismissed_<version>` in localStorage) and post-restart "Updated to vX.Y.Z" toast detection.
- **What's missing:** there's no Settings UI for it. The user can't say "stop checking", "check now", or "remind me weekly". And the Settings panel doesn't even surface "current version" or "last check" info.

### Save behavior
- **Desktop config** (`DesktopSettingsPanel`, STORY-131): debounced auto-save on edit (800ms), with Saving / Saved / Error feedback row at the bottom.
- **App settings** (`SettingsModal` body): every `updateSettings(...)` call writes through to IndexedDB via the context. The header has a "Saved" pill that fades in on every save (line 162-169).
- **Both already auto-save with feedback.** The AC "clear save behavior" is arguably met.

### "Duplicate fields"
This is the dangerous one. The Settings panel has THREE places that look like duplicates of desktop config:

| Field | Web input (SettingsModal) | Desktop input (DesktopSettingsPanel) | Behavior today |
|---|---|---|---|
| Leonardo API key | line 190-213 | LEONARDO_API_KEY | guarded `isDesktop === false` — only one shows |
| Instagram creds | line 225-258 | IG_ACCESS_TOKEN + IG_ACCOUNT_ID | guarded `isDesktop === false` — only one shows |
| Pinterest creds | line 261-296 | PINTEREST_ACCESS_TOKEN + PINTEREST_BOARD_ID | guarded `isDesktop === false` — only one shows |

Each of these is **intentionally** exclusive after past incidents (STORY-130 / INSTAGRAM-CRED-FIX). Both inputs persist to *different* stores (web → IndexedDB, desktop → config.json + sidecar env), and rendering both would silently shadow each other. The `isDesktop === false` guards exist precisely because we already learned the hard way.

**If you read "no duplicates" in the AC as "remove the web variants", you'd break web mode entirely.** I'm 95% confident you don't mean that.

### Section structure today

Top-to-bottom in the body:
1. API Keys
   - Leonardo (web only)
   - Free Social Posting Setup (Instagram, Pinterest — web only)
2. Image Generation Settings
3. Pi.dev AI Engine (just intro text + pointer to Desktop Configuration)
4. Watermark
5. Collections (manage)
6. Social Media Settings (channel name, watermark position) ← already feels misplaced, this is where dupes-in-spirit live
7. Default Video Settings
8. AI System Prompt
9. **DesktopSettingsPanel** (rendered inside the modal as the last section)

There's no Pipeline section in the modal. Pipeline settings (auto-tag, auto-caption, daily caps, themed batches, carousel mode) live in MainContent's Pipeline tab, not here.

---

## Proposal — concrete plan, three decision points for Hermes

### Decision 1 — Auto-update Settings UI

**Recommend Option A.** Choose one:

- **A. Visibility + manual control.** Add a "Updates" section to `DesktopSettingsPanel` showing: current version (from `getVersion()`), "Check for updates now" button, last check timestamp (new localStorage key), and a single boolean toggle "Check on launch" (default ON). Off = `UpdateChecker.tsx` short-circuits before calling `check()`. Persisted in `config.json` as `AUTO_UPDATE_ON_LAUNCH=1|0`.
  - Pros: minimal scope, respects user agency, the toggle has an obvious meaning.
  - Cons: doesn't do "deferred reminders" or channel selection.
- **B. Channel + cadence.** A + dropdown for `stable / beta` channel (no-op until you wire it in `tauri.conf.json`) and a cadence picker (`launch / daily / weekly / manual`).
  - Pros: more knobs for power users.
  - Cons: 2x the surface, the "channel" dropdown lies until backend supports it.
- **C. Toggle only, hidden details.** Just the boolean toggle and "Check now" button, no version / timestamp readout.
  - Pros: smallest possible UI.
  - Cons: power users still don't know what version they're on without opening About/Help.

### Decision 2 — Reorganization shape

**Recommend Option Y.** Choose one:

- **X. Single scrolling page, re-ordered.** Keep current modal-with-scroll layout; just reorder sections to: Account/Channel → API Keys → Image Generation → Watermark → Pipeline-pointer → Desktop Configuration → Updates → System Prompt. Visual rules between groups, no tabs.
  - Pros: preserves ctrl-F muscle memory, smallest diff, low risk.
  - Cons: still long.
- **Y. Left-rail tab navigation.** Replace the long scroll with 4–5 tabs in a left rail: `General · API Keys · Pipeline · Desktop · Advanced`. Each tab is a separate scroll region. ACs map cleanly: API Keys = one tab, Desktop (incl. updater) = one tab, Pipeline = one tab (pointers + the existing pipeline-related settings lifted from MainContent toolbar so users can find them).
  - Pros: dramatically improves "overview", matches the AC list verbatim.
  - Cons: adds ~80 LOC of nav state, and lifting Pipeline settings out of MainContent is its own mini-project (Hermes should sanction).
- **Z. Card grid landing page.** Settings opens to a grid of cards (API Keys, Pipeline, Desktop, Updates...); each card opens a focused subpanel.
  - Pros: feels modern.
  - Cons: 3× the LOC of Option Y, and the user needs an extra click for everything.

### Decision 3 — "No duplicate fields" interpretation

**Recommend Option P** unless you really mean Q:

- **P. Already done — make it more obvious.** The exclusive guards are correct. Add a one-line "Managed in Desktop Configuration below" hint where the web input is hidden, so users on desktop don't go "where's my Leonardo key?".
  - Pros: zero risk, addresses the *perception* of dupes.
  - Cons: doesn't actually remove any fields (because there aren't any to remove).
- **Q. Single source of truth — collapse to desktop only.** On desktop, drop the web-only sections entirely from the modal. Web mode keeps them.
  - Pros: cleaner desktop modal.
  - Cons: same as P functionally; just shorter.
- **R. (broken — listed for completeness)** Render both inputs always. **Don't choose this.** It's the bug STORY-130 fixed.

### Decision 4 — Save UX

Already met for both desktop (debounced auto-save with status row) and web (write-through with header "Saved" pill). **Recommend "no change"** unless you're dissatisfied with the existing behavior. If you are, tell me which direction:

- **S1. Stronger auto-save.** Make the web header pill match the desktop status row (Saving / Saved / Error). Today web only flashes "Saved" — never shows "Error" if IndexedDB write fails.
- **S2. Explicit save button.** Drop auto-save on web, require button click. (Bad — hurts ergonomics.)
- **S3. Status quo.** Document current behavior with a hint like "Changes save automatically." Done.

---

## Smallest viable execution plan (if you sign off A + Y + P + S1)

**Estimated scope:** 3 files, ~250 LOC net.

1. **`lib/desktop-config-keys.ts`** — add `AUTO_UPDATE_ON_LAUNCH` boolean key (`select` kind, options `['1','0']`, default `'1'`).
2. **`components/UpdateChecker.tsx`** — early-return if config has `AUTO_UPDATE_ON_LAUNCH === '0'`. Expose a `useUpdateChecker()` hook that returns `{ check, state, currentVersion }` so the Settings panel can drive a "Check now" button.
3. **`components/DesktopSettingsPanel.tsx`** — new "Updates" subsection: version readout, "Check for updates now" button, toggle bound to AUTO_UPDATE_ON_LAUNCH.
4. **`components/SettingsModal.tsx`** — restructure into left-rail tabs. Each existing section gets categorized into one of: `General · API Keys · Pipeline · Desktop · Advanced`. Add the "Managed in Desktop Configuration" hint in the API Keys tab where web inputs are hidden.
5. **(if S1)** Wrap the context's `updateSettings` IndexedDB write to surface failures into the existing header pill, with red on error.

**Files NOT touched** unless you say so:
- `types/mashup.ts`, `MashupContext.tsx` — no schema delta for this task
- `app/layout.tsx` — UpdateChecker stays mounted there; the toggle just gates its behavior
- Any pipeline / posting / scheduling code

---

## What I need from you

A one-line ack like `FEAT-002: A+Y+P+S1 — go` (or whatever combo) and I'll execute. If you want a different combo, just say so.

If you want me to scope this down further (e.g., do ONLY the updater integration this round and defer the reorganization to FEAT-002b), say `FEAT-002: A only — defer Y/P/S1`.

If you want me to bang it out with my recommendations (`A+Y+P+S1`) without further confirmation, reply `FEAT-002: ship recommended`.
