---
name: AUDIT-006 — Remove unused eslint-disable directives
description: Two stale suppressions that ESLint itself flagged as no-ops
type: review
---
# AUDIT-006 — Remove unused eslint-disable directives

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `components/MainContent.tsx`, `components/Toast.tsx` (-2 lines each)
**Status:** DONE

## Problem

ESLint reported two "Unused eslint-disable directive (no problems were
reported from ...)" warnings:

- `components/MainContent.tsx:2594` — disabling `no-await-in-loop` for a
  call that ESLint isn't actually flagging. The `no-await-in-loop` rule
  isn't in our enabled rule set, so the directive is suppressing nothing.
- `components/Toast.tsx:109` — disabling `react-hooks/exhaustive-deps`
  for an effect whose `[]` dep array doesn't actually trigger the rule.
  Likely left over from an earlier version that referenced state.

## Fix

Delete both directives. The surrounding comments that explained *why*
the suppression existed are kept where they're still relevant (the
sequential-await comment in MainContent is preserved as a "why" note
even though it no longer suppresses a rule).

## Verification

- `npx eslint components/Toast.tsx components/MainContent.tsx` → unused
  directive warnings gone. Remaining warnings (lines 969, 1024 in
  MainContent; line 107 in Toast) are pre-existing and tracked under
  AUDIT-007 / AUDIT-008.
- `npx tsc --noEmit` → clean.

**Status:** DONE — ready for QA.
