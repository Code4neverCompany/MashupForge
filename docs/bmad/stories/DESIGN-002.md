# DESIGN-002 — Gallery: clean up image card overlay elements

**Status:** spec ready for Developer (revised — added brand-kit recap)
**Owner:** Designer (handoff to Developer for impl)
**Scope:** Visual hierarchy of `displayedImages.map(...)` card at `MainContent.tsx:4203-4531`. No business logic changes — same buttons, same handlers, restructured chrome.

---

## 0. Brand kit — applied here

| Token | Hex | Tailwind | Where it lives in this spec |
|---|---|---|---|
| Agency Black | `#050505` | `bg-zinc-950` (closest match for image bg) | Card base, hover-panel gradient base |
| Metallic Gold | `#C5A062` | `[#c5a062]` | Card border, model chip text + border, tag chip text + border, idle-state hover ring |
| Electric Blue | `#00E6FF` | `[#00e6ff]` | Reserved for active/interactive only — drag-target ring (existing), kebab-open state (new). NOT used for permanent decoration. |
| Success Emerald | `emerald-500/600` | tailwind | Approved inset ring (kept) |
| Failure Red | `red-500/600` | tailwind | Status overlay (kept), Delete button hover |

**Rules I'm following from `DESIGNER.md`:**
- Dark mode default — Agency Black backgrounds (kept; `bg-zinc-900/80 backdrop-blur-sm` is the existing convention and matches the brand)
- Gold for borders / accents / highlights → applied to model chip + card border + tag chips
- Electric Blue for active states → reserved for drag/kebab-open, NOT for the always-visible chrome (this is the key brand discipline that the cluttered current state violates — gold + blue both compete for attention in the idle gradient)
- AETHER SANS / NEXUS MONO fonts — already inherited from the global stylesheet; no font work needed in this card

---

## 1. Inventory: what a card shows today

| Layer | Element | Visibility | Position |
|---|---|---|---|
| z-0 | `LazyImg` background | always | full |
| z-0 | `ImageOff` fallback | always (revealed on error) | center |
| inset ring | Approved ring (`ring-emerald-500/60`) | when `img.approved` | image edge |
| z-6 | Hover gold/blue gradient | hover | full |
| z-10 | Approved badge pill | when `img.approved` | bottom-left |
| z-20 | Top action row — **7 icons** | hover | top-right |
| z-20 (sub) | Bottom info overlay (gradient + model + prompt + Download) | hover | bottom |
| z-30 | Batch-select checkbox (gallery) | always | top-left |
| z-40 | Generating / animating spinner overlay | when status | full |
| z-40 | Error overlay | when status === error | full |
| outside image | Tag pill row (`px-3 py-2 border-t`) | always (gallery + tags) | row below image |

**Buttons in the top row today:** Animate, Re-roll (studio), Approve, FolderPlus, Save, Save-for-Post, Trash — up to **7 simultaneously**.

---

## 2. What's wrong

1. **Hover-pile-on.** Gold/blue gradient + bottom black gradient + 7-button row + caption + Download all reveal in 300ms. The eye doesn't know where to land.
2. **Both corners loaded.** Top-left has the batch checkbox; top-right has 7 icons. Approved badge is bottom-left; bottom-right is empty. Visual weight is unbalanced and corners read as cluttered.
3. **Model badge is hidden.** It only appears on hover inside the bottom overlay. For a gallery whose whole purpose is comparing models, this is the wrong default.
4. **Tag row breaks the grid.** Each card grows vertically based on tag count → ragged grid baseline. Cards stop reading as "image tiles" and start reading as "image + chrome cards."
5. **FolderPlus popover.** Hover-within-hover dropdown that's hard to discover and hard to dismiss on touch.

---

## 3. Hierarchy redesign

### Primary — always visible (read in <300ms without hover)

