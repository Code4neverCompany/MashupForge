# QA Brief — MMX Auto-Install Card: 3-State Verification

**Story id:** MMX-AUTO-INSTALL-3STATE-VERIFY
**Dispatched by:** Developer
**Target reviewer:** QA (Quinn)
**Commits to review:**
- `5e8dc4a feat(mmx): auto-install mmx-cli when not found on setup button click`
- `158970f fix(settings): address QA W-1 + W-2 on MMX card` (this commit fixes both warnings from your earlier review at `docs/bmad/qa/MMX-CARD-SETUP-FIX.md`)

## Goal

End-to-end verification that the MMX CLI card in **Settings → AI Agent**
renders the correct UI and triggers the correct action for each of the
three real states the user can be in:

| State | Visual cue | Click outcome |
|---|---|---|
| Not Installed | red dot, "Not Installed" | `npm install -g mmx-cli` runs, then tmux session `mmx-setup` launches `mmx auth login --no-browser` |
| Installed, Not Authenticated | amber dot, "Not Authenticated" | tmux session `mmx-setup` launches `mmx auth login --no-browser` (skips install) |
| Installed + Authenticated | emerald dot, "Available" + version | card becomes selected (`activeAiAgent: 'mmx'`) |
| (Loading — transient) | zinc dot, "Checking…" | **no action** until probes settle (per W-1 fix) |

## Files in scope

- `components/SettingsModal.tsx` — card render + click handler (lines ~485-545, ~509 click handler)
- `app/api/mmx/setup/route.ts` — server-side install + tmux launch
- `lib/mmx-client.ts` — `isAvailable()` resolver
- `lib/useMmxAvailability.ts` — hook that supplies the loading-state null

## Verify criteria

### State A — Not Installed

1. **Setup**: ensure `mmx` is NOT on PATH (`which mmx` empty).
2. Open Settings → AI Agent. Card shows red dot, label "Not Installed".
3. Click the card.
4. Expect: backend POST `/api/mmx/setup` returns `{success:true, tmuxSession:'mmx-setup', ...}` AFTER `npm install -g mmx-cli` completes (5-min ceiling).
5. Re-check `which mmx` — should now resolve.
6. `tmux ls` shows session `mmx-setup` running `mmx auth login --no-browser`.
7. Card poll on next tab open should reflect the new state.

### State B — Installed, Not Authenticated

1. **Setup**: `mmx` on PATH but no token (`rm -rf ~/.mmx` or whatever the auth-state dir is).
2. Open Settings → AI Agent. Card shows amber dot, label "Not Authenticated".
3. Click the card.
4. Expect: POST `/api/mmx/setup` returns `{success:true, tmuxSession:'mmx-setup'}`. The `installMmxCli` branch should be SKIPPED — `isAvailable()` returns true on the first call.
5. `tmux ls` shows `mmx-setup` running `mmx auth login --no-browser`.

### State C — Installed + Authenticated

1. **Setup**: `mmx` on PATH and authenticated (`mmx auth status` passes).
2. Open Settings → AI Agent. Card shows emerald dot, label "Available", version visible.
3. Click the card.
4. Expect: NO network call to `/api/mmx/setup`. The card should become selected (gold border + ● Selected indicator). `settings.activeAiAgent === 'mmx'` and `settings.aiAgentProvider === 'mmx'`.

### W-1 regression check (the loading window)

1. Slow the network or set a breakpoint inside the `/api/mmx/status` fetch resolver in `SettingsModal.tsx` so the response stalls.
2. Open Settings → AI Agent. Card shows zinc dot, label "Checking…".
3. Click the card while still in this state.
4. Expect: NOTHING happens (handler is a no-op; no POST to `/api/mmx/setup`, no settings mutation). Compare to pre-fix behavior where this would have fired the install/auth flow.

### W-2 regression check (busy disable)

1. Trigger a card click in State A or B so `mmxBusy === true`.
2. While the install/auth POST is in flight, the card button should be visually disabled (60% opacity, `not-allowed` cursor) and a second click should not double-fire the POST. Existing `mmxBusyRef` already guards the POST itself; W-2 is the visual half.

### Serverless guard

- On `vercel dev` / `next dev` with the runtime detection tripped, POST `/api/mmx/setup` should return 503 with the desktop-only error. UI should surface it via `mmxError`.

## Out of scope

- Windows-specific path (uses `start "..." cmd /k mmx auth login`). If you don't have a Windows VM, note skipped and we'll cover it manually.
- Actual OAuth completion inside the tmux session (just confirm the session opens with the right argv).

## Reporting

Drop the report at `docs/bmad/qa/MMX-AUTO-INSTALL-3STATE-VERIFY.md`
following the format of your prior `MMX-CARD-SETUP-FIX.md`. If issues
are found, file `concerns` and tag commits.
