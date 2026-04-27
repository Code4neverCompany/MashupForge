# Story: Auto-Update Settings — UI Design

## Feature
Dark-themed settings panel section for auto-update controls in MashupForge.

## Design Direction
Follow the existing dark theme design system (check `src/app/settings/page.tsx` for current style). Use the existing toggle/switch component. Match colors, spacing, and typography from the project.

## Elements to Design

### Section: Auto-Update
Header: "Auto-Update" with an info icon tooltip explaining what each option does.

### 4 Toggle Rows
1. **Check for updates automatically** — default ON
2. **Download updates automatically** — default ON
3. **Install updates automatically** — default OFF (user should confirm)
4. **Check on startup** — (optional, can be merged with #1)

### Install Mode Dropdown (Windows only)
- passive (recommended) — small progress window
- basicUi — requires user interaction
- quiet — no feedback (not recommended)

### Manual Check Button
- "Check for Updates" — primary/outline button
- Loading state with spinner while checking
- Disabled while check is in progress

### Status Line
- "You're up to date — checked 2 hours ago"
- "Update available: v1.2.3 — [Download]"
- "Checking for updates..."

### Update Available Card (when update found)
- Version badge: "v1.2.3 available"
- Changelog snippet (first 2 lines)
- "Release Notes" link
- Download / Install buttons

## Acceptance Criteria
- [ ] Fits seamlessly into existing settings page layout
- [ ] All 4 toggles + dropdown implemented
- [ ] Loading/error/success states for check button
- [ ] Update available card appears correctly
- [ ] Uses existing dark theme tokens

## Files
- `src/components/Settings/AutoUpdateSettings.tsx` (design + implementation)
