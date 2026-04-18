# FEAT-006 — Update behavior dropdown + pipeline-aware install + resume-after-restart

**Status:** done · **Branch:** main · **Classification:** complex (escalated mid-task)

## TL;DR
Replaces the binary `AUTO_UPDATE_ON_LAUNCH` toggle with a tri-state `UPDATE_BEHAVIOR` dropdown (`auto` / `notify` / `off`). Adds two follow-up behaviors requested mid-task: auto-installs never interrupt a running pipeline (postponed up to 120 min), and pipeline state is checkpointed to IndexedDB so a mid-run app death prompts "Continue pipeline?" on next launch.

## What changed

### Tri-state update behavior
- `lib/desktop-config-keys.ts` — replace `AUTO_UPDATE_ON_LAUNCH` (`on`/`off`) with `UPDATE_BEHAVIOR` (`auto`/`notify`/`off`). Export `UPDATE_BEHAVIOR_DEFAULT = 'notify'` and `UpdateBehavior` type. `UPDATER_KEYS` set updated.
- `components/DesktopSettingsPanel.tsx` — `UpdatesSection` swaps the binary toggle for a 3-button radio group with per-option description text. Reads/writes via `draft.UPDATE_BEHAVIOR`, falls back to `'notify'` when missing or invalid.
- `components/UpdateChecker.tsx` — launch-time gate dispatches on the tri-state. `'off'` returns early. `'notify'` is the existing banner flow. `'auto'` sets `autoInstallRef` so a mount-time effect fires `handleUpdate()` without user interaction. Default `'notify'` when config fetch fails.

### Pipeline-busy gate (postpone up to 120 min)
- `lib/pipeline-busy.ts` (new) — module-level pub/sub. `setPipelineBusy(bool)` / `isPipelineBusy()` / `subscribePipelineBusy(listener)`. Lives outside React so `UpdateChecker` (root layout, outside `MashupProvider`) can read state published by `usePipeline` (inside the provider).
- `hooks/usePipeline.ts` — `useEffect` mirrors `pipelineRunning` into `setPipelineBusy()`.
- `components/UpdateChecker.tsx` —
  - `handleUpdate()` checks `isPipelineBusy()` before calling `performInstall`. If busy, transitions to a new `postponed` state with `deadline = now + 120 min`.
  - A watchdog effect on `postponed` state subscribes to busy changes AND polls every 60 s. Fires `performInstall` the moment the pipeline goes idle OR the deadline elapses, whichever comes first.
  - New "Update vX.Y.Z waiting" banner (Clock icon, non-dismissable) explains the postponement to the user with a live minutes-remaining readout.
  - `performInstall` extracted from old `handleUpdate` so both the manual click and the auto-mode trigger share the same download → relaunch path.

### Resume-after-restart
- `lib/pipeline-checkpoint.ts` (new) — idb-keyval-backed `saveCheckpoint` / `loadCheckpoint` / `clearCheckpoint`. `PipelineCheckpoint` type carries `ideaId`, `step` (display label), `concept`, `ts`, `settings` snapshot, `imageIds[]`. Best-effort: any IDB failure silently no-ops so storage problems can never block the pipeline.
- `hooks/usePipeline.ts` — checkpoint snapshot of pipeline settings captured at `startPipeline` time. `processIdea` writes a checkpoint at every step boundary (`Updating status`, `Researching trending topics`, `Expanding prompt`, `Generating images`, `Captioning <model>`, `Captioning carousel`). Image ids accumulated per-idea so the checkpoint reflects what was already saved. `clearCheckpoint()` runs at the end of `startPipeline` — a clean exit drops the checkpoint; a crash leaves the last mid-step record intact.
- On hook mount, `loadCheckpoint()` populates `pendingResume` state.
- `acceptResume`: re-applies the snapshotted settings (state + refs together so `startPipeline` reads the right values immediately), flips the in-flight idea back to `'idea'` status if still `'in-work'`, clears the prompt, calls `startPipeline()`. Mid-step async state isn't restorable, so we re-run the affected idea from scratch — the user said yes to continuing, not to literal byte-perfect resumption.
- `dismissResume`: clears prompt + checkpoint.
- `components/PipelineResumePrompt.tsx` (new) — fixed bottom-left dialog with "Yes, continue" / "No, discard" buttons. Renders nothing when no checkpoint.
- `components/MashupStudio.tsx` — mounts `<PipelineResumePrompt />` inside `MashupApp` (within `MashupProvider`).
- `components/MashupContext.tsx` + `types/mashup.ts` — context type extended with `pendingResume`, `acceptResume`, `dismissResume`.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Update behavior setting in DesktopSettingsPanel: Auto-update / Notify / Off | done |
| Setting persists in desktop config | done — `UPDATE_BEHAVIOR` in `DESKTOP_CONFIG_KEYS` allowlist; PATCH `/api/desktop/config` accepts it |
| UpdateChecker respects the setting (auto vs notify vs hidden) | done |
| Default: Notify (safe default, user is aware) | done — `UPDATE_BEHAVIOR_DEFAULT = 'notify'`; tri-state guard falls back to default on missing/invalid value |
| Auto-update must NOT interrupt a running pipeline | done — `isPipelineBusy()` gate in `handleUpdate`; `postponed` state |
| If pipeline active, postpone up to 120 minutes | done — `PIPELINE_POSTPONE_MAX_MS = 120 * 60_000`; deadline tracked in state, install fires when pipeline idle OR deadline elapses |
| Pipeline state persists between app restarts | done — IDB checkpoint at every step boundary |
| On app start, if pipeline was in progress, show "Continue pipeline? Yes/No" | done — `<PipelineResumePrompt />` |
| Pipeline state (current step, images so far, settings used) saved | done — all three fields in `PipelineCheckpoint` |
| `tsc` clean | done — `npx tsc --noEmit` exits 0 |
| Write FIFO when done | pending (this commit) |

