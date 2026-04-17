# QA-004: Recent Commit Review

**Date:** 2026-04-17  
**Reviewer:** Developer  
**Commits:** 153d351, 9dccb59, c7775a7

---

## 153d351 — feat(a11y): active tab indicator (bold + bottom bar)

**Verdict: PASS**

### What the code actually does

```tsx
// Active tab
className="... font-bold"

// Bar (aria-hidden)
<span
  aria-hidden="true"
  className={`h-0.5 rounded-full transition-all duration-200 ${
    isActive ? 'w-5 bg-[#00e6ff]' : 'w-0 bg-transparent'
  }`}
/>
```

- `h-0.5` = **2px height** bar (commit message says "5px" — that's wrong; `h-0.5` in Tailwind = 2px)
- `w-5` = 20px width when active, animates from `w-0` on transition
- `font-bold` active vs `font-semibold` inactive

### Color-blind accessibility

Two non-color cues are present simultaneously:
1. **Shape:** the 2px bar appears/disappears — a structural presence/absence cue
2. **Weight:** bold vs semibold — a typographic cue

This satisfies WCAG 1.4.1 (Use of Color) — no information is conveyed by color alone. The blue tint is a *third* cue for sighted users; removing color perception still leaves bar + weight.

### ARIA correctness

- `role="tab"` + `aria-selected={isActive}` on each button — correct
- `aria-controls` wired to panel IDs — correct  
- `aria-hidden="true"` on decorative bar — correct; screen readers won't announce it
- `focus-visible:ring-2 focus-visible:ring-[#00e6ff]/50` — focus indicator present

### Minor issues

- **Doc mismatch:** commit message says "5px accent bar" — should be "2px" (`h-0.5`). Not a bug, just inaccurate description.
- **Bar width:** `w-5` (20px) is narrow relative to a ~100px button. Functional but subtle. Not a blocker.
- **SIDEBAR-A11Y.md** also says "5px wide" — same inaccuracy propagated into the review doc.

### Refactor quality

Collapsing three near-identical `<button>` blocks into `.map()` over an `as const` tuple is clean. TypeScript infers `id` as the `Tab` union literal so `setActiveTab(id)` is type-safe with no cast. No behavior change.

---

## 9dccb59 — fix: increment-version.sh bumps Cargo.toml

**Verdict: PASS**

### What changed

```bash
# Added:
sed -i "s/^version = \"$current\"/version = \"$new_version\"/" src-tauri/Cargo.toml

# And:
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
```

### Does it handle all 3 files correctly?

Yes. Confirmed by reading `src-tauri/Cargo.toml`:

```
line 3:  version = "0.1.5"           ← package version — matches ^version
line 9:  rust-version = "1.77.2"     ← does NOT match ^version
line 18: tauri-build = { version = "2.5.6" }  ← inline syntax, does NOT match ^version
line 22: serde = { version = "1.0" }          ← inline syntax, does NOT match ^version
line 24: tauri = { version = "2.10.3" }       ← inline syntax, does NOT match ^version
```

The `^version` anchor restricts the match to lines *starting* with `version`. All Cargo dependency versions use inline `{ version = "..." }` syntax, so they are immune. Only the `[package]` version is bumped. Safe.

The `package.json` grep is also safe — only one `"version"` key at the top level (line 3); no nested version keys in this project's format.

### Edge cases that don't apply here but worth noting

- A workspace Cargo.toml with multiple `[package]` sections at `^version` — would double-bump. Not applicable (single-crate project).
- A dependency that happens to have the exact same version string as the project — would be double-bumped if it used `^version` line syntax, which Cargo doesn't do for dependencies. Not a risk.

### Runbook update

RELEASE.md correctly updated to remove the manual "bump Cargo.toml" step. The CI version parity check in the workflow validates all three agree, so any future script regression will surface immediately on the next release tag push.

---

## c7775a7 — docs(bmad): SIDEBAR-A11Y review

**Verdict: PASS (minor inaccuracy)**

The review doc is accurate except for one detail: it states "5px wide `h-0.5` bar" — the `h-0.5` class in Tailwind is **2px**, and `w-5` (width) is **20px**. The description conflates height and width. Not a functional issue.

QA checklist items are testable and cover the important paths.

---

## Summary

| Commit | Description | Verdict | Notes |
|---|---|---|---|
| 153d351 | Active tab indicator | ✅ PASS | "5px" in message/doc should be "2px" (`h-0.5`) |
| 9dccb59 | increment-version.sh Cargo.toml | ✅ PASS | Sed pattern safe; parity check provides CI backstop |
| c7775a7 | SIDEBAR-A11Y review doc | ✅ PASS | Same "5px" inaccuracy propagated |

No blockers. One minor doc fix worth a follow-up: update the "5px" references in commit message (can't be changed) and `SIDEBAR-A11Y.md` to "2px height / 20px width".
