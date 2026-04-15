# QA Review — STORY-110

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 5edb4e0

## Findings

- [INFO] Root cause correctly identified from STORY-080's MessageBox: launcher looked for `resource_dir/node/node.exe` (flat layout) but Tauri v2's glob bundler may preserve the `resources/` segment (`resource_dir/resources/node/node.exe`).
- [INFO] `find_resource_subdir(resource_dir, name)` checks both layouts in order and returns the first match. Works regardless of which layout Tauri v2 actually produces — the correct defensive approach.
- [INFO] `log_dir_tree(log_dir, root, label, max_depth)` on every boot is low cost (microseconds, few hundred entries at depth-2) and high value: next crash report will have an authoritative record of the actual bundle layout on disk.
- [INFO] Error messages updated to say "checked `/node` and `/resources/node`" — unambiguous for diagnosis.
- [INFO] `tauri.conf.json` resources field unchanged (`["resources/**/*"]`) — correct. The per-subdir explicit glob form hard-errors at `cargo check` when staging dirs don't exist locally. ✓
- [INFO] `cargo check --offline` clean. No new warnings.
- [INFO] `src-tauri/tauri.conf.json` not touched — stays within routine classification.

### Security
- [INFO] `log_dir_tree` writes paths to a local log file. No sensitive data (log contains filenames, not file contents). ✓

## Gate Decision

PASS — Defensive resolver is the correct shape of fix: works against both possible Tauri v2 glob layouts, leaves evidence in startup.log for permanent resolution, does not require guessing the correct layout. `cargo check` clean.
