# Mobile Compatibility + Deployment + Design Implementation

**Date:** 2026-04-12
**Status:** Approved
**Scope:** Full-stack — responsive UI, deployment, desktop app, design polish

---

## Workstream A: Mobile / Responsive Design (Developer)

### Goal
MashupForge currently assumes desktop viewport. Make it fully usable on smartphones.

### Changes
1. **Tailwind responsive breakpoints** — audit all components for mobile (sm: 640px, md: 768px)
2. **Sidebar** — on mobile, hide sidebar by default, show as slide-out drawer (hamburger menu button in header)
3. **Tab bar** — on mobile, switch from horizontal tabs to bottom navigation bar (5-6 icons)
4. **MainContent tabs** — stack vertically on mobile instead of side-by-side panels
5. **Image cards** — single column on mobile, 2 columns on tablet, 3-4 on desktop
6. **Settings page** — full-width sections on mobile, stacked inputs
7. **Pipeline panel** — collapsible sections, smaller fonts, scroll-friendly
8. **Modals** — full-screen on mobile instead of centered overlay
9. **Touch targets** — minimum 44x44px for all interactive elements
10. **Chat input** — fixed bottom bar on mobile like messaging apps

### Key files
- `components/MainContent.tsx` — responsive tab layout
- `components/Sidebar.tsx` — mobile drawer
- `components/PipelinePanel.tsx` — responsive
- `app/globals.css` — mobile utilities
- `app/layout.tsx` — viewport meta, mobile shell

---

## Workstream B: Deployment — Vercel (Developer)

### Goal
Move from localhost:3000 to a public URL via Vercel.

### Steps
1. **Vercel project setup** — `npx vercel` from project root, connect to GitHub
2. **Environment variables** — configure LEONARDO_API_KEY, ZAI_API_KEY, and all .env.local values in Vercel dashboard
3. **next.config.js** — ensure it exports correctly for Vercel (no custom server)
4. **Build test** — `npx next build` must pass clean locally before deploying
5. **Domain** — use Vercel's free .vercel.app subdomain initially
6. **PWA manifest** — add manifest.json for "Add to Home Screen" on mobile browsers

---

## Workstream C: Windows Desktop App (Developer — later)

### Goal
Package as Windows desktop app using Tauri (lightweight, no Electron bloat).

### Steps (defer until A+B done)
1. Install Tauri CLI: `npm install -D @tauri-apps/cli`
2. Init Tauri: `npx tauri init`
3. Configure window size, app icon, system tray
4. Build: `npx tauri build` → .msi installer
5. The Next.js app runs inside a Tauri webview

---

## Workstream D: Design Implementation (Designer)

### Goal
Implement the Global UI Consistency spec from `docs/superpowers/plans/2026-04-11-pipeline-overhaul-ui-refresh.md` Part 3. This was assigned but never completed.

### Specific tasks per tab:
1. **Tab bar** — consistent gap, padding, subtle activity indicator dots
2. **Ideas tab** — card design system (bg-zinc-900/80, rounded-2xl, border-zinc-800/60)
3. **Studio tab** — model selector pills, progress indicators
4. **Gallery tab** — consistent card spacing, hover effects
5. **Captioning tab** — standard card design for caption editor
6. **Post Ready tab** — carousel preview fix, schedule button styling
7. **Calendar tab** — card design system for day cells
8. **Settings tab** — consolidate AI sections, consistent input styling

### Design system reference:
- Background: `bg-zinc-950` (page), `bg-zinc-900/80 backdrop-blur-sm` (cards)
- Borders: `border-zinc-800/60`
- Accent primary: `emerald-500/600`
- Accent secondary: `indigo-500/600` (pipeline only)
- Border radius: cards `rounded-2xl`, inner `rounded-xl`, small `rounded-lg`
- Typography: headings `text-xl font-semibold text-white`, body `text-sm text-zinc-400`

### CRITICAL: MainContent.tsx is 5553 lines
- DO NOT send the whole file to Gemini
- Split into targeted sections by line range
- Verify EVERY change with git diff — Gemini Flash Lite hallucinates edits on large files

---

## Workstream E: Project Improvements (both agents, ongoing loop)

After A-D are done, agents should identify and fix:
- Accessibility issues (contrast, aria labels, keyboard nav)
- Performance (bundle size, lazy loading, image optimization)
- Error handling (user-friendly messages, retry UI)
- Code quality (dead code, unused imports, type safety)
- UX polish (loading states, empty states, transitions)

---

## Execution Order
1. Designer starts D immediately (design polish — independent)
2. Developer starts A (mobile responsive) — highest user value
3. Developer does B (deployment) after A
4. C (desktop app) after B
5. E (improvements) continuously during idle time
