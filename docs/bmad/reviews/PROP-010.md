# PROP-010 — Settings reset bug investigation

**Date:** 2026-04-15
**Investigator:** developer
**Status:** Root cause confirmed. Fix proposed (single-file, ~10 LOC).
**Severity:** High — silent data loss.

## TL;DR

The "settings sometimes completely reset" bug is **not** a dual-store sync
issue. It is a single-file closure-timing race in
[`hooks/useSettings.ts:33-45`](../../../hooks/useSettings.ts). `updateSettings`
reads a closure variable (`latest`) into its IndexedDB write before the React
state updater that assigns it has actually run, so the persisted value is
`undefined` instead of the merged settings object. The next page load reads
`undefined` from IDB, falls through to `defaultSettings`, and the user sees a
full reset.

The dual-store concern (IDB ↔ `config.json`) is real but **separate**: it only
affects API keys and is a UX issue (STORY-130 already mitigated it for the
Leonardo field). The non-API-key fields Maurice is losing (watermark,
agentPrompt, agentNiches, savedPersonalities, channelName, defaults) live
**only** in IDB, so any reset of those is fully attributable to the IDB write
path.

## How I narrowed it down

1. **Investigation 1 — who writes what to which store?**
   - `grep mashup_settings **/*.{ts,tsx}` → only `hooks/useSettings.ts`
     touches the IDB key. No other writer.
   - `components/DesktopSettingsPanel.tsx` writes only to
     `/api/desktop/config` (config.json), and only the keys in
     `lib/desktop-config-keys.ts`. It never touches the IDB store.
   - **Conclusion:** the dual-store cannot be the cause of resets for
     non-API-key fields. Those fields only have one home (IDB). If they
     reset, the IDB path is at fault.

2. **Investigation 2 — what is the IDB write path doing?**
   See `hooks/useSettings.ts:33-45`:

   ```ts
   const updateSettings = async (newSettings) => {
     let latest: UserSettings;
     setSettings((prev) => {
       const patch = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
       latest = { ...prev, ...patch };
       return latest;
     });
     try {
       await set('mashup_settings', latest!);   // ← BUG
     } catch (e) {
       console.error('Failed to save settings to IndexedDB', e);
     }
   };
   ```

   The author intended: "run the React updater, capture the merged result
   into `latest`, then persist it." But `setSettings(updater)` does **not**
   guarantee that the updater function runs synchronously at call time. In
   React 18 the updater is queued and only runs when the next render
   reconciles — which can happen *after* the `await set(...)` line on the
   next microtask tick. When that happens, `latest` is still its
   uninitialised `let` binding (i.e. `undefined`), and we end up calling
   `set('mashup_settings', undefined)`.

   `idb-keyval` happily stores `undefined` as a structured-clone value;
   `get('mashup_settings')` then returns `undefined` on next load, which
   the load path treats as "nothing stored" and falls back to defaults.

3. **Investigation 3 — does this match the symptom?**
   - "Settings sometimes completely reset" → yes. Intermittent because the
     race depends on whether React processes the updater before the
     microtask that resolves the awaited `set()`. In production builds and
     under load, the updater is more likely to be deferred.
   - "Not saved" → same root cause. A successful no-op save still
     overwrites the prior good value with `undefined`, which on next load
     looks like "never saved."
   - Strict Mode in dev runs updaters twice, which makes this *less* likely
     to fire in dev (because the first invocation is more likely to land
     before the await resolves) — explaining why Maurice sees it less often
     during local dev than in the installed Tauri build.

## Why "race between two stores" is not the story

For the dual-store hypothesis to cause a reset, both stores would have to
get out of sync on the same key, and one would have to overwrite the
other's good value. But:

- The two stores share **only** API keys (and only on desktop).
- Non-API-key fields exist in IDB only — there is nothing in config.json
  for them to race with.
- `DesktopSettingsPanel.tsx` only writes the keys it owns; it never
  PATCHes the broader settings object back into IDB.

The dual-store design is still ugly and bit us in STORY-130, but that's a
**separate** issue that should not be conflated with the reset bug.

## The fix

Two viable shapes; I prefer Option B.

### Option A — persist inside the updater (smallest diff)

```ts
const updateSettings = (newSettings) => {
  setSettings((prev) => {
    const patch = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
    const next = { ...prev, ...patch };
    void set('mashup_settings', next).catch((e) =>
      console.error('Failed to save settings to IndexedDB', e),
    );
    return next;
  });
};
```

- Pros: minimal change, fully fixes the closure-timing race.
- Cons: side effect inside a state updater is an anti-pattern. React Strict
  Mode runs updaters twice in dev → two IDB writes per call. The writes
  carry identical data so it's harmless, but it's noisy and easy to
  misread later.

### Option B — persist via `useEffect` (preferred)

```ts
useEffect(() => {
  if (!isSettingsLoaded) return;            // don't persist during initial seed
  void set('mashup_settings', settings).catch((e) =>
    console.error('Failed to save settings to IndexedDB', e),
  );
}, [settings, isSettingsLoaded]);

const updateSettings = (newSettings) => {
  setSettings((prev) => {
    const patch = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
    return { ...prev, ...patch };
  });
};
```

- Pros: pure updater, single source of truth (effect persists whatever the
  committed state is), inherently coalesces rapid edits into one write,
  Strict-Mode-safe.
- Cons: tiny extra render-then-write step; one cycle of "user just clicked
  Done before the effect fires" risk if the panel unmounts within the same
  microtask. In practice React commits before unmount runs, and IDB writes
  survive component teardown — verified by reading idb-keyval's
  implementation (it queues the `put` in the existing object store
  transaction synchronously).

I'd add one belt-and-suspenders check in the load path:

```ts
const idbSettings = await get('mashup_settings');
if (idbSettings && typeof idbSettings === 'object') {
  setSettings(prev => ({ ...prev, ...idbSettings }));
}
```

This already handles the existing `if (idbSettings)` case but explicitly
rejects any future corrupted/non-object value too (defensive against the
class of bug that just bit us).

## Suggested follow-ups (NOT in this fix)

- **PROP-010 stays open** as the umbrella for "single source of truth for
  settings" — this fix unblocks the reset symptom but doesn't address the
  IDB ↔ config.json duplication. That's still a worthwhile cleanup but
  it's a refactor, not a bug.
- After the fix, a tiny vitest unit on `updateSettings` (mock idb-keyval)
  would prevent regression. Lines up with PROP-011 (test harness) — when
  that lands, this is the first test to write.
- Audit the `nextEffectiveLoad` of any other hook that uses the same
  "capture from updater into closure" pattern. A quick grep:

  ```bash
  grep -RInE 'let [a-zA-Z]+: \w+;\s*$' hooks/ components/MashupContext.tsx
  ```

  None found in the current tree, but worth re-running periodically.

## Patch scope

- 1 file changed: `hooks/useSettings.ts`
- ~12 lines net change
- No new dependencies
- No migration needed (the bug only writes `undefined`; once the bug is
  fixed, the next normal `updateSettings` call writes good data and the
  load path is healed automatically)

**Recommendation:** approve Option B + the load-path defensive check, ship
as a single commit. Estimated 15 minutes including tsc/lint.