1. **The image.** Period. No permanent gradient, no permanent badge over it.
2. **Approved indicator** — kept as the inset emerald ring (already great, don't change). Drop the bottom-left "Approved" pill — it duplicates the ring.
3. **Model chip** — promote from hover-only → always visible. Bottom-left, single small pill:
   - `absolute bottom-2 left-2 z-10`
   - `px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide`
   - `bg-black/55 backdrop-blur-md text-[#c5a062] border border-[#c5a062]/30 rounded-full`
   - Truncate to single line, max 80px width
4. **Status overlays** (generating / animating / error) — keep as-is. They already work well.

### Secondary — on hover (the "what is this" layer)

5. **Bottom info panel** — keep gradient, but slim it down:
   - Drop the model badge (now permanent in primary layer)
   - Keep the 2-line clamped prompt
   - Drop the inline Download button — moves into the action menu (see below). Gallery cards are clickable to open the detail modal where Download lives properly.
6. **Tags** — move INTO the bottom hover panel as a single-row, max-3-chip, no-wrap strip with `+N` overflow. Removes the separate `border-t` row and restores grid baseline.
   - `flex gap-1 overflow-hidden` so chips truncate cleanly
   - Same chip styling as today (`bg-[#c5a062]/10 text-[#c5a062]/80 border-[#c5a062]/20`)

### Tertiary — actions (the "what can I do" layer)

7. **Compress the 7-icon row → 3 + kebab.**
   - Always-shown-on-hover (top-right): the **3 most common actions for the current view**:
     - **Studio:** Approve, Save-to-Gallery, Re-roll
     - **Gallery:** Approve, Save-for-Post, Add-to-Collection (FolderPlus)
   - **Kebab menu** (`MoreVertical`) reveals: Animate, Download, Delete, and the FolderPlus popover content (when in studio).
   - Kebab pattern: click opens a small dropdown anchored to the icon — replaces the hover-within-hover Collection popover, fixes touch usability.
8. **Batch checkbox** stays top-left in gallery. To balance the corners, swap from top-left → top-right corner ONLY when no actions are showing (idle), and slide actions to a secondary row when batch-selecting. Simplest implementation: keep checkbox where it is, but drop its z-30 → z-10 so the action row visually wins on hover. Approved ring already provides the visual anchor for the corner.

---

## 4. Z-index ladder (final)

```
z-0   image / fallback
z-5   permanent model chip (bottom-left)
z-10  batch checkbox (top-left)
z-15  hover gradient (gold/blue) — single, dropped from two
z-20  hover bottom info panel (prompt + tags)
z-25  hover action row (3 icons + kebab)
z-30  kebab dropdown (when open)
z-40  status overlays (generating / animating / error)
```

Two fewer layers than today (collapsed approved-pill into the ring; collapsed two hover gradients into one).

---

## 5. Visual sketch (desired hover state)

```
┌───────────────────────────────────────┐
│ ☐                       [✓][🔖][📁][⋮]│ ← top-right action row (3 + kebab)
│                                       │
│                                       │
│              [ image ]                │ ← still dominates
│                                       │
│                                       │
│ ╭─────────────────────────────────╮   │ ← bottom hover panel
│ │ Iron Man as a Warhammer 40k    │   │   (gradient, slim)
│ │ Space Marine in cinematic...   │   │
│ │ #ironman #w40k +3              │   │
│ ╰─────────────────────────────────╯   │
│ [NANO BANANA 2]                       │ ← permanent model chip
└───────────────────────────────────────┘
```

Idle state strips everything except the image, the inset approved ring (when set), the batch checkbox, and the model chip.

---

## 6. Tailwind references

```tsx
/* Permanent model chip — always visible */
{img.modelInfo?.modelName && (
  <span className="absolute bottom-2 left-2 z-[5] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase bg-black/55 backdrop-blur-md text-[#c5a062] border border-[#c5a062]/30 rounded-full max-w-[80px] truncate pointer-events-none">
    {img.modelInfo.modelName}
  </span>
)}

/* Single hover gradient (replaces the two existing ones) */
<div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[15] bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

/* Compact action row — 3 + kebab */
<div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-25">
  {/* primary 3 (view-dependent) */}
  {/* kebab MoreVertical → dropdown for Animate / Download / Delete / Collection */}
</div>

/* Bottom hover panel — prompt + inline tags */
<div className="absolute inset-x-0 bottom-0 p-3 pt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
  <p className="text-xs text-zinc-200 line-clamp-2 mb-1.5 leading-snug pointer-events-auto">{img.prompt}</p>
  {img.tags && img.tags.length > 0 && (
    <div className="flex gap-1 overflow-hidden">
      {img.tags.slice(0, 3).map(t => (
        <span key={t} className="shrink-0 px-1.5 py-0.5 text-[9px] bg-[#c5a062]/15 text-[#c5a062]/85 border border-[#c5a062]/25 rounded-full whitespace-nowrap">{t}</span>
      ))}
      {img.tags.length > 3 && (
        <span className="shrink-0 px-1.5 py-0.5 text-[9px] text-zinc-400 whitespace-nowrap">+{img.tags.length - 3}</span>
      )}
    </div>
  )}
</div>
```

---

## 7. What to remove

Lines to delete from `MainContent.tsx`:

- **L4329-L4330** — gold/blue hover gradient (replaced by single black gradient inside bottom panel layer)
- **L4332-L4345** — bottom-left "Approved" pill (the inset ring already conveys this; pill is redundant chrome)
- **L4477-L4503** — bottom hover overlay (rebuilt slimmer per §6)
- **L4513-L4530** — separate tag row outside the image (tags move into hover panel)
- **L4352-L4361** (Animate button), **L4444-L4467** (Save-for-post in studio), **L4468-L4474** (Trash) — these become menu items inside the kebab dropdown rather than first-class buttons

Lines to add:
- Permanent model chip (per §6)
- Kebab menu component (`<MoreVertical />` lucide-react icon already in the import set if not, add it)

---

## 8. Acceptance checklist

- [ ] Idle card shows ONLY: image, approved ring (when set), batch checkbox (gallery), model chip
- [ ] Hover reveals: action row (3 icons + kebab), single bottom panel with prompt + max-3 tag chips
- [ ] No more separate `border-t` tag row breaking grid baseline
- [ ] Approved bottom-left pill is gone (ring is sufficient)
- [ ] Top action row has at most 4 elements (3 + kebab)
- [ ] Model name visible without hover
- [ ] Cards in the same row have identical heights
- [ ] All deleted handlers preserved — they're now reachable via the kebab dropdown

---

## 9. Open questions for Hermes/Maurice

1. Touch behaviour: is a long-press → kebab open acceptable, or do we want a permanent kebab on touch viewports?
2. Should the model chip respect Studio view too, or stay gallery-only? (I'd argue both — Studio benefits even more from knowing which model produced the variant.)
3. Approved ring at `ring-2 ring-emerald-500/60` is currently `ring-inset` — okay to keep, or should it pulse/glow on hover for stronger feedback? (Out of scope for this task; flagging.)

---

## 10. Routing note

This task is classified routine, but the kebab-menu introduction is a **new shared component** (`<CardActionMenu>`). Building it once and reusing across studio + gallery + (potentially) Post Ready cards is the right call — but creating a new component crosses into "complex" territory per CLAUDE.md routing. Recommendation: ship the simpler restructure (model chip promotion + tag-row removal + action-row trim to 3+overflow) as routine, and propose the kebab dropdown as a follow-up.
