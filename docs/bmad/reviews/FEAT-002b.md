# FEAT-002b — Settings: tab restructure + S1 error pill (DONE)

**Status:** done
**Classification:** complex (per Hermes dispatch)
**Dispatched:** 2026-04-18
**Files touched:** 4
- `hooks/useSettings.ts` — added `SettingsSaveState` + lifecycle tracking on the debounced IDB write (+~25 LOC)
- `components/MashupContext.tsx` — destructured `saveState` from `useSettings`, exposed it on the context (+2 LOC)
- `types/mashup.ts` — added `settingsSaveState` to `MashupContextType` (+5 LOC)
- `components/MainContent.tsx` — destructured `settingsSaveState` from context, threaded it into `<SettingsModal saveState=…>` (+2 LOC)
- `components/SettingsModal.tsx` — full body restructured into 4 tabs, header pill rewired to lifecycle state, latent watermark-conditional bug fixed (~+150 / −5 LOC)

---

## What changed

FEAT-002 shipped the auto-update wiring but two pieces stayed paused:

1. The settings dialog had grown into a single 700-line scroll, mixing API keys, AI engine, watermark, and desktop config in one column. Users either learned the offsets by muscle memory or hunted with their scrollbar.
2. The debounced IndexedDB save in `useSettings` swallowed every error in a `.catch(() => {})`. If origin storage was disabled or the quota was full, the modal's "Saved" pill still flashed green — the user got positive feedback for writes that never happened.

This task closes both.

### S1 — Real save lifecycle (was: silent swallow)

`useSettings` now exposes a discriminated union:

```ts
export type SettingsSaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };
```

The debounced effect flips to `saving` when a real edit lands (a `skipFirstSaveRef` guard suppresses the post-load merge so the header doesn't flash on modal open), then resolves to `saved` or `error` from the actual IDB promise. The state lifts through `MashupContext` → `MainContent` → `SettingsModal`'s new `saveState` prop.

The header now renders three mutually-exclusive states:

| State | Visual | When |
|---|---|---|
| `error` | Red pill with `AlertCircle` + "Save failed: {message}", `role="alert"`, full text in `title` | Any rejection from `idb-keyval`'s `set` |
| `saving` | Cyan `Loader2` spinner + "Saving…" | While the 300ms debounce is in flight or while the IDB write is pending |
| `saved` (transient) | Emerald check + "Saved", fades after 1.5s via local `useEffect` timer | After each successful write |

The local `showSaved`/`savedTimer` ref pair is gone. The 1.5s fade is still there but is now driven off the *real* success signal rather than firing on every keystroke regardless of outcome.

### Tab restructure

Body split into four tabs (`'general' | 'apiKeys' | 'aiEngine' | 'desktop'`), tab bar sits between header and scroll body:

| Tab | Sections |
|---|---|
| **General** | Manage Collections · Channel Name · Image Generation · Default Video · Watermark |
| **API Keys** | Leonardo · Instagram · Pinterest (web only) — replaced with a "Managed in Desktop Configuration" hint card on desktop, with a one-click jump button to the Desktop tab |
| **AI Engine** | Pi.dev status + setup · AI System Prompt · Niches · Genres · Saved Personalities |
| **Desktop** | `<DesktopSettingsPanel />` (auto-update, sidecar config, etc.) — plus a "Desktop-only" hint card on web |

Tab state is local to the modal (`useState<TabId>('general')`); first paint always lands on General. Tabs are buttons with `aria-current="page"` on the active one. The bar uses a horizontal scroll on narrow widths so it never wraps.

### Bug fixed (previously latent)

In the prior layout, **Manage Collections** and **Channel Name (Social Media)** were nested *inside* the `{settings.watermark?.enabled && (…)}` conditional. Toggling the watermark off made both sections vanish from the modal — there was no way to delete a collection or change the channel name without first re-enabling the watermark. They have been lifted to the top of the General tab as their own first-class blocks. The watermark conditional now wraps only the watermark-specific controls (logo upload, position, opacity, size).

The originally-nested copy site is annotated with a comment so the next reader doesn't try to "tidy" them back into the conditional.

### Web/desktop exclusivity preserved

Every web-only API input is still gated by `isDesktop === false` (STORY-130 / INSTAGRAM-CRED-FIX). The new desktop-mode hint card on the API Keys tab makes the absence of inputs intentional rather than confusing — and the deep-link button to the Desktop tab gives a clear next action.

---

## tsc

```
$ npx tsc --noEmit
$  # exit 0 — clean
```

---

## Acceptance checklist

| AC | Status | Notes |
|---|---|---|
| SettingsModal organized into logical tabs/sections | ✅ | 4 tabs: General · API Keys · AI Engine · Desktop. Clear taxonomy, no cross-tab duplication. |
| Save error pill (S1) visible on IndexedDB write failures | ✅ | Red pill with `AlertCircle` + message, `role="alert"`, replaces the prior fire-on-every-keystroke green pill. |
| No duplicate fields across web/desktop modes | ✅ | Web API inputs still `isDesktop === false`-gated; desktop users see a hint card with a Desktop-tab deep link instead. |
| tsc clean | ✅ | `npx tsc --noEmit` exits 0. |
| Write FIFO when done | ✅ | After this writeup. |

---

## Out of scope (explicitly not touched)

- Section ordering inside each tab (the order matches the previous top-down flow, minus the lifted Manage Collections + Channel Name).
- Visual polish on the tab bar — current style is a minimal underline highlight; a more designed treatment is a separate DESIGN ticket.
- Per-tab persistence of which tab the user last had open (modal always opens on General by design — predictable).
- Surfacing pi.dev runtime errors in the same pill — `piError` already has its own red text block in the AI Engine tab.

---

## How to verify

1. `npm run dev` → open Settings.
   - Expect four tabs in the header. Land on General. Manage Collections and Channel Name visible at the top.
2. Toggle the Watermark switch off → Manage Collections + Channel Name remain visible (regression test for the watermark-conditional bug).
3. Edit the Channel Name. Header pill flashes cyan "Saving…" → emerald "Saved" → fades after ~1.5s.
4. (Hard to script, but) simulate an IDB write failure in DevTools (e.g. block IndexedDB on the origin) and edit a setting → header shows red "Save failed: …" pill instead of green Saved.
5. Switch to API Keys tab.
   - Web: Leonardo / Instagram / Pinterest inputs.
   - Desktop (Tauri): "Managed in Desktop Configuration" hint card with a button that jumps to the Desktop tab.
6. Switch to AI Engine → Pi.dev status + system prompt + niches/genres/personalities.
7. Switch to Desktop → DesktopSettingsPanel (or web-mode hint).
