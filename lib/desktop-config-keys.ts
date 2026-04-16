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
export const DESKTOP_CONFIG_KEYS = [
  { key: 'LEONARDO_API_KEY',       label: 'Leonardo AI API Key',    hint: 'From app.leonardo.ai/api-access' },
  { key: 'ZAI_API_KEY',            label: 'Zai API Key',            hint: 'From console.zai.dev (pi.dev backend)' },
  { key: 'INSTAGRAM_ACCOUNT_ID',   label: 'Instagram Account ID',   hint: 'Business account ID from Meta for Developers' },
  { key: 'INSTAGRAM_ACCESS_TOKEN', label: 'Instagram Access Token', hint: 'Long-lived Facebook Page Token (starts with EAA)' },
  { key: 'TWITTER_APP_KEY',        label: 'Twitter App Key',        hint: 'OAuth 1.0a consumer key from developer.x.com' },
  { key: 'TWITTER_APP_SECRET',     label: 'Twitter App Secret',     hint: 'OAuth 1.0a consumer secret' },
  { key: 'TWITTER_ACCESS_TOKEN',   label: 'Twitter Access Token',   hint: 'OAuth 1.0a access token' },
  { key: 'TWITTER_ACCESS_SECRET',  label: 'Twitter Access Secret',  hint: 'OAuth 1.0a access token secret' },
  { key: 'PINTEREST_ACCESS_TOKEN', label: 'Pinterest Access Token', hint: 'From developers.pinterest.com (pins:write scope)' },
  { key: 'PINTEREST_BOARD_ID',     label: 'Pinterest Board ID',     hint: 'Target board ID (optional — defaults to first board)' },
  { key: 'DISCORD_WEBHOOK_URL',    label: 'Discord Webhook URL',    hint: 'Channel webhook URL from Server Settings → Integrations' },
] as const;

export type DesktopConfigKey = typeof DESKTOP_CONFIG_KEYS[number]['key'];
