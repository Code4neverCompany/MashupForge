# Brief: MashupForge Auto-Update Settings

## Problem
MashupForge has the Tauri updater plugin configured and `.sig` files generated on GitHub Releases, but users have no UI to control update behavior. The current `dialog: false` setting means updates are completely silent/uncontrolled.

## Goal
Add a Settings UI panel for auto-update controls with 4 settings:
1. **Auto-check on startup** — call `check()` when app launches
2. **Auto-download** — auto-download after successful check
3. **Auto-install** — auto-install after download (default: off, let user confirm)
4. **Windows install mode** — passive (default) | basicUi | quiet

Plus a **"Check Now"** button for manual update checks.

## Current State
- `plugins.updater` configured in `src-tauri/tauri.conf.json` with pubkey + endpoints
- `createUpdaterArtifacts: true` in build config
- No updater permissions in `src-tauri/capabilities/default.json`
- `@tauri-apps/plugin-updater` JS bindings needed
- `@tauri-apps/plugin-store` needed for settings persistence
- Dark theme design system already exists

## Tech Stack
- Tauri v2, Next.js frontend, TypeScript
- Tailwind CSS (dark theme)
- `@tauri-apps/plugin-updater` for update API
- `@tauri-apps/plugin-store` for persisting user preferences

## Files to Touch
- `src-tauri/src/lib.rs` — init updater plugin
- `src-tauri/capabilities/default.json` — add updater permissions
- `src/components/Settings/` — new `AutoUpdateSettings.tsx` component
- `src/store/` — settings persistence hook
- `src/app/settings/page.tsx` — add to settings page
- `package.json` — add `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-dialog`

## Research
Saved at: `~/.hermes/knowledge/mashupforge-auto-update-feature---tauri-implementation-research.md`
NotebookLM research notebook: `1d48ae2e-0c94-44d6-8ec7-faa16334836d`
