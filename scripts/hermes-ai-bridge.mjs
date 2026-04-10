#!/usr/bin/env node
/**
 * Hermes AI Bridge v4 — pi-ai powered SSE proxy for Mashup Studio.
 *
 * Replaces the previous hand-rolled ZAI + Ollama plumbing with
 * @mariozechner/pi-ai: a unified LLM API with built-in provider registry,
 * model metadata, and streaming event parsing across zai, google, anthropic,
 * openai, groq, etc.
 *
 * HTTP surface:
 *   POST /chat      { prompt, systemPrompt?, mode?, maxTokens?, provider?, model?, noCache? }
 *                   → text/event-stream: data: {"text":"<delta>"}\n\n ... data: [DONE]\n\n
 *   POST /generate  (same shape)
 *   GET  /models    ?provider=zai → { provider, models: [...] }   or all providers if omitted
 *   GET  /health    → { status, providers, cache }
 *
 * Route-to-model defaults (overridable via body.provider + body.model):
 *   /chat      → zai / glm-4.5-flash   (fast)
 *   /generate  → zai / glm-5.1         (smart)
 *
 * API keys: pi-ai reads ZAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY,
 * OPENAI_API_KEY, GROQ_API_KEY, ... from the environment.
 */

import http from 'http';
import {
  registerBuiltInApiProviders,
  getModel,
  getModels,
  getProviders,
  getApiProvider,
} from '@mariozechner/pi-ai';

// Load env vars from .env.local so the bridge has access to ZAI_API_KEY,
// GOOGLE_API_KEY, etc. without needing to be launched by Next.js.
try {
  process.loadEnvFile('.env.local');
} catch (err) {
  console.warn('[Bridge] Could not load .env.local:', err.message);
}

// ── Init ─────────────────────────────────────────────────────────────
registerBuiltInApiProviders();

const PORT = 8090;

const DEFAULT_MODELS = {
  '/chat':     { provider: 'zai', model: 'glm-4.5-flash' },
  '/generate': { provider: 'zai', model: 'glm-5.1' },
};

const ENRICHMENT = {
  chat:     'Be concise, vivid, creative. Respond in the requested format.',
  generate: 'Generate creative crossover content. Follow format exactly. No preamble.',
  enhance:  'Enhance this image prompt for cinematic visual impact. Return ONLY the enhanced prompt.',
  idea:     'Generate unique crossover concepts (Star Wars, Marvel, DC, WH40k). No overused characters. Return ONLY requested format.',
};

function enrichSystemPrompt(mode, userSystemPrompt) {
  if (userSystemPrompt && userSystemPrompt.trim()) return userSystemPrompt;
  return ENRICHMENT[mode] || ENRICHMENT.generate;
}

// ── Cache ────────────────────────────────────────────────────────────
// Caches the fully-accumulated text per (provider, model, mode, prompt).
// Cache hits are replayed as a single SSE event for protocol parity.
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 100;

function getCached(key) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < CACHE_TTL) return e.value;
  if (e) cache.delete(key);
  return null;
}

function setCache(key, val) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value: val, ts: Date.now() });
}

// ── SSE helpers ──────────────────────────────────────────────────────
function writeSSEHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
}

