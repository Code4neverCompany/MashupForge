<div align="center">

# MashupForge

**AI-Powered Creative Crossover Studio**

Generate epic crossover artwork combining characters and universes from Star Wars, Marvel, DC, Warhammer 40k, and beyond.

</div>

---

## What It Does

- **Idea Generator** — AI brainstorms creative "what if" crossover scenarios across franchises
- **Image Generation** — Turn ideas into images via Leonardo.ai (3 models: GPT Image-1.5, Nano Banana 2, Nano Banana Pro)
- **Compare Mode** — Generate the same prompt across multiple models side-by-side
- **History** — Browse and re-roll previous generations
- **Chat Assistant** — Conversational AI for brainstorming and prompt refinement

## AI Engine

All text AI (ideas, prompts, captions, chat) runs through **[pi.dev](https://pi.dev)** — a local AI coding agent that connects to any LLM provider. You pick the provider, pi handles the rest.

Supported pi providers include: Google Antigravity, Google AI Studio, Anthropic, OpenAI, ZAI, Groq, Cerebras, and 15+ more.

## Tech Stack

- **Next.js 16** (Turbopack) + React 19
- **TypeScript** throughout
- **Leonardo.ai v2 API** for image generation
- **pi.dev RPC** for text AI (subprocess, no cloud dependency)
- **Tailwind CSS** for styling

## Local Setup

**Requirements**

- Node.js 18 or newer
- `tmux` (used by the pi.dev setup flow to host pi's interactive login)

**Steps**

```bash
# 1. Clone the repo
git clone https://github.com/Code4neverCompany/MashupForge.git
cd MashupForge

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev

# 4. Open http://localhost:3000 in your browser
```

5. In the app, open **Settings** and click **Setup Pi.dev**. This installs
   pi into a local prefix and opens its login flow in a tmux session so you
   can pick a provider and authenticate. Once pi reports as installed +
   authenticated, click **Start Pi** to bring the RPC subprocess up.

Pi stores its own credentials in `~/.pi/agent/auth.json`. No API keys needed in the app for text features.

### Leonardo.ai (Image Generation)

Get an API key from [leonardo.ai](https://leonardo.ai) and set it in `.env.local` or directly in the app's settings panel.

## Project Structure

```
app/
  api/
    leonardo/          # Leonardo image generation + polling
    pi/                # pi.dev RPC proxy (start/stop/prompt/status)
  page.tsx             # Main app entry
components/
  MainContent.tsx      # Primary UI (all tabs, settings, image grid)
  Sidebar.tsx          # Chat + content generator
  MashupStudio.tsx     # Root layout
hooks/
  useImageGeneration.ts  # Image generation + polling logic
  useComparison.ts       # Compare mode (multi-model generation)
lib/
  pi-client.ts        # pi.dev RPC subprocess client
  pi-setup.ts         # pi install/auth helpers
  aiClient.ts         # Client-side AI utilities (SSE consumption)
types/
  mashup.ts           # Leonardo models, styles, dimensions, type defs
```

## License

Private — 4neverCompany
