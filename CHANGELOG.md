# Changelog

All notable changes to MashupForge are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.12] — 2026-04-29

QA-driven cleanup release: clears the MMX + calendar warnings (W1–W5)
surfaced in the v0.9.11 review and adds regression coverage for the
calendar UX fixes.

### Fixed
- **mmx-cli:** surface `PARSE` errors when the CLI exits 0 with empty
  stdout instead of swallowing them (QA-W1).
- **calendar:** remove the instant Delete button from the edit popover
  — the Cancel/Delete confirmation flow on the trash zone is the only
  destructive path now.
- **calendar:** Escape closes the trash-confirm modal (QA-W4).

### Docs
- **sunday-recap:** document the runner-local artifact paths the cron
  workflow writes to (QA-W2).
- **image-prompt:** document the `buildEnhancedPrompt` wiring follow-up
  for the MMX provider path (QA-W3).

### Tests
- **calendar:** regression tests pinning Fix 3 (trash zone behaviour),
  Fix 4 (chip thumbnails), and the QA-W4 Escape close (QA-W5).

### Not in this release
- Full MMX CLI integration (image / video / speech). The spec lives in
  `docs/bmad/briefs/mmx-cli-integration.md`; implementation is pending.
