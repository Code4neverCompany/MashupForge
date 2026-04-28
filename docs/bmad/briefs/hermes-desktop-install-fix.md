# Brief: Fix Hermes Desktop EXE Install Script

**Date:** 2026-04-28
**Priority:** High
**Project:** Hermes Desktop (Tauri exe wrapper)

---

## Problem

When Hermes Agent runs inside the Tauri-built `.exe` on Windows, the official install script at `hermes-agent/scripts/install.sh` produces three failures:

```
⚠ npm install failed (browser tools may not work)
⚠ Playwright browser installation failed — browser tools will not work.
⚠ TUI npm install failed (hermes --tui may not work)
```

The script detects the OS as "linux (ubuntu)" even though it's running inside the exe on Windows. This causes:
- Browser tools (`hermes --tui`, Playwright-based scraping) to be broken in the exe
- The TUI to be broken

---

## Root Cause

The install script's OS detection (`uname -s`) returns Linux even when running inside a Tauri exe on Windows. The script then tries to run:
- `npm install` (works fine — tested manually)
- `npx playwright install --with-deps chromium` (fails because it runs as root/apt-less user inside Wine, not a real Linux machine)
- TUI `npm install` (fails for the same reason)

The actual `npm install` commands succeed when run manually (tested 2026-04-28). The issue is specifically with Playwright browser installation and possibly the TUI deps.

---

## What Needs Fixing

1. **OS Detection:** The script needs to detect when it's running inside a Tauri exe (check for a Tauri-specific env var or file, or detect Wine)
2. **Playwright under Wine/Windows:** When running as the exe, Playwright needs to install Chromium differently — either:
   - Download the Windows Playwright build
   - Use the pre-bundled Chromium if available
   - Skip browser tools installation gracefully (don't fail, warn)
3. **TUI deps:** Same — either fix the install path for Windows or skip gracefully
4. **Error suppression:** The three `⚠` warnings are scaring users even when most things actually work. The script should only warn about things that genuinely won't work.

---

## Acceptance Criteria

- [ ] Install script no longer produces false-failure warnings when run inside the exe
- [ ] Browser tools work when the exe is installed on a clean Windows machine (or the script gracefully degrades)
- [ ] TUI works after install on the exe
- [ ] The script accurately reports what's working vs. what failed
