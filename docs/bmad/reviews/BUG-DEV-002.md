# BUG-DEV-002 — calendar grids now use stable unique keys

**Status:** done
**Classification:** routine
**Severity:** high
**Why:** Four `.map()` sites in `components/MainContent.tsx` used the
loop index `i` as the React `key` prop on calendar cells and option
elements. When the array's content shifted (week/month nav, prompt
list re-order), React's reconciler matched DOM nodes by index instead
of by content — so cell-local state (drag-over highlight, hover
popover, selection ring, popover open/close) leaked across navigation.
Found during the V050-009 static-analysis pass.

## Sites fixed

| Line (pre-fix) | Surface | Old key | New key |
|----------------|---------|---------|---------|
| 1910 | `PREDEFINED_PROMPTS.map((p, i))` (Compare suggestions dropdown) | `key={i}` | `key={p}` (5 unique strings) |
| 2995 | `days.map((d, i))` (week-view header day cells, 7 cells) | `key={i}` | `key={toYMD(d)}` (YYYY-MM-DD) |
| 3027 | `days.map((d, i))` (week-view hour cells, 7×24 = 168 cells) | `key={i}` | `key={cellKey}` (already constructed at line 3020 as `${dateStr}:${hour}`) |
| 3246 | `cells.map((d, i))` (month-view grid, 35 cells) | `key={i}` | `key={dateStr}` (already constructed at line 3236 as `toYMD(d)`) |

## User-visible symptom (pre-fix)

1. User opens Calendar → Week view, hovers 6pm Monday — heatmap popover opens.
2. User clicks ▶ to navigate to next week.
3. The popover lingers on the new "Monday at 6pm" cell, even though
   the user never hovered there.
4. Same pattern for drag-over highlights, selection state, and any
   inline edit popover that's keyed off cell identity.

In Month view, the same pattern: clicking on a date cell, then
navigating months, leaves selection ring on whatever cell now occupies
the same grid index — which is a different date.

## Why the index keys looked harmless

Three of the four sites already had a stable identifier in scope:
- Line 3027 had `cellKey = `${dateStr}:${hour}`` (line 3020).
- Line 3246 had `dateStr = toYMD(d)` (line 3236).
- Line 2995 had access to `d`, with `toYMD` defined locally at line 536.

The bugs were just `key={i}` instead of `key={cellKey}` / `key={dateStr}` /
`key={toYMD(d)}` — a 1-character mistake at each site that the type
system can't catch (both `string` and `number` are valid React keys).

The PREDEFINED_PROMPTS site (line 1910) is a slightly different shape:
the array is constant, so the bug was theoretical — index-keying only
breaks when the array changes. Fix is still correct (`key={p}`) for
defense-in-depth and to match the codebase convention.

## Internal scope changes

For two of the cell loops the index parameter became unused after the
key swap, so I dropped it from the `.map()` callback:

- Line 1909: `PREDEFINED_PROMPTS.map((p, i))` → `PREDEFINED_PROMPTS.map((p))`.
- Line 3013: `days.map((d, i))` → `days.map((d))`.

The other two retain `i` because surrounding code uses it:
- Line 2991 keeps `(d, i)` because line 3000 uses `dayNames[i]` for the day-of-week label.
- Line 3235 keeps `(d, i)` because line 3253 uses `(i + 1) % 7 === 0` for the right-border tailwind class on the 7th column.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Stable unique keys on calendar grids | ✓ (all 4 sites) |
| No state leak on nav | ✓ (React reconciles by content, not index — 9-test regression suite pins the uniqueness contract) |
| Write inbox | ✓ (envelope below) |

## Files touched

### Production
- `components/MainContent.tsx`:
  - Line 1909-1911: PREDEFINED_PROMPTS option `key={i}` → `key={p}`, dropped `i` from callback.
  - Line 2991-3004: week header day `key={i}` → `key={toYMD(d)}`.
  - Line 3013-3027: week hour cells `key={i}` → `key={cellKey}`, dropped `i` from callback.
  - Line 3235-3246: month grid cells `key={i}` → `key={dateStr}`.

### Tests
- `tests/integration/calendar-key-uniqueness.test.ts` (NEW, 9 tests):
  - Week header day cells (3 tests): 7 unique per week, no overlap
    week-to-week, stable across re-renders for same week.
  - Week hour cells (2 tests): 168 unique per week-hour grid, no
    overlap when navigating to next week.
  - Month grid cells (3 tests): 35 unique per month, handles month
    boundary correctly, overlapping keys at month boundaries
    represent the same calendar day in both grids.
  - PREDEFINED_PROMPTS (1 test): all 5 strings are unique.

  Logic-mirror tests (same pattern as carousel-badge-derivation.test.ts):
  re-define `toYMD` and the `days`/`cells` array constructors locally
  to pin the key-derivation contract without rendering MainContent.

### Docs
- `docs/bmad/reviews/BUG-DEV-002.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run tests/integration/calendar-key-uniqueness.test.ts` —
  9/9 pass in isolation.
- `npx vitest run` — full suite green via pre-commit hook.

## Out of scope (follow-up)

- **Other `.map()` key audits.** I only addressed the four sites
  flagged by the V050-009 audit. A repo-wide grep for `key={i}`
  patterns is worth doing as a separate routine pass — different file
  scopes, different blast radii, and a tighter PR is easier to review
  than a sprawling key-correctness sweep.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-DEV-002","status":"done","summary":"Fixed all 4 calendar key={i} sites in components/MainContent.tsx (line 1910 PREDEFINED_PROMPTS → key={p}; line 2995 week header → key={toYMD(d)}; line 3027 week hour cells → key={cellKey}; line 3246 month cells → key={dateStr}). Three sites already had a stable identifier in scope; the bug was just a 1-char miss the type system can't catch. Pre-fix symptom: hover/drag/selection state leaked across week/month nav because React reconciled by index instead of content. Added 9 logic-mirror regression tests pinning key uniqueness across week/week-hour/month grids + PREDEFINED_PROMPTS. tsc clean, 444/444 pass."}
```
