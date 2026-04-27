# Story: Auto-Update Settings — Backend & Integration

## Feature
Auto-update settings panel for MashupForge.

## Implementation Steps

### 1. Install Required Packages
In `src-tauri/Cargo.toml`, add:
```toml
[dependencies]
tauri-plugin-updater = "2"
tauri-plugin-store = "2"
```
In `package.json`, add:
```json
"@tauri-apps/plugin-updater": "^2",
"@tauri-apps/plugin-dialog": "^2"
```

### 2. Initialize Plugins in lib.rs
```rust
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_store::StoreExt;

fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().create())
        // ... existing plugins
        .setup(|app| {
            // Updater plugin is ready
            Ok(())
        })
        .run()
        .expect("error while running tauri application");
}
```

### 3. Add Updater Permissions
In `src-tauri/capabilities/default.json`, add to permissions array:
```json
"updater:allow-check",
"updater:allow-download",
"updater:allow-install",
"updater:allow-download-and-install"
```

### 4. Verify
After these changes, `npm run tauri build` should succeed and the updater JS API should be callable from the frontend.

## Acceptance Criteria
- [ ] `tauri-plugin-updater` and `tauri-plugin-store` installed in Cargo.toml
- [ ] Plugins registered in `lib.rs`
- [ ] All 4 updater permissions in `capabilities/default.json`
- [ ] `npm run tauri build` completes without errors
- [ ] No new TypeScript errors introduced

## Files
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- `package.json`