function writeSSEEvent(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function writeSSEDone(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}

// ── /chat and /generate handler ──────────────────────────────────────
async function handleStreamRequest(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const {
    prompt,
    systemPrompt: userSystemPrompt,
    maxTokens,
    mode,
    provider: overrideProvider,
    model: overrideModel,
    noCache,
  } = parsed;

  if (!prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'prompt is required' }));
    return;
  }

  const enrichMode = mode || (req.url === '/chat' ? 'chat' : 'generate');
  const systemPrompt = enrichSystemPrompt(enrichMode, userSystemPrompt);

  const route = DEFAULT_MODELS[req.url];
  const provider = overrideProvider || route.provider;
  const modelId = overrideModel || route.model;

  const cacheKey = `${provider}:${modelId}:${enrichMode}:${prompt.slice(0, 200)}`;

  // Cache hit → replay as a single SSE chunk for protocol parity.
  if (!noCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`[Bridge] CACHE HIT ${provider}/${modelId} mode=${enrichMode}`);
      writeSSEHeaders(res);
      if (cached.text) writeSSEEvent(res, { text: cached.text });
      writeSSEDone(res);
      return;
    }
  }

  console.log(
    `[Bridge] ${req.url} mode=${enrichMode} provider=${provider}/${modelId} tokens=${maxTokens || 'default'}`
  );

  // Resolve model + api provider before opening the SSE stream so we can
  // still return a JSON 400 if the caller asked for something that doesn't
  // exist. Once headers are written we must continue in SSE form.
  let model;
  try {
    model = getModel(provider, modelId);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown model ${provider}/${modelId}: ${err.message}` }));
    return;
  }
  const apiProvider = getApiProvider(model.api);
  if (!apiProvider) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `No api provider registered for ${model.api}` }));
    return;
  }

  writeSSEHeaders(res);

  const context = {
    systemPrompt,
    messages: [
      { role: 'user', content: prompt, timestamp: Date.now() },
    ],
  };

  const options = {};
  if (maxTokens) options.maxTokens = maxTokens;

  const start = Date.now();
  let accumulated = '';

  try {
    const stream = apiProvider.streamSimple(model, context, options);
    for await (const event of stream) {
      if (event.type === 'text_delta' && typeof event.delta === 'string' && event.delta.length > 0) {
        accumulated += event.delta;
        writeSSEEvent(res, { text: event.delta });
      } else if (event.type === 'error') {
        const msg = event.error?.errorMessage || 'pi-ai stream error';
        writeSSEEvent(res, { error: msg });
      }
    }
    const elapsed = Date.now() - start;
    console.log(`[Bridge] DONE ${provider}/${modelId} ${elapsed}ms text=${accumulated.length}b`);

    if (!noCache && accumulated) {
      setCache(cacheKey, { text: accumulated, provider: model.provider, model: model.id });
    }
  } catch (err) {
    console.error(`[Bridge] Error (${provider}/${modelId}):`, err.message);
    writeSSEEvent(res, { error: err.message });
  }

  writeSSEDone(res);
}

// ── /models handler ──────────────────────────────────────────────────
function handleModelsRequest(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const providerFilter = url.searchParams.get('provider');

  res.setHeader('Content-Type', 'application/json');

  if (providerFilter) {
    try {
      const models = getModels(providerFilter).map((m) => ({
        id: m.id,
        name: m.name,
        api: m.api,
        provider: m.provider,
        reasoning: m.reasoning,
        input: m.input,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      }));
      res.writeHead(200);
      res.end(JSON.stringify({ provider: providerFilter, models }));
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: `Unknown provider: ${providerFilter}` }));
    }
    return;
  }

  // No provider filter → list everything grouped by provider.
  const providers = getProviders();
  const all = {};
  for (const p of providers) {
    try {
      all[p] = getModels(p).map((m) => ({ id: m.id, name: m.name, api: m.api }));
    } catch {
      all[p] = [];
    }
  }
  res.writeHead(200);
  res.end(JSON.stringify({ providers, models: all }));
}

// ── HTTP Server ──────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      providers: {
        zai: !!process.env.ZAI_API_KEY,
        google: !!process.env.GOOGLE_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        groq: !!process.env.GROQ_API_KEY,
      },
      cache: cache.size,
    }));
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/models')) {
    handleModelsRequest(req, res);
    return;
  }

  if (req.method === 'POST' && (req.url === '/chat' || req.url === '/generate')) {
    await handleStreamRequest(req, res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Hermes AI Bridge v4 — pi-ai] http://127.0.0.1:${PORT}`);
  console.log(`  /chat     → ${DEFAULT_MODELS['/chat'].provider}/${DEFAULT_MODELS['/chat'].model}`);
  console.log(`  /generate → ${DEFAULT_MODELS['/generate'].provider}/${DEFAULT_MODELS['/generate'].model}`);
  console.log(`  ZAI:       ${process.env.ZAI_API_KEY ? 'set' : 'MISSING'}`);
  console.log(`  Google:    ${process.env.GOOGLE_API_KEY ? 'set' : 'not set'}`);
  console.log(`  Anthropic: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'not set'}`);
});
