# Brief: AI Agent Settings Tab — MMX CLI + Pi.dev Switch

**Date:** 2026-04-29
**Project:** MashupForge
**Author:** Hermes (orchestrator)
**Status:** Ready for dispatch

---

## Context

MeshupForge currently has an "AI Engine" tab in Settings that shows pi.dev status and a "Setup Pi.dev" button. Maurice wants a proper "AI Agent" tab that:
1. Switches between MMX CLI and pi.dev as the active AI agent
2. Shows status for both agents
3. Has a "Launch Setup" button that opens the selected CLI interactively in a terminal

MMX CLI is already integrated (lib/mmx-client.ts, /api/mmx/* routes, MmxStudioPanel floating UI). Pi.dev setup uses a tmux session (`tmux attach -t pi-setup`).

---

## What to Build

### 1. New Settings Tab: "AI Agent"

Add a new tab to SettingsModal with:
- Tab ID: `'aiAgent' | 'general' | 'apiKeys' | 'aiEngine' | 'desktop'`
- Label: "AI Agent", Icon: `Bot` from lucide-react

### 2. Agent Selection Toggle

Show both MMX CLI and pi.dev as selectable options:
- **MMX CLI card**: Shows availability status (via `useMmxAvailability()`), MiniMax model in use
- **Pi.dev card**: Shows PiStatus (already available in SettingsModal props), provider/model

Toggle between them — selected agent is highlighted with gold/indigo border. Selection stored in settings as `activeAiAgent: 'mmx' | 'pi'`.

### 3. Status Display

**For MMX CLI:**
- Probe `/api/mmx/availability` — shows "Available" or "Not Available"
- Show MiniMax model being used (from env or config)
- Show capabilities: text, image, music, video, speech, vision

**For pi.dev:**
- Show current PiStatus (installed, authenticated, running, provider/model)
- Show "Setup Pi.dev" button if not authenticated (existing logic)

### 4. Launch Setup Button

Primary action button: **"Launch [Agent] Setup"**

- **For MMX CLI**: If not authenticated/configured, open a terminal window running `mmx login` or the appropriate setup command. Use tmux session `mmx-setup`.
  - On Windows (WSL): open Windows Terminal with `wsl.exe mmx login`
  - On native: `tmux new-session -d -s mmx-setup 'mmx login'` + notify user to attach
  
- **For pi.dev**: If not authenticated, open pi.dev setup. Already implemented via `handlePiSetup()` → opens `tmux attach -t pi-setup`

### 5. API Route for MMX Availability + Auth Check

Create `/api/mmx/status` route that:
- Checks if `mmx --version` works (availability)
- Checks auth status via `mmx auth status` or equivalent
- Returns: `{ available: boolean, authenticated: boolean, version: string }`

### 6. Settings State

Add to `UserSettings` type:
```typescript
activeAiAgent: 'mmx' | 'pi';
```

---

## Files to Change

| File | Change |
|------|--------|
| `components/SettingsModal.tsx` | Add `aiAgent` tab, agent toggle UI, status cards, Launch Setup button |
| `components/MainContent.tsx` | Add `activeAiAgent` to settings state, pass to SettingsModal |
| `app/api/mmx/status/route.ts` | NEW — availability + auth check |
| `hooks/useMmxAvailability.ts` | Optionally extend to also return auth status |
| `types/mashup.ts` | Add `activeAiAgent` to UserSettings |

---

## UI Layout (AI Agent Tab)

```
┌─────────────────────────────────────────────────────────────┐
│  [Bot icon]  AI Agent                                       │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ ● MMX CLI            │  │ ○ Pi.dev             │        │
│  │ MiniMax M2.7        │  │ GLM-5.1             │        │
│  │ [Available ✓]        │  │ [Running ✓]         │        │
│  │                      │  │                      │        │
│  │ Text  Image  Music  │  │ Text  Vision         │        │
│  │ Video Speech Search  │  │                      │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                              │
│  [ Launch MMX Setup ]   or   [ Launch Pi.dev Setup ]        │
│                                                              │
│  Active agent handles all AI tasks: image generation,        │
│  brainstorming, captions, and more.                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

- [ ] New "AI Agent" tab appears in Settings, replacing or alongside "AI Engine"
- [ ] MMX CLI card shows real availability status from `/api/mmx/status`
- [ ] Pi.dev card shows real PiStatus
- [ ] Selecting an agent saves `activeAiAgent` to settings
- [ ] "Launch Setup" button opens appropriate CLI for selected agent
- [ ] MMX setup uses tmux session `mmx-setup` with `mmx login`
- [ ] Pi.dev setup uses existing `handlePiSetup` flow
- [ ] All existing tests pass
