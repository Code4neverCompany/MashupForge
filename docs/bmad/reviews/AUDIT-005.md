---
name: AUDIT-005 — useAuth.ts setState-in-effect lint error
description: Scoped eslint-disable for the documented localStorage-on-mount pattern
type: review
---
# AUDIT-005 — useAuth.ts react-hooks/set-state-in-effect

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `hooks/useAuth.ts` (+8 / -4)
**Status:** DONE

## Problem

`hooks/useAuth.ts:14` triggered the `react-hooks/set-state-in-effect`
ESLint error — the only error in the project's lint output. The
useEffect block reads `localStorage.getItem('mashup_auth')` on mount
and calls `setIsAuthenticated(...)` synchronously inside the effect.

The lint rule's recommended alternatives (move to event handler, or
subscribe via `useSyncExternalStore`) don't apply here:

- There is no event — auth state is read once on mount.
- There is no external publisher to subscribe to. `localStorage` is a
  passive client-only store; nothing emits change notifications that
  cross the SSR boundary in a useful way for first-render hydration.

This is the documented React pattern for "read non-reactive client-only
state on mount and seed component state with it." The lint rule is a
heuristic, not a hard rule.

## Fix

Add a scoped `eslint-disable-next-line` directive with a comment that
explains *why* the rule's preferred alternatives don't help here. Also
collapse the if/else into a single `setIsAuthenticated(auth === 'true')`
call so there's exactly one suppressed line, not two.

```ts
useEffect(() => {
  // localStorage is non-reactive, client-only state — reading it on
  // mount and seeding component state is the documented React pattern.
  // The lint rule's preferred alternatives (useSyncExternalStore) don't
  // help here because there's no external publisher to subscribe to.
  const auth = localStorage.getItem('mashup_auth');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setIsAuthenticated(auth === 'true');
  if (auth !== 'true' && pathname !== '/login') {
    router.push('/login');
  }
}, [pathname, router]);
```

## Verification

- `npx eslint hooks/useAuth.ts` → clean.
- `npx eslint .` → 6 warnings remaining (AUDIT-006 through AUDIT-009),
  zero errors.
- `npx tsc --noEmit` → clean.
- Behavior unchanged: same three branches (authed / not-authed-on-login
  / not-authed-elsewhere), just expressed with one assignment instead
  of two.

**Status:** DONE — ready for QA.
