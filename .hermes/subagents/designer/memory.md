# Design Decisions - Multiverse Mashup Studio Redesign

## Aesthetic Direction
**Theme:** "Emerald Glass" (Elevated SaaS Utility)
**Core Thesis:** Elevate the existing Zinc/Emerald palette by introducing advanced glassmorphism and motion-first UI.

## Palette
- **Background:** `bg-zinc-950`
- **Glass Panel:** `bg-zinc-900/40 backdrop-blur-xl border border-white/5`
- **Accent (Primary/CTA):** `emerald-500` (Glows/Gradients)
- **Secondary Accent:** `zinc-700` (Depth)

## Typography
- **Primary:** `Inter` (UI)
- **Technical/Code:** `JetBrains Mono`

## Interaction
- **Entrance:** Staggered Fade-in
- **Interaction:** Smooth scale-on-hover (1.02), subtle translate.
- **Glass Effects:** Subtle inner glows using `shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`