## Why complex (escalated)
Original FEAT-006 was a 3-LOC select-box swap (routine). The mid-task additions — pipeline-busy gating with 120-min cap, IDB checkpointing across pipeline steps, cross-tree pub/sub for `UpdateChecker` to reach state owned by a hook inside a provider it isn't in — touch 8 files including a context shape change. Per CLAUDE.md routing rules this is "Complex" (cross-file refactor + context type change). Continued in main thread because the design needed simultaneous awareness of `usePipeline`'s ref/state model, the `UpdateChecker` lifecycle, and the `MashupProvider` boundary.

## Verification gap
On WSL — cannot exercise the actual installer + relaunch loop. `tsc` is clean and the logic is straightforward, but the on-Windows runtime checklist is:

1. **Tri-state UI** — Settings → Updates section shows three buttons (Auto-update / Notify / Off). Selecting one writes to `config.json` (visible at `%APPDATA%\com.4nevercompany.mashupforge\config.json`).
2. **`'off'`** — relaunch app, no banner appears. Manual "Check for updates" still works.
3. **`'notify'`** (default) — relaunch, banner appears for any newer release. Click Update Now → installs + relaunches.
4. **`'auto'`** — relaunch, no banner; download + install + relaunch happens silently.
5. **Pipeline-busy gate** — start a pipeline run, then trigger an update (either auto-mode at launch or manual click). Banner switches to "Update vX.Y.Z waiting". When pipeline finishes (or you stop it), install fires within ≤60 s.
6. **Resume prompt** — start a pipeline run, kill the app mid-`processIdea` (Task Manager → end MashupForge.exe). Relaunch. Bottom-left "Continue pipeline?" prompt shows the last step + idea concept. "Yes, continue" restarts the pipeline with the checkpointed settings; the in-flight idea returns to the queue. "No, discard" dismisses and clears the IDB checkpoint.
7. **120-min cap** — only practical to test by lowering `PIPELINE_POSTPONE_MAX_MS` locally.

## Files touched
- `lib/desktop-config-keys.ts` (replace key)
- `lib/pipeline-busy.ts` (new)
- `lib/pipeline-checkpoint.ts` (new)
- `hooks/usePipeline.ts` (busy publish + checkpoint writes + resume helpers)
- `components/UpdateChecker.tsx` (tri-state + postpone state + auto-trigger)
- `components/DesktopSettingsPanel.tsx` (tri-state UI)
- `components/PipelineResumePrompt.tsx` (new)
- `components/MashupStudio.tsx` (mount prompt)
- `components/MashupContext.tsx` (forward new context fields)
- `types/mashup.ts` (extend `MashupContextType`)

## Follow-ups (deferred)
- True mid-step resume (replay `expandedPrompt`, skip already-saved images) — current design re-runs the affected idea from scratch, which is the safer minimum viable interpretation. Easy to add if Maurice wants byte-perfect resumption later.
- BUG-002/003 work guarantees clean restart for any mode (`relaunch()` + Job Object kill), so the resume prompt's checkpoint-detection assumption holds.
- The legacy `AUTO_UPDATE_ON_LAUNCH` key is removed cleanly (no back-compat shim) per user instruction "no production users yet".
