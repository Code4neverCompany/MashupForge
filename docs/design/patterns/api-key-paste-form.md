# Pattern: API-Key Paste Form

**Status:** Stable
**First implementation:** `components/SettingsModal.tsx` — MMX section (commit landing alongside this doc)
**Owner:** Designer + Developer

---

## When to use

Apply this pattern when **all** of the following hold:

1. The user holds a secret (API key, access token, webhook URL) issued
   by a third-party service.
2. The local app needs that secret stored on the user's machine —
   either in the app's own config (`localStorage` / `config.json`) or
   handed to a CLI tool's local config via a server-side subprocess.
3. The secret never leaves the user's device after being entered, OR
   only leaves it on its way to the third party it identifies them with.

Do **not** use this pattern for credentials that ship to MashupForge's
own backend; those need a different visual treatment (and probably a
different consent flow).

## Anatomy

```
┌─────────────────────────────────────────────────────┐
│ <state-aware caption>                               │
├─────────────────────────────────────────────────────┤
│ <UPPERCASE LABEL>                                   │
│ ┌─────────────────────────────────────┐  ┌───────┐ │
│ │ <password input, monospace>          │  │ Save  │ │
│ └─────────────────────────────────────┘  └───────┘ │
│ <storage + provenance help text>                    │
├─────────────────────────────────────────────────────┤
│ or <secondary path>                                 │ ← underlined text link
├─────────────────────────────────────────────────────┤
│ ✓ <success badge, 3.5s auto-clear>                  │ ← when applicable
│ <inline error, persistent until next attempt>       │ ← when applicable
└─────────────────────────────────────────────────────┘
```

## Behaviour rules

### State-aware caption

A single short sentence at the top, in `text-[11px] text-zinc-400`,
that names the *current* situation, not the action:

| Situation | Caption |
|---|---|
| Probe in flight / status unknown | `Checking <service> status…` |
| Service binary missing | `<service> is not installed yet.` |
| Service installed, secret missing | `<service> is installed but not authenticated.` |

Use lowercase service names ("MMX", "Pi.dev", "Pinterest") — match
each service's own brand casing.

### Input

- `type="password"`. Always.
- `autoComplete="off"`, `spellCheck={false}`. Browser autofill is the
  wrong tool here; the value is paste-from-elsewhere.
- `font-mono` so the user can spot mis-pastes (`sk-` prefixes,
  trailing whitespace).
- `placeholder` = the format prefix the issuer uses (`sk-…`, `EAA…`,
  `xoxb-…`). Helps users sanity-check their paste.
- `disabled={busy}`. The single Save POST is the gate; double-clicks
  must not race.
- `aria-describedby` linked to the help text below.
- `Enter` submits when the trimmed value is non-empty AND not busy.

### Save button

- Gold (`btn-gold-sm`). Primary visual action.
- Label flips `Save` → `Saving…` while the POST is in flight.
- Disabled when busy OR the trimmed input is empty.
- `disabled:opacity-50 disabled:cursor-not-allowed` for visual parity
  with disabled-state buttons elsewhere in Settings.

### Help text

One sentence in `text-[10px] text-zinc-600`, two clauses:

1. **Where it's stored.** "Stored in your local mmx config" /
   "Stored in `~/.mashup/config.json` on this machine".
2. **What we promise.** "Never sent to MashupForge servers" — only
   when true. If MashupForge's own backend ever sees the value, drop
   this clause; lying here permanently breaks user trust.

End with the issuer's URL: `Get one at <provider>.com`.

### Secondary path (when present)

If the service offers a richer setup flow that the API-key form
doesn't cover (OAuth, device-code, multi-step config), expose it as
an underlined text link below the form, prefixed with "or":

```
or sign in via terminal (OAuth)
```

Underlined `text-[11px] text-zinc-400 hover:text-[#c5a062]`. Never
gold. Never a button shape. The visual demotion is the entire point —
the API-key path is faster, this is the fallback.

### Feedback

**Success.** A transient inline confirmation, `text-[11px]
text-emerald-400`, prefixed with `✓` (with `aria-hidden` on the
glyph). Auto-clears after **3.5 seconds**. The flip of the underlying
status (red dot → emerald dot, or "Not Authenticated" → "Authenticated"
elsewhere in the surface) is the *durable* signal; the inline badge
exists so the user notices the success at all.

**Error.** Inline below the form, `text-[11px] text-red-400`,
`role="alert"`, `whitespace-pre-wrap` so multi-line server errors
land readable. Persists until the next save attempt clears
`<service>Error` state. Never auto-clears — failure deserves attention.

### Save handler contract

The handler should:

1. `trim()` the input. Reject empty.
2. Set busy state.
3. POST to the server endpoint. The endpoint runs the service-specific
   command (e.g. `mmx auth login --method api-key --api-key <key>`).
4. **Verify** post-write. Run a status probe (`mmx auth status`,
   `pi auth status`, etc.) before declaring success — credentials can
   be syntactically accepted by the write step but rejected by the
   first real call.
5. Refetch the local status state so the surrounding UI flips.
6. Fire the success badge only if step 4 passes.
7. On any failure, surface the server's error message (run through a
   redactor that strips the secret value) and leave the form mounted
   so the user can correct + retry.

## Reference implementation

See the `mmxSetupBlock` value in `components/SettingsModal.tsx` and
the matching `POST /api/mmx/setup` apiKey branch.

## Anti-patterns

- **Don't show the saved value back.** Once stored, the secret is
  invisible. Re-edits are a fresh paste, not a "show + edit".
- **Don't toast the success.** Toasts move; inline confirmation
  belongs to its trigger.
- **Don't auto-submit on paste.** Users sometimes paste the wrong
  string. Require an explicit Save click or Enter.
- **Don't validate format on the client beyond non-empty.** Issuers
  change prefix conventions; let the server's status probe be the
  judge.
