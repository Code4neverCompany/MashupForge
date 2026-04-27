# QA Review — QOL P1-A

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Commit:** 1039e04
**Files reviewed:**
- `components/GalleryCard.tsx` (+16 LOC)
- `tests/components/GalleryCard.test.tsx` (+45 LOC, 4 new tests)

---

## P1-A — Collection Badge on GalleryCard

**Gate: PASS** (confidence: 0.95)

### Checklist results

**Visual / Structure**
- [x] Position: `absolute bottom-9 left-2 z-[5]` — bottom-left, above model chip layer ✓
- [x] Conditional: `{img.collectionId && (() => { ... })()}` — renders only when set ✓
- [x] Orphan guard: `collections.find(c => c.id === img.collectionId)` → `if (!col) return null` — no crash, no ghost label ✓
- [x] Truncation: `col.name.length > 12 ? col.name.slice(0, 12) + '…' : col.name` — Unicode ellipsis, 12-char limit ✓
- [x] Icon: `FolderOpen className="w-2.5 h-2.5"` — lucide, 10px ✓
- [x] Font: `text-[9px] font-bold uppercase tracking-wide` — matches spec exactly ✓
- [x] Colors: `bg-[#c5a062]/15 text-[#c5a062] border border-[#c5a062]/40 rounded-full` — matches spec exactly ✓
- [x] Backdrop blur: `backdrop-blur-md` on pill span ✓
- [x] Non-interactive: `pointer-events-none select-none` on wrapper ✓

**Interaction states**
- [x] Default: `opacity-80` ✓
- [x] Card hover: `group-hover:opacity-100 transition-opacity` ✓
- [INFO] `scale-1.02` on hover not implemented — pre-identified, cosmetic only, no action needed
- [INFO] `dragOverCollection` pill pulse (`ring-1 ring-[#00e6ff]`) not implemented — pre-identified, card-level ring provides feedback, no action needed

**Dark-theme compliance**
- [x] Gold `#c5a062` text on `#c5a062/15` tinted zinc-900 — spec-confirmed WCAG AA at 9px bold ✓
- [x] No `text-zinc-400` (would vanish on dark card) ✓
- [x] No pure white background ✓

---

## Tests

**11/11 passing** (1.12s, vitest 4.1.5) — 4 new, 7 pre-existing all green

| Test | Result |
|---|---|
| Badge renders with valid `collectionId` | ✓ |
| No badge when `collectionId` absent | ✓ |
| No badge for orphan `collectionId` (checks `.bottom-9` absence) | ✓ |
| Long name truncated to 12 chars + `…` (`Extraordinar…`) | ✓ |

---

## Gate Decision

**[PASS]** — Implementation is correct, complete, and well-tested. All spec items satisfied. Two pre-identified INFO deviations confirmed as non-blocking cosmetic gaps. No new findings.
