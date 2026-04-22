# QA Review — DESIGN-001/002/003 Visual States

**Reviewer:** QA Agent  
**Date:** 2026-04-22  
**Commits reviewed:**
| Commit | Description |
|--------|-------------|
| `3d34c58` | DESIGN-001 — posted/failed image overlays + persistent error banner |
| `7038c51` | DESIGN-002 — drop duplicate gradient + trim action row to 3+kebab |
| `7ff54ca` | DESIGN-003 — migrate inline kebabs to reusable `<KebabMenu>` |

**Verdict: ✅ PASS** — all three commits are approved. 695/695 tests green, TypeScript clean, no functional regressions. Two cosmetic notes documented below; neither warrants a bug story.

---

## Test run

```
695 tests passed (58 test files)
TypeScript: exit 0 (npx tsc --noEmit)
PostReady integration tests: 12/12 passed
```

---

## DESIGN-001 — posted/failed overlays + persistent error banner

**Result: ✅ PASS**

### Visual overlays (z-index)

The tint divs (`absolute inset-0 bg-black/35 pointer-events-none` / `bg-red-950/30 pointer-events-none`) are rendered inside `AspectPreview`'s `relative overflow-hidden` container, after the `<LazyImg>`. With no explicit z-index, they sit above the image by DOM order — correct. The grouping checkbox label retains `z-10` — it renders above the tint. The aspect-ratio chip (rendered after `{overlay}` in `AspectPreview`, z-auto) also floats above the tint by DOM order. No stacking conflicts. ✅

### Error banner

`errorReason` is non-null whenever `kind === 'failed'` — the banner is persistent and not dismissable. The `status.startsWith('Error')` check correctly strips the `"Error: "` prefix before display. When `status` is absent or stale, the fallback `'Post failed — check platform credentials'` shows. ✅

### Duplicate status suppression

The inline transient status `{status && kind !== 'failed' && (...)}` correctly prevents the same error string from rendering twice. Transient status still shows for `scheduled` and `posted` cards. ✅

### Icon swap

`Check` → `CheckCircle2` for posted, `X` → `AlertCircle` for failed. Both icons are imported and used correctly. Semantic intent matches the spec ("done" / "act on this"). ✅

### Known limitation (acknowledged in commit)

`ScheduledPost.error` does not exist yet — when the transient `status` string expires, the banner shows the generic fallback rather than the specific platform error. This is documented in the commit message (DESIGN-001 §5) and requires a separate proposal for the types-shape change. Not a blocking issue.

---

## DESIGN-002 — duplicate gradient + action row trim

**Result: ✅ PASS**

### Duplicate gradient

Removed: `bg-gradient-to-t from-[#c5a062]/12 via-transparent to-[#00e6ff]/6` (warm-gold/cool-blue hover glow overlay). Remaining gradient: `bg-gradient-to-t from-black/85 via-black/15 to-transparent` at line 533 (legitimate bottom prompt overlay). Exactly one gradient in the card. ✅

### Gallery view — 3 primary + kebab

| # | Button | Icon | Condition |
|---|--------|------|-----------|
| 1 | Approve / Unapprove | BookmarkCheck | Always |
| 2 | Add to Collection | FolderPlus | Gallery only |
| 3 | Prepare for Post | Save / Loader2 | Gallery only |
| 4 | **KebabMenu** | MoreVertical | Always |

Gallery kebab items: Animate (if non-video), Auto-tag, Download, separator, Delete (with confirm). ✅

### Studio view — 3 primary + kebab (non-video)

| # | Button | Icon | Condition |
|---|--------|------|-----------|
| 1 | Re-roll | RefreshCw | Studio + !isVideo |
| 2 | Approve / Unapprove | BookmarkCheck | Always |
| 3 | Save to Gallery | Bookmark / BookmarkCheck | !Gallery |
| 4 | **KebabMenu** | MoreVertical | Always |

Studio kebab items: Animate, Prepare for Post, Download, separator, Delete (direct). ✅

**Note on studio videos:** With video (`img.isVideo = true`), the Reroll button is hidden and Animate is absent from the kebab — resulting in 2 primary + kebab. This is intentional (videos can't be rerolled or animated). Consistent with the previous behavior; no regression.

### Delete action difference across views

Gallery view delete passes `true` (shows confirmation dialog). Studio view delete passes `false` (direct delete). This matches the previous per-view behavior and is intentional — studio view is an in-flight workspace; gallery view guards against accidental permanent deletion.

---

## DESIGN-003 — KebabMenu refactor in PostReady

**Result: ✅ PASS**

### Deduplication

- `useRef`, `useEffect`, `createPortal`, `useState` (kebabOpen, menuPos), `MENU_WIDTH`, and the private `KebabItem` / `KebabItemProps` export — all removed from `PostReadyCard.tsx`. ✅
- `PostReadyCarouselCard.tsx` no longer cross-imports `KebabItem` from `./PostReadyCard` — it imports `KebabMenu, KebabMenuItem` from `../KebabMenu`. ✅
- No other consumers of `KebabItem` exist in the codebase. ✅

### Overflow / z-index

The old code used `createPortal` + `position: fixed; z-index: 9999` to escape stacking contexts. The new `KebabMenu` uses `absolute z-50` within a `relative inline-block` wrapper.

Risk: if any ancestor in PostReadyCard has `overflow: hidden`, the dropdown would be clipped. Verified: `PostReadyCard` root is `overflow-visible` (line 172). No clipping risk. ✅

### Conditional items

`onCancelSchedule && kind === 'scheduled'` → `out.push(...)` (array push conditional). `isExplicit` → ternary between Separate / Lock Group items. Both correctly translated from the old JSX-branch pattern. ✅

### Keyboard / ARIA

`KebabMenu` preserves `aria-haspopup="menu"`, `aria-expanded`, and `aria-label="More actions"` on the trigger. Adds `aria-controls` (conditionally when open — valid per ARIA 1.2). Close-on-activate returns focus to the trigger via `close(true)` — improvement over the old behavior which did not return focus. ✅

### Cosmetic note — copy-confirmation icon color

The old code rendered the "Copy caption + tags" confirmation with an explicit `text-emerald-400` on the Check icon: `<Check className="w-3.5 h-3.5 text-emerald-400" />`. The new code passes `icon: copyHighlighted ? Check : Copy` to KebabMenu, which renders all non-destructive icons in `text-zinc-400`. The icon still changes from Copy → Check (functional confirmation preserved), but the green color emphasis is lost.

This is a cosmetic-only regression. The `KebabMenu.KebabMenuItem` type would need an `iconClassName` override prop to support this. Appropriate as a future enhancement rather than a bug. No story filed; noted here for the record.

---

## Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| Visual overlays render on top of images without z-index conflicts | ✅ | DOM order + `pointer-events-none`; no stacking conflict |
| KebabMenu component reusable, no inline duplication | ✅ | Both PostReady files now use `<KebabMenu>`; private `KebabItem` deleted |
| Gallery action row: exactly 3 buttons + kebab | ✅ | Approve, Add to Collection, Prepare for Post + kebab |
| Error banner: persistent, not dismissable, shows on failed | ✅ | `errorReason` always non-null for `kind === 'failed'` |
| No regressions in gallery/post-ready functionality | ✅ | 695/695 tests, 12/12 PostReady integration tests |
| TypeScript: no `any` casts, types correct | ✅ | `tsc --noEmit` exits 0 |
| No missing imports / console errors | ✅ | All new imports (`AlertCircle`, `CheckCircle2`, `KebabMenu`, `KebabMenuItem`) present |
