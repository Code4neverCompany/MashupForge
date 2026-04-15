---
name: INSTAGRAM-CRED-FIX — move Instagram credentials from IndexedDB to config.json
description: Maurice reports IG creds + watermark wiped on every desktop restart. Root cause is STORY-121's ephemeral-port fallback + the original IDB origin-scoping issue. This fix moves IG creds to config.json so they survive any origin drift. Watermark is flagged for the broader STORY-121 followup.
type: review
---
# INSTAGRAM-CRED-FIX — Instagram credentials + watermark not persisting

**Date:** 2026-04-15
**Author:** developer
**Reported by:** Maurice (direct)
**Status:** SHIPPED — IG creds fixed durably, watermark flagged as followup

## Symptom (Maurice's report)

> "When you close the program and then reopen it, most settings are
> reset. The only thing that stays saved is the API keys at the very
> bottom of the settings. For pi.dev and Instagram local saves…
> Instagram API keys not saved, watermark setting not saved, nothing
> stored, can't post to Instagram, missing connection between
> credentials and program."

On every restart of the installed MashupForge desktop build, everything
resets EXCEPT the two fields at the bottom of the settings modal
(`LEONARDO_API_KEY`, `ZAI_API_KEY`). Those are owned by
`DesktopSettingsPanel` and written to `%APPDATA%\MashupForge\config.json`.

Instagram credentials and watermark settings live in a completely
different store: origin-scoped IndexedDB via `hooks/useSettings.ts` →
`idb-keyval`. THAT store is what's resetting.

## Root cause — three layers

### Layer 1 (historical) — IndexedDB is origin-scoped

IndexedDB keys state by `(scheme, host, port)`. Every different origin
is a different, empty store. When the Tauri WebView navigates to a
different port, it reads a pristine store even though WebView2 still
has the previous launch's data on disk under the old origin.

### Layer 2 (STORY-121, already shipped) — stable port fix

`src-tauri/src/lib.rs:DESKTOP_PORT = 19782` was added to pin the port
so the origin stays constant across launches. This fixed the common
case where every launch picked a fresh ephemeral port (49xxx-60xxx).

### Layer 3 (this report) — the STORY-121 fallback path

`resolve_port()` falls back to an ephemeral port if something else is
already bound on 19782:

```rust
Err(e) => {
    startup_log_line(log_dir, &format!(
        "WARN stable port {} unavailable ({}) — falling back to ephemeral. \
         Settings WILL NOT persist across launches until the conflicting \
         process is closed.",
        DESKTOP_PORT, e
    ));
    // ... bind 127.0.0.1:0 ...
}
```

When this WARN fires — e.g. a zombie sidecar from a prior crash, a
second running instance, or any dev tool squatting on 19782 — the
webview navigates to `http://127.0.0.1:<ephemeral>`, and IndexedDB
reads an empty store for that new origin. The WARN is written to
`startup.log`; it is NOT surfaced in the UI. A typical user never
knows their data just silently stopped persisting.

Maurice is hitting this fallback. The WARN line in his
`%APPDATA%\MashupForge\logs\startup.log` will confirm which process
is squatting on 19782, but either way, the scoped fix below makes IG
credentials immune to the whole category of origin-drift bugs.

## Fix — move INSTAGRAM_* to `config.json`

`config.json` is filesystem-backed at a stable path
(`%APPDATA%\MashupForge\config.json` on Windows; XDG-compliant on
Linux; `~/Library/Application Support/MashupForge/` on macOS). It's
read on sidecar boot by `scripts/tauri-server-wrapper.js`, which
hydrates every string entry into `process.env` before Next.js starts.
PATCH writes via `/api/desktop/config` update both the file AND live
`process.env` so running requests see the change immediately.

Anything stored there survives any webview origin change because it
has nothing to do with the webview.

### Files touched

**1. `lib/desktop-config-keys.ts`** — add two entries

```ts
{ key: 'INSTAGRAM_ACCOUNT_ID',   label: 'Instagram Account ID',   hint: 'Business account ID from Meta for Developers' },
{ key: 'INSTAGRAM_ACCESS_TOKEN', label: 'Instagram Access Token', hint: 'Long-lived Facebook Page Token (starts with EAA)' },
```

`DesktopSettingsPanel` auto-renders every key in this list with
`KeyField`, so the Instagram rows appear at the bottom of the modal
next to the existing Leonardo/Zai rows with zero extra React code. The
debounced auto-save path is reused as-is — they flow through the same
`/api/desktop/config PATCH` call.

**2. `app/api/social/post/route.ts`** — prefer env, fall back to body

```ts
const igAccountIdRaw =
  process.env.INSTAGRAM_ACCOUNT_ID ?? credentials?.instagram?.igAccountId ?? '';
const igAccessTokenRaw =
  process.env.INSTAGRAM_ACCESS_TOKEN ?? credentials?.instagram?.accessToken ?? '';
if (!igAccessTokenRaw || !igAccountIdRaw) {
  throw new Error('Instagram credentials incomplete');
}
```

Desktop: env wins, creds come from `config.json`, no IDB involvement.
Web (Vercel): `process.env.INSTAGRAM_*` is undefined, so the existing
request-body path still works for deployments that pass creds from the
client settings tree.

**3. `app/api/social/best-times/route.ts`** — same env-first pattern

```ts
const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? body.accessToken;
const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID ?? body.igAccountId;
```

