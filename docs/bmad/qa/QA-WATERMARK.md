# QA Review — QA-WATERMARK (POLISH-018 watermark persistence)

**Status:** PASS with note
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commits:** 7d89937 (POLISH-018 deep-merge), e124ce8 (AUDIT-051 regression tests)

---

## Root cause framing — two distinct bugs

Maurice's report covered two independent persistence failures.
POLISH-018 fixes one; the other is correctly deferred.

**Bug A — Partial-load default clobber** (POLISH-018 target):
- IDB can store a settings object that predates the `watermark` field.
- Shallow `{ ...prev, ...idbSettings }` spreads the missing or
  `undefined` watermark field on top of the default, wiping it.
- This can also happen if a prior PROP-010 race wrote `undefined`
  into the store before the fix.
- **POLISH-018 fixes this.** ✓

**Bug B — IDB origin drift** (STORY-121, still open):
- `resolve_port()` fallback fires → webview navigates to
  `http://127.0.0.1:<ephemeral>`.
- New origin → empty IDB store → `get('mashup_settings')` returns
  undefined → full reset to `defaultSettings`.
- Watermark (base64 image, position, opacity, scale) cannot go through
  `process.env` / `config.json` — unsuitable for the IG-cred fix pattern.
- **Correctly deferred to STORY-121 Tauri-command-backed store.** ✓

---

## POLISH-018 audit (`hooks/useSettings.ts`)

### `mergeSettings()` — exported at line 11
```ts
export function mergeSettings(prev: UserSettings, patch: Partial<UserSettings>): UserSettings {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<UserSettings>;
  const merged = { ...prev, ...clean };
  if (clean.watermark && typeof clean.watermark === 'object') {
    merged.watermark = { ...prev.watermark, ...clean.watermark };
  }
  if (clean.apiKeys && typeof clean.apiKeys === 'object') {
    merged.apiKeys = { ...prev.apiKeys, ...clean.apiKeys };
  }
  return merged;
}
```

- [INFO] Top-level `undefined` stripping via `Object.entries().filter()` —
  prevents missing/undefined fields in the stored payload from overwriting
  defaults. Correct. ✓
- [INFO] One-level deep-merge for `watermark` — partial saves (e.g., only
  `enabled` changed) preserve all other watermark fields from `prev`.
  Correct for a flat nested object. ✓
- [INFO] Same deep-merge for `apiKeys` — consistent with watermark treatment.
  Any new key added to the apiKeys schema gets preserved from default unless
  explicitly overwritten. ✓
- [INFO] `typeof clean.watermark === 'object'` guard — rejects null and
  non-object values from a corrupted store. ✓
- [INFO] `export` added to make the function directly testable. Correct. ✓

### Load path (lines 41, 45)
Both the localStorage migration path and the IDB load path now use
`mergeSettings()` instead of the prior `{ ...prev, ...parsed }` shallow spread.
Both paths are covered. ✓

### Persist path (lines 64–67) — PROP-010 effect
```ts
useEffect(() => {
  if (!isSettingsLoaded) return;
  void set('mashup_settings', settings).catch(() => {});
}, [settings, isSettingsLoaded]);
```

`isSettingsLoaded` guard prevents default-state from being written before
IDB is consulted. This means a "new origin" scenario (Bug B, IDB drift)
doesn't cause POLISH-018 to race and write defaults over the old origin's
data — the new origin's store stays empty until the user actively changes
a setting. Subtle but correct. ✓

---

## Regression tests (AUDIT-051, `tests/hooks/mergeSettings.test.ts`)

8 cases covering:
- Empty patch → defaults preserved ✓
- Top-level `undefined` stripped ✓
- Scalar override ✓
- Partial watermark merge (fields not in patch preserved from `prev`) ✓
- Watermark full merge ✓
- `apiKeys` deep-merge ✓
- `undefined apiKeys` not clobbering prev ✓

Suite: 107/107 passing. The regression gate directly locks the watermark
persistence behavior against any future revert to shallow spread. ✓

---

## What is NOT fixed (correctly scoped out)

**IDB origin drift** (Bug B) — watermark still resets to defaults
when the STORY-121 port fallback fires. This is a structural limitation.
The fix requires:
- A Tauri command to read/write a JSON file in `app_data_dir`
- A new Rust command layer
- Migration of `useSettings` off IDB for at least the watermark subtree

This is flagged as the STORY-121 followup (also tied to PROP-021 gallery
deferred work). Developer has proposed lifting this to Hermes. Not in scope
for POLISH-018. ✓

**One-time migration**: Users who previously saved watermark settings under
a stable port will see their watermark preserved correctly now. Users who hit
the ephemeral fallback will still see a reset — POLISH-018 doesn't help them.
Acceptable given the scope constraint.

---

## Gate Decision

PASS — POLISH-018 correctly fixes Bug A (partial-load default clobber) for
watermark and apiKeys. Deep-merge is sound, `isSettingsLoaded` guard prevents
race-writes on new origins, and 8 regression tests lock the behavior.
Bug B (IDB origin drift) correctly deferred to STORY-121 followup.
tsc clean, 107/107 tests passing.
