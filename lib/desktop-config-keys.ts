/**
 * Shared constant for desktop configuration key metadata.
 * Safe to import from both client components and server API routes
 * (no node: imports, no server-only modules).
 */
export const DESKTOP_CONFIG_KEYS = [
  { key: 'LEONARDO_API_KEY', label: 'Leonardo AI API Key', hint: 'From app.leonardo.ai/api-access' },
  { key: 'ZAI_API_KEY',      label: 'Zai API Key',         hint: 'From console.zai.dev (pi.dev backend)' },
] as const;

export type DesktopConfigKey = typeof DESKTOP_CONFIG_KEYS[number]['key'];
