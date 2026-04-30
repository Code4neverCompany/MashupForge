# QA Brief — MMX Card UX Visual Pass

**Story id:** MMX-CARD-VPASS-001-QA
**Dispatched by:** Developer (executed the visual pass after three Designer-routing attempts didn't land)
**Target reviewer:** QA (Quinn / qa-claude)
**Commits to review:**
- `0fc1321 refactor(settings): MMX card UX visual pass (MMX-CARD-VPASS-001)`
- `d522b6f docs(briefs): MMX-AGENT-CARD-UX-VISUAL-PASS brief from Hermes`

**Decisions doc (read first):** `design/MMX-AGENT-CARD-UX-VISUAL-PASS.md`
**Reusable pattern doc:** `docs/design/patterns/api-key-paste-form.md`
**Original brief:** `docs/bmad/briefs/MMX-AGENT-CARD-UX-VISUAL-PASS.md`

---

## Goal

Verify the visual + UX polish pass on the MMX AI Agent card lands the
intended behaviour for every state, and that the refactor (shared
`mmxSetupBlock`) didn't regress the auto-install / auth flows shipped
in earlier commits (`5e8dc4a`, `158970f`, `97750c8`, `1564c1a`,
`75e0c85`, `96d271e`, `b2a2311`).

## Files in scope

- `components/SettingsModal.tsx`
  - `mmxSetupBlock` definition (~line 308)
  - `postMmxSetup` / `handleMmxApiKeySave` / `handleMmxSetup` /
    `refreshMmxStatus` / `mmxJustAuthed` auto-clear effect (~line 167-265)
  - Hoisted CTA render site (~line 670)
  - Active-agent panel render site (~line 705)

Out of scope: `app/api/mmx/setup/route.ts`, `lib/mmx-client.ts`,
`lib/runtime-env.ts`, `useMmxAvailability.ts` — backend / auto-install
behaviour was already verified in MMX-AUTO-INSTALL-3STATE-VERIFY and
those files are unchanged in this pass.

## Verify criteria

### V1 — Hoisted CTA renders only when MMX is NOT the active agent
1. Set `activeAiAgent` to `'pi'` (default). Navigate to Settings → AI Agent.
2. With `mmxStatus.authenticated === false`, the hoisted CTA section
   appears **above** the active-agent panel.
3. Click the MMX card to make it the active agent (only possible when
   it's healthy, otherwise card-click triggers setup — verify with a
   healthy machine or stub `mmxStatus`).
4. Hoisted CTA disappears. The active-agent panel takes over with the
   same `mmxSetupBlock` content.

**Expected:** never both panels rendering needs-setup UI simultaneously.

### V2 — `mmxSetupBlock` content is identical in both render sites
1. Compare the rendered DOM in both panels (e.g. via React devtools /
   visual diff). Caption text, label, input attributes (type=password,
   font-mono, placeholder `sk-…`), button (`Save`), help text, OAuth
   link, error/success containers — all bit-identical.

**Expected:** no drift between hoisted CTA and active-agent panel.

### V3 — State-aware caption + OAuth link copy
With each `mmxStatus` shape, confirm caption + OAuth link microcopy:

| `mmxStatus` | Caption | OAuth link |
|---|---|---|
| `null` (loading) | `Checking MMX status…` | `or sign in via terminal (OAuth)` |
| `{available:false, authenticated:false}` | `MMX is not installed yet.` | `or install + sign in via terminal (OAuth)` |
| `{available:true, authenticated:false}` | `MMX is installed but not authenticated.` | `or sign in via terminal (OAuth)` |

**Expected:** match the table in `design/MMX-AGENT-CARD-UX-VISUAL-PASS.md`.

### V4 — Authenticated state in active-agent panel
1. With `mmxStatus = {available:true, authenticated:true, version:'1.2.3'}`
   and `activeAiAgent === 'mmx'`, the active-agent panel shows:
   ```
   ✓ MMX is authenticated and ready (1.2.3).
   Open MMX CLI to change provider/model
   ```
2. Click the underlined link. `handleMmxSetup` fires → POST `/api/mmx/setup` (no body) → tmux session `mmx-setup` opens.

**Expected:** reconfiguration path doesn't require deselecting MMX first.

### V5 — Success feedback flow (happy path)
1. With MMX not authenticated, paste a valid API key into the
   `mmx-api-key` input. Press Enter or click `Save`.
2. Button label flips `Save` → `Saving…`. Input + button disabled.
3. POST to `/api/mmx/setup` with `{apiKey}` returns 200.
4. UI: input clears, `mmxStatus` re-probes, `mmxJustAuthed` flips true,
   inline `✓ MMX authenticated. Open the terminal anytime to pick a
   provider/model.` appears in `text-emerald-400`.
5. After 3.5s the badge auto-clears (verify with a stopwatch / DOM
   inspection).
6. Card dot flips amber → emerald. Hoisted CTA disappears (or panel
   transitions to authenticated state if MMX is the active agent).

**Expected:** the user sees both transient confirmation AND durable
status flip without manual intervention.

### V6 — Error feedback (invalid key)
1. With MMX not authenticated, paste a syntactically wrong / expired
   key (e.g. `sk-invalid`). Click `Save`.
2. POST returns 500 with redacted error body.
3. UI: input retains its value (so the user can correct + retry),
   `mmxError` populates, inline `text-red-400` paragraph appears with
   `role="alert"` and `whitespace-pre-wrap`. No success badge.
4. Open the next paste attempt — `mmxError` clears at the start of the
   POST.

**Expected:** error visible, persistent until next attempt, never
auto-clears.

### V7 — Double-click + concurrent submit guard
1. Bind a slow network condition (DevTools throttling). Paste a key,
   click `Save`. Immediately click `Save` again, and click the card.
2. Only one POST should fire (verify in Network tab). `mmxBusyRef`
   guards `postMmxSetup`.
3. The card button respects `disabled={mmxBusy}` — visual disabled
   styling visible.

**Expected:** no duplicate POST, no race condition.

### V8 — Loading-window clickability
1. Force `mmxStatus = null` (e.g. throttle the `/api/mmx/status` probe).
2. Click the MMX card while still loading.
3. `handleMmxCardClick` routes to `handleMmxSetup` (the W-1 reversal in
   commit `75e0c85`). POST fires, tmux session opens.

**Expected:** the card is responsive even during the status probe.

### V9 — Active-agent panel never crashes when MMX is auth'd but version unknown
1. Set `mmxStatus = {available:true, authenticated:true, version:''}`.
2. Active-agent panel renders `✓ MMX is authenticated and ready.` (no
   trailing version parens).

**Expected:** the optional-version logic in the JSX doesn't render
`(null)` or `(undefined)`.

### V10 — Pi.dev panel unchanged
1. With Pi.dev as the active agent, navigate to Settings → AI Agent.
2. The Pi panel renders exactly as before — no MMX leakage, no shared-block contamination.

**Expected:** the refactor is MMX-only.

## Reporting

Drop the report at `docs/bmad/qa/MMX-CARD-VPASS-QA.md` following the
format of `docs/bmad/qa/MMX-AUTO-INSTALL-3STATE-VERIFY.md`.

Include:
- Verify-criteria table (✅/❌ per item).
- Any warnings (W-A, W-B, …) — if you find regressions or visual
  mis-fires the design spec didn't catch.
- A confidence number 0.0-1.0 for the overall pass.
- Status: `PASS` / `CONCERNS` / `FAIL`.

If anything fails, note the specific commit and line that needs to
change. Developer will own the patch.
