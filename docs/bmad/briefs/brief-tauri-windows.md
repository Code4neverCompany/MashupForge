# Brief: Tauri Windows Desktop Build

## What
Build a Windows .msi/.exe installer for MashupForge that runs the Next.js web app locally. pi.dev should work in the desktop version.

## Why
- Users can run MashupForge locally with full AI features (pi.dev)
- No dependency on Vercel or internet for AI features
- Better performance than browser (native webview)
- Distribution: email installer to users

## Who
- Target: developers and creators who want AI-powered art generation
- Platform: Windows 10/11

## Success Criteria
- [ ] .msi installer builds successfully
- [ ] App opens in native webview
- [ ] pi.dev installs and runs locally
- [ ] All features work (pipeline, image gen, scheduling)
- [ ] No Vercel dependency

## Constraints
- Build on GitHub Actions (no local Rust toolchain needed)
- Use Vercel URL as webview source (thin installer)
- Phase 1: works on Maurice PC
- Phase 2: GitHub Actions CI/CD
- Phase 3: code signing (later)
- Phase 4: auto-update (later)

## Stories
- STORY-001: GitHub Actions workflow for Windows build
- STORY-002: Tauri config for Windows webview
- STORY-003: pi.dev integration in desktop mode
- STORY-004: Testing and validation
