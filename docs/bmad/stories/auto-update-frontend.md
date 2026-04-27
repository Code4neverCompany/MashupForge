# Story: Auto-Update Settings — Frontend UI

## Feature
Auto-update settings UI panel for MashupForge Settings page.

## Context
Read the design spec first: `docs/bmad/stories/auto-update-design.md`

## Implementation Steps

### 1. Settings Persistence Hook
Create `src/store/useAutoUpdateSettings.ts`:
```typescript
import { Store } from '@tauri-apps/plugin-store'

type AutoUpdateSettings = {
  autoCheck: boolean
  autoDownload: boolean
  autoInstall: boolean
  installMode: 'passive' | 'basicUi' | 'quiet'
  lastCheck: string | null
}

const DEFAULT_SETTINGS: AutoUpdateSettings = {
  autoCheck: true,
  autoDownload: true,
  autoInstall: false,
  installMode: 'passive',
  lastCheck: null,
}

export function useAutoUpdateSettings() {
  // Load from store, merge with defaults, save on change
  // Return { settings, updateSetting, checkForUpdates, downloadUpdate, installUpdate }
}
```

### 2. AutoUpdateSettings Component
Create `src/components/Settings/AutoUpdateSettings.tsx`:
- Section header: "Auto-Update"
- 4 toggle rows (using existing dark-theme toggle component)
- "Check for Updates" button with loading spinner
- Status line: "Last checked: X ago" / "Update available: vX.Y.Z" / "You're up to date"
- Update available card: version, changelog snippet, "Download" button

### 3. Add to Settings Page
Insert `<AutoUpdateSettings />` into `src/app/settings/page.tsx` in the appropriate section.

### 4. Auto-Check on Startup
In the app root layout or a `useEffect`, call `checkForUpdates()` on mount if `settings.autoCheck` is true.

## Acceptance Criteria
- [ ] All 4 toggles persist across app restarts
- [ ] "Check for Updates" shows loading state while checking
- [ ] "Update available" card appears when update found
- [ ] Status line updates after each check
- [ ] No dark theme violations

## Files
- `src/store/useAutoUpdateSettings.ts` (new)
- `src/components/Settings/AutoUpdateSettings.tsx` (new)
- `src/app/settings/page.tsx` (modify)
