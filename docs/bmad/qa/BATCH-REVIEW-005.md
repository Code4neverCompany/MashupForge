# BATCH-REVIEW-005: Recent Commits QA

**Date:** 2026-04-17  
**Reviewer:** Developer  
**Commits:** cf59fc4, b1f3722, 153d351, 9dccb59, c7775a7, 62d3941, 3a48d9a

> 153d351, 9dccb59, c7775a7 were fully reviewed in QA-004 (RECENT-REVIEW-004.md). Verdicts repeated below; detail is in that file.

---

## cf59fc4 — feat(ui): scroll-wheel zoom in ImageDetailModal

**Verdict: PASS**

### Implementation correctness

```tsx
const handler = (e: WheelEvent) => {
  e.preventDefault();
  const rect = el.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  setOrigin(`${x}% ${y}%`);
  setZoom((prev) => Math.min(5, Math.max(1, prev + (e.deltaY > 0 ? -0.25 : 0.25))));
};
el.addEventListener('wheel', handler, { passive: false });
```

- **Cursor-position transform-origin:** `(clientX - rect.left) / rect.width * 100` maps mouse to `%` of container — correct. Zoom stays anchored to the cursor. ✅
- **Direction:** `deltaY > 0` = scroll down = zoom out (−0.25). Standard browser convention. ✅
- **Clamp:** `Math.min(5, Math.max(1, ...))` — range 1×–5×. ✅
- **`passive: false`:** required for `e.preventDefault()` to suppress page scroll. ✅
- **Cleanup:** `return () => el.removeEventListener(...)`. ✅
- **Reset on image change:** `useEffect(() => { setZoom(1); setOrigin('50% 50%'); }, [image.id])`. ✅
- **Double-click reset:** `onDoubleClick={() => { setZoom(1); setOrigin('50% 50%'); }}`. ✅

### Transition behaviour

```tsx
transition: zoom === 1 ? 'transform 0.2s ease' : 'transform 0.08s ease-out',
```

At render time, `zoom === 1` is true only after a reset, so the slow (0.2s) easing applies to the return snap — fast (0.08s) during live zooming. Correct.

### Badge

`zoom > 1.01` threshold for the gold badge avoids floating-point false positives at nominal 1.0. ✅

### No issues found.

---

## b1f3722 — docs(bmad): IMAGE-ZOOM review

**Verdict: PASS**

Documentation only. Accurately describes the zoom implementation.

---

## 153d351 — feat(a11y): sidebar active tab indicator

**Verdict: PASS** (minor: "5px" in commit/doc should be "2px" — `h-0.5` = 2px height)

See RECENT-REVIEW-004.md for full analysis.

---

## 9dccb59 — fix: increment-version.sh bumps Cargo.toml

**Verdict: PASS**

`^version` sed anchor safe for this Cargo.toml layout. See RECENT-REVIEW-004.md.

---

## c7775a7 — docs(bmad): SIDEBAR-A11Y review

**Verdict: PASS** (propagates the "5px" doc inaccuracy from 153d351)

---

## 62d3941 — ci: port Build & Release to ubuntu-latest

**Verdict: PASS WITH ISSUES**

### Does build-portable.sh work on ubuntu-latest without Rust?

**Yes.** The script:
1. Runs `npm run build` (Next.js) — no Rust
2. Copies `.next/standalone` — no Rust
3. Cross-installs Windows native npm bindings via `--os=win32 --cpu=x64` — no Rust
4. Downloads `node-v22.11.0-win-x64.zip` via `wget` — no Rust
5. Creates `start.bat` launcher — no Rust
6. Zips with `zip` — no Rust

No Rust toolchain is required at any point. The script is correctly designed for cross-building a portable Next.js app from Linux. ✅

### Issues found

**Issue 1 (MEDIUM): ZIP uploaded unconditionally, created conditionally**

`build-portable.sh` step 6:
```bash
if command -v zip > /dev/null 2>&1; then
  zip -rq MashupForge-portable.zip MashupForge/
fi
```

ZIP is only created if `zip` is available. The workflow then uploads it without checking existence:
```bash
gh release upload "$TAG" "$ZIP" --clobber
```

On `ubuntu-latest`, `zip` is in the base image so this passes today. But there is no explicit `apt-get install zip`, no existence check, and no failure message if the file is absent. A future runner image change could silently drop the ZIP asset without failing the job.

**Fix:** Add `zip` to the `apt-get install` line, or add `[ -f "$ZIP" ] || { echo "::error::ZIP not found"; exit 1; }` before the upload.

**Issue 2 (LOW): `gh release create ... || true` swallows real errors**

```bash
gh release create "$TAG" ... 2>/dev/null || true
```

If the release already exists this is correct (expected non-zero exit). But if `GITHUB_TOKEN` is missing or has wrong scope, the error is also silently swallowed and the subsequent `gh release upload` will fail with a less informative message.

**Fix:** Check if the release exists first (as the old workflow did), or at minimum remove `2>/dev/null` so errors surface in the log.

**Issue 3 (INFORMATIONAL): Architectural pivot, not a CI fix**

The commit message frames this as a CI fix ("Windows runner quota exhausted"). In reality, this permanently drops the Tauri build in favour of a portable Next.js server approach:

- **Old output:** Native Tauri desktop app — no browser dependency, WebView2 embedded, `.exe` via Rust/MSVC
- **New output:** Localhost web server with bundled Node.js — requires user's default browser

This is a meaningful product change. Additionally, CI-REVIEW-001 determined the actual root cause of the 5 failures was the `--asset-name` flag (fixed in 73fa8e7), not quota exhaustion. The ubuntu port may have been an over-correction — the fixed windows workflow (`73fa8e7`) was likely sufficient.

This doesn't block the current approach — the portable build is a valid product — but the rationale in the commit message is incorrect and the decision to abandon Tauri was not explicitly documented.

---

## 3a48d9a — style(brand): PortConflictBanner gold tokens

**Verdict: PASS**

Clean swap of `amber-500/400/300` → `#c5a062` (brand gold). `rounded-lg` → `rounded-xl` matches card rounding elsewhere. The icon and heading now share the same hex token; previously they used different amber shades — this is more consistent. No functional impact.

---

## Summary

| Commit | Description | Verdict |
|---|---|---|
| cf59fc4 | Scroll-wheel zoom | ✅ PASS |
| b1f3722 | IMAGE-ZOOM review doc | ✅ PASS |
| 153d351 | Sidebar active tab indicator | ✅ PASS (minor doc) |
| 9dccb59 | increment-version.sh Cargo.toml | ✅ PASS |
| c7775a7 | SIDEBAR-A11Y review doc | ✅ PASS (minor doc) |
| 62d3941 | CI port to ubuntu-latest | ⚠️ PASS WITH ISSUES |
| 3a48d9a | PortConflictBanner brand colors | ✅ PASS |

### Action items from 62d3941

1. Add `zip` to the `apt-get install` line in the workflow (or add a `[ -f "$ZIP" ]` guard before upload)
2. Replace `|| true` on `gh release create` with an explicit existence check
3. Document the Tauri → portable-Node architectural decision in a BMAD proposal or ADR — it's a product change that deserves a record