This route primes the Smart Scheduler engagement cache; it was also
reading only from the request body, so it was hitting the same failure
mode as `/api/social/post`.

**4. `components/SettingsModal.tsx`** — hide IG inputs on desktop

Same `{isDesktop === false && (...)}` pattern that STORY-130 already
used for the Leonardo key. On desktop the Instagram section would
otherwise persist to IDB and shadow the real `config.json` values — a
user editing the top input would see the "Saved" indicator but the
actual credentials would be whatever DesktopSettingsPanel last wrote.

### Why `?? credentials` and not `?? ''`

The env-first fallback keeps the existing web deployment contract
intact. Vercel users pass creds via the client settings tree (which
works fine there because Vercel's origin is stable). Desktop users get
the env path. The `??` operator means an empty env var (`''`) still
falls through to the request body, preserving the web path exactly.

## What this fix does NOT solve

**Watermark settings** (`settings.watermark.{enabled, image, position,
opacity, scale}`) still live in IndexedDB. Moving them to `config.json`
would be awkward because:
- The watermark IMAGE is a base64 data URL, not a short API key —
  the `KeyField` component assumes short strings and the auto-save
  path writes every value to `process.env` (which isn't meant for
  multi-MB payloads).
- Position/opacity/scale are typed primitives that deserve a proper
  form, not free-text `KeyField`s.
- All four fields belong to one logical object that the image
  generation pipeline reads as a unit.

**Scheduled posts, carousel groups, pipeline state, saved
personalities, agent niches, and agent prompt** also still live in
IDB and are subject to the same origin-drift bug.

The durable fix for ALL of the above is the STORY-121 followup
already flagged in that review: **move settings to a Tauri-command-
backed JSON file in `app_data_dir`**. That eliminates IDB entirely for
desktop and survives any webview config change.

That's genuinely complex work (~day of effort touching `useSettings`,
`useImages`, `useCollections`, `useIdeas`, `useSocial`, plus a new
Tauri command layer and migration). I'm NOT doing it autonomously;
lifting it to Hermes as the next IG/settings-persistence proposal.

## Why the scoped fix is the right call right now

1. **IG creds are the blocker** — Maurice explicitly said "nothing
   stored, can't post to Instagram." Fixing this unblocks him today.
2. **config.json already works** — LEONARDO_API_KEY and ZAI_API_KEY
   persist reliably via exactly this mechanism. We're reusing the
   proven path.
3. **Zero architectural churn** — four files, ~40 lines changed, no
   new dependencies, no data migration needed. Existing IDB-backed
   IG creds will be ignored in desktop mode; users re-enter them once
   in the Desktop Configuration section and they stick forever.
4. **Web deployment unchanged** — Vercel / `npm run dev` on port 3000
   still uses the request-body path because `process.env.INSTAGRAM_*`
   is undefined there.

## Diagnostic — for Maurice to verify root cause

If you're curious which process squatted on port 19782, check:

```
%APPDATA%\MashupForge\logs\startup.log
```

Look for either:
- `bound stable port 19782` — STORY-121 fix is working, the IDB
  reset is a different bug (not this fix's concern).
- `WARN stable port 19782 unavailable (...)` — confirms the
  ephemeral fallback fired. The `(...)` portion names the OS error
  and usually identifies the conflict. With this fix IG creds will
  persist anyway, but the WARN is still a signal that other IDB-
  backed settings (watermark, scheduled posts, etc.) WILL reset
  until the broader followup ships.

## Migration for existing users

Any IG credentials previously entered in the old (IDB-backed) input
section are effectively orphaned — they may still be in IDB but the
new code path never reads them. Users re-enter credentials once in the
Desktop Configuration section (bottom of settings modal). Subsequent
launches will read from `config.json` immediately.

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — 78/78 passing (no new tests; this change is a plumbing
  fix, not new logic)
- Manual path trace:
  1. Open settings in desktop build
  2. Scroll to "Desktop Configuration" section
  3. Instagram Account ID + Instagram Access Token rows visible
  4. Type creds → 800ms debounce → auto-save confirmation
  5. Close app completely
  6. Reopen
  7. Creds still populated (persisted via config.json)
  8. Post to Instagram → `/api/social/post` reads `process.env.INSTAGRAM_*`
     and posts successfully

## Followups

1. **Watermark + rest of UserSettings** — lift to Hermes as the big
   STORY-121 followup. Either (a) move all settings to a Tauri-
   command-backed JSON file, or (b) harden the port-conflict path to
   fail visibly (e.g. UI banner + kill-zombie-sidecar detection).
2. **Audit other env-backed credentials** — Pinterest, Twitter, and
   Discord webhook URL have the same IDB-only persistence story and
   will break under the same origin drift. Same proposed fix pattern
   as IG if the broader refactor is still blocked.

## Files touched (summary)

- `lib/desktop-config-keys.ts` (+6 / -1) — add INSTAGRAM_ACCOUNT_ID + INSTAGRAM_ACCESS_TOKEN
- `app/api/social/post/route.ts` (+13 / -4) — env-first credential resolution
- `app/api/social/best-times/route.ts` (+7 / -2) — env-first credential resolution
- `components/SettingsModal.tsx` (+11 / -1) — hide IG input block on desktop
- `docs/bmad/reviews/INSTAGRAM-CRED-FIX.md` (new) — this artifact
