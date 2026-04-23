'use client';

import { motion } from 'motion/react';
import {
  Lightbulb,
  ImageIcon,
  GitCompareArrows,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  blurb: string;
}

const FEATURES: Feature[] = [
  {
    icon: Lightbulb,
    title: 'Idea Generator',
    blurb:
      'Brainstorm crossovers with a GLM-powered assistant that riffs on your universes and prompts you with fresh angles.',
  },
  {
    icon: ImageIcon,
    title: 'Image Generation',
    blurb:
      'Leonardo.ai v2 behind a clean UI — Flux, Phoenix, Lightning XL, with model presets tuned for crossover art.',
  },
  {
    icon: GitCompareArrows,
    title: 'Compare Mode',
    blurb:
      'Pit two prompts or models side-by-side. Save the winner to gallery, keep the runner-up for the next iteration.',
  },
  {
    icon: Workflow,
    title: 'Autonomous Pipeline',
    blurb:
      'Ideas → images → captions → scheduled posts. Smart scheduler reads Instagram engagement heatmaps.',
  },
];

export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="relative bg-[#050505] px-6 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c5a062]">
            What it does
          </p>
          <h2
            id="features-heading"
            className="mt-3 font-sans text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            One studio, the full creative loop
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-400">
            Every stage is wired together. Save time in the ideation phase,
            stay in flow during generation, and ship a week of posts in an
            afternoon.
          </p>
        </div>

        <ul
          role="list"
          className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.li
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
                className="group relative overflow-hidden rounded-2xl border border-[#c5a062]/20 bg-[#0a0a0a] p-6 shadow-[0_2px_16px_rgba(0,0,0,0.4)] transition-all duration-300 hover:border-[#c5a062]/45 hover:bg-[#0f0f0f] hover:shadow-[0_8px_32px_rgba(197,160,98,0.08)]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[#c5a062]/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />

                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#00e6ff]/20 bg-[#00e6ff]/10 text-[#00e6ff] transition-colors duration-300 group-hover:border-[#00e6ff]/40 group-hover:bg-[#00e6ff]/15">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>

                <h3 className="mt-5 font-sans text-lg font-semibold tracking-tight text-white">
                  {feature.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {feature.blurb}
                </p>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default Features;
