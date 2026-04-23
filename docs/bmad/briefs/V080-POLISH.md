# V080-POLISH: Gallery, Pipeline, Onboarding & AI Polish

## Summary
Batch of 9 bug fixes and improvements across Gallery, Pipeline approval, Onboarding wizard, Settings tag sync, AI behavior, and Collection creation.

## Issues

### BUG-001: Gallery batch checkboxes unclickable
GalleryCard.tsx renders checkboxes (line 214) tied to `selectedForBatch` / `onToggleBatch`. Clicking the checkbox doesn't toggle selection. Likely a z-index or event propagation issue — the card's onClick or context menu may be swallowing the checkbox click.

### BUG-002: Disapproved pipeline images leak into Gallery
Gallery filter (MainContent.tsx:1487) hides images with `pipelinePending === true`. But rejected/disapproved pipeline images may lose that flag without being properly excluded. Need to also filter out images whose pipeline status is 'rejected' or whose associated ScheduledPost has status 'rejected'.

### FEAT-001: Post Ready tab — show countdown timer until scheduled time
PostReadyImages are already sorted by soonest schedule (MainContent.tsx:1555). Add a visible countdown/timer badge on each PostReadyCard showing time remaining until the post goes out.

### FEAT-002: Onboarding — expand tag selection from 2 to 30+
Step2Niche.tsx currently offers a limited tag set. Expand to 30+ recommended tags across niches and genres. Allow multi-select (not just 2).

### BUG-003: Onboarding scroll — Continue button unreachable
OnboardingWizard.tsx container has `overflow-hidden` (line 143) and content has `overflow-y-auto` (line 163). When many tags are selected, the content grows and the bottom buttons get pushed below the visible area. Fix: make buttons sticky at bottom, or ensure the scrollable area doesn't push buttons out of view.

### FEAT-003: Settings — expose onboarding tags for editing
Tags recommended/selected during onboarding should be editable in SettingsModal/DesktopSettingsPanel. Currently niches/genres are set during onboarding and stored in settings, but the Settings UI may not expose them for modification.

### IMPROVE-001: Tighten AI (pi.dev) binding to settings tags + system prompt
The system prompt (SettingsModal.tsx:1041) is a static string. It should dynamically incorporate the user's selected niches, genres, and custom tags. The AI should weight its output toward the user's configured focus areas.

### FEAT-004: Collection creation — auto-generate name + description from images
CollectionModal.tsx currently has manual name/description inputs. When images are selected, use pi.dev to generate a fitting name and description based on the image prompts/tags.

### BUG-004: Pipeline approval — 2-image carousel blocks deselection
carousel-degrade-guard.ts: `CAROUSEL_MIN_IMAGES = 2` and `canRejectMoreInCarousel` returns `nonRejectedCount > 2`. With exactly 2 images, neither can be rejected. Fix: allow reducing to 1 image by converting the carousel to a single post, or allow rejecting one image when exactly 2 remain.

## Priority
BUG-004 > BUG-001 > BUG-003 > BUG-002 > FEAT-002 > FEAT-003 > FEAT-001 > IMPROVE-001 > FEAT-004

## Scope
All changes in: components/GalleryCard.tsx, components/MainContent.tsx, components/onboarding/*, components/SettingsModal.tsx, components/CollectionModal.tsx, components/approval/*, lib/carousel-degrade-guard.ts, lib/carousel-ghost.ts
