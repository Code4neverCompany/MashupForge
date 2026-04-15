---
name: AUDIT-008 — Toast.tsx ref-staleness in cleanup
description: Capture timers ref into a local before the cleanup closure
type: review
---
# AUDIT-008 — Toast.tsx ref-staleness in effect cleanup

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `components/Toast.tsx` (+5 / -2)
**Status:** DONE

## Problem

`components/Toast.tsx:107` triggered the standard
`react-hooks/exhaustive-deps` ref-staleness warning:

> The ref value 'timers.current' will likely have changed by the time
> this effect cleanup function runs. Copy it into a variable inside the
> effect and use that in the cleanup function.

In practice this is benign for `Toast` (the ref is a plain object, not
a DOM node, and the component is mounted exactly once at the app root)
— but the warning is the right pattern lint to follow because anyone
copy-pasting this code into a different context could hit the real bug.

## Fix

Capture `timers.current` into a local `timersMap` at effect-run time,
then use that local in both the `setTimeout` registration site and the
cleanup `Object.values(timersMap).forEach(clearTimeout)`.

```ts
useEffect(() => {
  const timersMap = timers.current;
  const handler = (e: Event) => { ... timersMap[id] = setTimeout(...) };
  window.addEventListener('mashup:toast', handler);
  return () => {
    window.removeEventListener('mashup:toast', handler);
    Object.values(timersMap).forEach(clearTimeout);
  };
}, []);
```

## Verification

- `npx eslint components/Toast.tsx` → clean.
- `npx tsc --noEmit` → clean.
- Behavior unchanged: Toast still mounts a single window listener,
  registers per-toast dismiss timers in the same map, and clears all
  pending timers on unmount.

**Status:** DONE — ready for QA.
