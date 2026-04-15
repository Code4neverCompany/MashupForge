---
name: STORY-110-FOLLOWUP
type: question
from: developer
to: maurice
date: 2026-04-15
status: blocked-on-maurice
---

# STORY-110 follow-up — need evidence from the installed .msi

## TL;DR

I can't ship another fix responsibly until I see what the installed build
actually reports, because **the MSI I inspected already contains
`node.exe` at the exact path STORY-110's resolver checks**. Either the
build you tested is pre-STORY-110, or there's a runtime condition the
code can't see from this side.

## What I verified on the CI artifact

Downloaded the MSI from the successful CI run for commit `5edb4e0`
(STORY-110) and extracted its internal tables with `msiinfo`.

**File table** — `node.exe` is present:
```
node.exe  80511640 bytes  v22.11.0.0
start.js  (next standalone entry)
server.js (next standalone server)
```

**Directory table** — the `node` folder is a child of `resources`,
which is a child of `INSTALLDIR`:
```
INSTALLDIR                              → C:\Program Files\MashupForge
  Icc2310b9f64a40feb2bd0d52fc4f889b     → INSTALLDIR\resources
    Ia59be0c8cd04483fa5e2f8d72078361b   → resources\node
    I5f7f30efbfb74ee28281dbf2ff6ea27f   → resources\app
```

So after install, `node.exe` should be at:
```
C:\Program Files\MashupForge\resources\node\node.exe
```

STORY-110's `find_resource_subdir` (src-tauri/src/lib.rs:49) tries:
1. `C:\Program Files\MashupForge\node\node.exe` (flat)
2. `C:\Program Files\MashupForge\resources\node\node.exe` (nested)

Branch 2 should hit. If it doesn't, I need to know why.

## What I need from you

Three things, in order of cheapness:

### 1. Confirm which .msi you tested

The STORY-110 fix is commit `5edb4e0`. The CI run that built the
corresponding .msi is the one that finished ~07:06 UTC today
(2026-04-15). If the .msi on your desktop predates that, the old
flat-layout code is still running — it would print the exact
original error text and my fix never loaded.

**Ask:** right-click `MashupForge_0.1.0_x64_en-US.msi` →
Properties → Details tab → check "Date modified". Anything before
~09:06 Amsterdam time today is the pre-fix build.

### 2. Paste the exact MessageBox text

The pre-STORY-110 message was literally:
> `bundled Node.js missing at C:\Program Files\MashupForge\node\node.exe`

The **STORY-110** message is different — it reads:
> `bundled Node.js dir not found under C:\Program Files\MashupForge
> (checked /node and /resources/node) — installer is missing
> resources, rerun build-windows.ps1`

If your dialog still says the **first** version verbatim, you're
running the old build. If it says the **second** version, the new
build is running and we have a real layout problem to investigate.

### 3. Paste `startup.log`

Location:
```
%APPDATA%\com.4nevercompany.mashupforge\logs\startup.log
```

STORY-110 added `log_dir_tree` (lib.rs:78), which dumps the entire
`resource_dir` tree to this file on every boot. That dump will tell
us definitively whether the installer put files under `\node\` or
`\resources\node\` or somewhere else entirely.

The relevant section starts with `---- resource_dir tree (...) ----`
and ends with `---- end tree ----`.

## What I am NOT going to do

- Ship another tauri.conf.json change blind. I already tried the map
  form and explicit per-subdir globs (see `docs/bmad/reviews/STORY-110.md`
  §Fix); both hard-error at `cargo check` locally because the staging
  dirs are gitignored on WSL. The single `"resources/**/*"` glob is
  the only form that survives local compilation, and the MSI it
  produces demonstrably contains `node.exe` at the right path.
- Re-lift this to PROP-00X. STORY-110 is already shipped. The
  classification is "awaiting evidence", not "new proposal".

## What happens after you reply

- **Case A — old .msi was tested:** rerun installer with the
  STORY-110 build, retest. Expected outcome: it boots, we grab the
  tree dump, STORY-110 closes, STORY-100/101 unblock.
- **Case B — STORY-110 .msi was tested and the tree dump shows files
  at `\resources\node\`:** there is a bug in `find_resource_subdir`
  or in how Rust's `exists()` handles the path. Next fix would add
  literal `exists() = true/false` lines to `startup.log` for every
  probe so we can see which check failed.
- **Case C — tree dump shows files at some third layout:** update
  `find_resource_subdir` to include that path and reship.

## Agent state

- `status: idle_waiting_on_maurice`
- `current_task: STORY-110-FOLLOWUP`
- `note: Will not self-dispatch further .msi fixes until evidence from
  installed build arrives. Queue remains saturated with duplicate
  reports of the same symptom.`
