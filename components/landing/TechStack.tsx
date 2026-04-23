'use client';

import { motion } from 'motion/react';

interface Tech {
  name: string;
  role: string;
}

const STACK: Tech[] = [
  { name: 'Next.js 16', role: 'App Router · React 19' },
  { name: 'TypeScript', role: 'End-to-end types' },
  { name: 'Tailwind CSS v4', role: 'Brand token system' },
  { name: 'Motion', role: 'Micro-interactions' },
  { name: 'Leonardo.ai', role: 'Image generation' },
  { name: 'pi.dev · GLM', role: 'Text + captioning' },
  { name: 'Tauri 2', role: 'Desktop shell' },
  { name: 'IDB-KeyVal', role: 'Local-first storage' },
];

export function TechStack() {
  return (
    <section
      aria-labelledby="stack-heading"
      className="relative bg-[#050505] px-6 py-24 sm:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c5a062]/25 to-transparent"
      />

      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col items-center text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c5a062]">
            Built with
          </p>
          <h2
            id="stack-heading"
            className="mt-3 font-sans text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            A modern, local-first stack
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-400">
            Everything runs on your machine. Your API keys stay in your
            environment, your gallery stays in your browser storage.
          </p>
        </div>

        <ul
          role="list"
          className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {STACK.map((tech, i) => (
            <motion.li
              key={tech.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: 'easeOut' }}
              className="group rounded-xl border border-[#c5a062]/20 bg-[#0a0a0a] px-4 py-3 transition-colors duration-200 hover:border-[#c5a062]/45 hover:bg-[#0f0f0f]"
            >
              <div className="font-sans text-sm font-semibold text-white">
                {tech.name}
              </div>
              <div className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-zinc-500 transition-colors duration-200 group-hover:text-[#c5a062]/80">
                {tech.role}
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default TechStack;
