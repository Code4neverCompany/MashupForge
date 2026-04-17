/**
 * Shared constant for desktop configuration key metadata.
 * Safe to import from both client components and server API routes
 * (no node: imports, no server-only modules).
 */
// INSTAGRAM_* moved here from IndexedDB-backed UserSettings. IDB is
// origin-scoped; on desktop the origin can drift across launches if
// STORY-121's stable-port bind falls back to an ephemeral port (port
// 19782 already bound by another process, zombie sidecar, etc.). When
// that happens IDB reads the new origin's empty store and the user
// sees "credentials wiped." config.json lives on disk under a stable
// path, so anything listed here survives any webview origin drift.

export const PI_PROVIDER_OPTIONS = ['zai', 'anthropic', 'openai', 'google'] as const;
export type PiProvider = typeof PI_PROVIDER_OPTIONS[number];

interface BaseFieldMeta {
  key: string;
  label: string;
  hint: string;
}
interface SecretFieldMeta extends BaseFieldMeta { kind?: 'secret' }
interface SelectFieldMeta extends BaseFieldMeta {
  kind: 'select';
  options: readonly string[];
}
interface TextFieldMeta extends BaseFieldMeta { kind: 'text' }

export type DesktopConfigFieldMeta = SecretFieldMeta | SelectFieldMeta | TextFieldMeta;

// PI_PROVIDER + PI_DEFAULT_MODEL come first so the dropdown sits at the
// top of the panel — provider choice gates which API key matters most.
export const DESKTOP_CONFIG_KEYS: readonly DesktopConfigFieldMeta[] = [
  { key: 'PI_PROVIDER',            label: 'Pi.dev Provider',        hint: 'AI backend used by pi for chat / ideas / captions.', kind: 'select', options: PI_PROVIDER_OPTIONS },
  { key: 'PI_DEFAULT_MODEL',       label: 'Default Model',          hint: 'Model ID for the chosen provider (e.g. glm-4.6, claude-sonnet-4-5, gpt-4o, gemini-2.5-pro).', kind: 'text' },
  { key: 'LEONARDO_API_KEY',       label: 'Leonardo AI API Key',    hint: 'From app.leonardo.ai/api-access' },
  { key: 'ZAI_API_KEY',            label: 'Z.AI API Key',           hint: 'From console.z.ai — used when provider = zai (GLM).' },
  { key: 'ANTHROPIC_API_KEY',      label: 'Anthropic API Key',      hint: 'From console.anthropic.com — used when provider = anthropic (Claude).' },
  { key: 'OPENAI_API_KEY',         label: 'OpenAI API Key',         hint: 'From platform.openai.com — used when provider = openai (GPT).' },
  { key: 'GOOGLE_API_KEY',         label: 'Google API Key',         hint: 'From aistudio.google.com — used when provider = google (Gemini).' },
  { key: 'INSTAGRAM_ACCOUNT_ID',   label: 'Instagram Account ID',   hint: 'Business account ID from Meta for Developers' },
  { key: 'INSTAGRAM_ACCESS_TOKEN', label: 'Instagram Access Token', hint: 'Long-lived Facebook Page Token (starts with EAA)' },
  { key: 'TWITTER_APP_KEY',        label: 'Twitter App Key',        hint: 'OAuth 1.0a consumer key from developer.x.com' },
  { key: 'TWITTER_APP_SECRET',     label: 'Twitter App Secret',     hint: 'OAuth 1.0a consumer secret' },
  { key: 'TWITTER_ACCESS_TOKEN',   label: 'Twitter Access Token',   hint: 'OAuth 1.0a access token' },
  { key: 'TWITTER_ACCESS_SECRET',  label: 'Twitter Access Secret',  hint: 'OAuth 1.0a access token secret' },
  { key: 'PINTEREST_ACCESS_TOKEN', label: 'Pinterest Access Token', hint: 'From developers.pinterest.com (pins:write scope)' },
  { key: 'PINTEREST_BOARD_ID',     label: 'Pinterest Board ID',     hint: 'Target board ID (optional — defaults to first board)' },
  { key: 'DISCORD_WEBHOOK_URL',    label: 'Discord Webhook URL',    hint: 'Channel webhook URL from Server Settings → Integrations' },
];

export type DesktopConfigKey = typeof DESKTOP_CONFIG_KEYS[number]['key'];
