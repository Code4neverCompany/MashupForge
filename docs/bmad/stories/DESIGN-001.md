# DESIGN-001 — Post Ready: posted & failed visual states

**Status:** spec ready for Developer
**Owner:** Designer (handoff to Developer for impl)
**Scope:** Visual states only — no logic changes. Card already receives a derived `badge` (see `MainContent.tsx:3749-3755`) and a per-card `error` reason via `scheduled` records / `postStatus`.

---

## 1. Brand kit recap

| Token | Hex | Usage in this spec |
|---|---|---|
| Agency Black | `#050505` | Card base layer, overlay tint |
| Metallic Gold | `#C5A062` | Default card border (untouched) |
| Electric Blue | `#00E6FF` | Reserved — not used for status states |
| Success Emerald | Tailwind `emerald-500/600` | Posted state (already in calendar at `MainContent.tsx:456`) |
| Failure Red | Tailwind `red-500/600` | Failed state (already in calendar at `MainContent.tsx:457`) |

Both emerald/red tokens are already established in the calendar legend, so we're staying consistent across views.

---

## 2. Posted state

### Goals
- Card reads as "done" at a glance — user shouldn't try to re-post it
- Still legible: caption + image visible, just visually demoted
- Persists across reloads (driven by `scheduled.status === 'posted'`)

### Visual rules
- **Image overlay:** absolutely-positioned div over the image area only:
  - `bg-black/35` (subtle gray-black tint, 35% opacity over Agency Black)
  - Pointer-events: none — image still clickable to zoom
- **Card border:** swap from `border-[#c5a062]/20` → `border-emerald-500/40`. Keeps the gold motif inverted toward success without competing with it.
- **Hover:** lift border to `border-emerald-500/60` (mirrors existing gold hover pattern)
- **Status badge** (top-left, replaces existing "Ready" pill):
  - `bg-emerald-600/95 border border-emerald-400/60 text-emerald-50`
  - Icon: `<CheckCircle2 className="w-3.5 h-3.5" />` — a filled circle reads more "done" than the bare `Check` we use today
  - Label: `Posted ✓` (the literal `✓` already appears in the inline status string at `MainContent.tsx:375`, so the visual language is consistent)
  - Tooltip: `Posted to {platforms} · {time}` (e.g. "Posted to instagram, twitter · Apr 18 14:32")
- **Right-column action bar:**
  - Replace `Post Now` / `Schedule` buttons with a single disabled-look pill: `View on platform ↗` (links to whichever platform succeeded; if multiple, opens a small popover listing each)
  - Keep the `Unready` button — user may still want to remove the card from this view
- **Caption / hashtags:** unchanged (text stays full opacity for readability)

### Tailwind sketch (overlay + badge only — drop into the existing image div at `MainContent.tsx:3762-3800`)

```tsx
{badge.text === 'Posted' && (
  <div className="absolute inset-0 bg-black/35 pointer-events-none" />
)}
<span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600/95 border border-emerald-400/60 text-[10px] font-medium text-emerald-50 rounded-full">
  <CheckCircle2 className="w-3.5 h-3.5" /> Posted ✓
</span>
```

---

## 3. Failed state

### Goals
- Failure is loud but not panic-inducing — user needs to act, not freak out
- Reason text is **always visible** without hover (failures matter)
- Retry path is one click away

### Visual rules
- **Image overlay:** `bg-red-950/30` — barely-there red wash so the image still reads. We do NOT gray it out (user may want to see the image to decide whether to retry vs. unready).
- **Card border:** swap from `border-[#c5a062]/20` → `border-red-500/50`. Hover bumps to `border-red-500/70`.
- **Status badge** (top-left, replaces "Ready" pill):
  - `bg-red-600/95 border border-red-400/60 text-red-50`
  - Icon: `<AlertCircle className="w-3.5 h-3.5" />`
  - Label: `Failed`
- **Error reason banner** — NEW element, sits at the very top of the right column (above Caption section), full-width within the column:
  - Background: `bg-red-950/40 border-l-2 border-red-500`
  - Padding: `px-3 py-2`
  - Icon: `<AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />`
  - Text: `text-[11px] text-red-200 leading-snug`
  - Content: the failure reason. Source priority:
    1. `scheduled.error` if we add it to `ScheduledPost` (recommended — see §5)
    2. Fall back to `postStatus[img.id]` if it starts with `Error:` (already populated at `MainContent.tsx:380`)
    3. Final fallback: `Post failed — check platform credentials`
- **Action bar:**
  - Primary action: `Retry` — same styling as today's `Post Now`, but with `<RotateCw />` icon. Re-runs `postImageNow` with the last-used platform set.
  - Secondary: `Reschedule` (kept as-is)
  - Tertiary: `Dismiss` — flips status back to neutral so the badge becomes "Ready" again (clears `postStatus` + the failed `ScheduledPost` record)

### Tailwind sketch (banner sits inside the right column, between line 3803 and 3805)

```tsx
{badge.text === 'Failed' && errorReason && (
  <div className="flex gap-2 px-3 py-2 bg-red-950/40 border-l-2 border-red-500">
    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
    <p className="text-[11px] text-red-200 leading-snug">{errorReason}</p>
  </div>
)}
```

---

## 4. Carousel card variants

The carousel card (`MainContent.tsx:3515-3735`) does not currently derive a `badge` from a backing `ScheduledPost`. To stay consistent:
- Apply the **same overlay + border treatment** to the horizontal image strip when ALL images in the carousel are posted.
- Apply the **same error banner** above the "Shared caption" block when ANY image in the carousel failed.
- Use the existing `key = carousel-${item.id}` namespace for `postStatus[]` lookups.

This is a follow-up — primary scope is single-image cards.

---

## 5. Required type addition (Developer hand-off)

Persistent failure reason needs a place to live across reloads. Recommended:

```ts
// types/mashup.ts — extend ScheduledPost
export interface ScheduledPost {
  // ...existing fields
  /**
   * Human-readable failure reason populated by the auto-poster when
   * status flips to 'failed'. Renders as the inline error banner on
   * the Post Ready card so the user sees *why* without digging into
   * logs. Cleared when the user dismisses or retries successfully.
   */
  error?: string;
}
```

This is a **types shape change** = complex per CLAUDE.md routing — flagging for Hermes proposal queue rather than self-assigning.

---

## 6. Acceptance checklist

- [ ] Posted cards show emerald badge + black/35 image overlay + emerald/40 border
- [ ] Failed cards show red badge + red-950/30 image wash + red/50 border + always-visible reason banner
- [ ] Posted cards swap action bar to `View on platform ↗`
- [ ] Failed cards expose `Retry`, `Reschedule`, `Dismiss`
- [ ] Hover state mirrors the existing gold-hover pattern (intensity bump only)
- [ ] All colors trace to either the brand kit or the already-established calendar palette at `MainContent.tsx:455-460`
- [ ] No Electric Blue used in either state (reserved for active/interactive)

---

## 7. Open questions for Hermes/Maurice

1. Should `Posted` be terminal? (i.e. hide Reschedule entirely, or leave it for "post again at a later date")
2. For carousels with mixed posted/failed children, do we surface "3/5 posted" instead of the binary states?
3. `error` field on `ScheduledPost` is a schema change — okay to propose to Hermes, or do you want me to keep the reason in client-only `postStatus` (loses on reload)?
