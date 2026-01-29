import { getEnvInt, getEnvString } from './envars';

export * from './providers/constants';
export { VERSION } from './version';

export const DEFAULT_QUERY_LIMIT = 100;

export const DEFAULT_MAX_CONCURRENCY = 4;

// Default API base URL used for sharing and other API operations
export const DEFAULT_API_BASE_URL = 'https://api.promptfoo.app';

// This is used for sharing evals.
export function getShareApiBaseUrl(): string {
  return getEnvString('PROMPTFOO_REMOTE_API_BASE_URL') || DEFAULT_API_BASE_URL;
}

export function getDefaultShareViewBaseUrl(): string {
  return getEnvString('PROMPTFOO_SHARING_APP_BASE_URL', `https://promptfoo.app`);
}

// This is used for creating shared eval links.
export function getShareViewBaseUrl(): string {
  return getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL') || getDefaultShareViewBaseUrl();
}

export function getDefaultPort(): number {
  return getEnvInt('API_PORT', 15500);
}

/**
 * Constructs a localhost URL for the web UI.
 * Used for CLI-to-browser handoff (e.g., recon, setup).
 *
 * @param path - The path portion of the URL (e.g., '/redteam/setup')
 * @param queryParams - Optional query parameters to append
 * @returns The full localhost URL (e.g., 'http://localhost:15500/redteam/setup?source=recon')
 */
export function getLocalAppUrl(path: string, queryParams?: Record<string, string>): string {
  const base = `http://localhost:${getDefaultPort()}${path}`;
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return base;
  }
  const params = new URLSearchParams(queryParams).toString();
  return `${base}?${params}`;
}

// Maximum width for terminal outputs.
export const TERMINAL_MAX_WIDTH =
  process?.stdout?.isTTY && process?.stdout?.columns && process?.stdout?.columns > 10
    ? process?.stdout?.columns - 10
    : 120;

export const CLOUD_PROVIDER_PREFIX = 'promptfoo://provider/';

// Re-export HUMAN_ASSERTION_TYPE from providers/constants for backward compatibility
// (providers/constants is browser-safe, constants.ts is not due to envars import)
export { HUMAN_ASSERTION_TYPE, type HumanAssertionType } from './providers/constants';

export const CONSENT_ENDPOINT = 'https://api.promptfoo.dev/consent';
export const EVENTS_ENDPOINT = 'https://a.promptfoo.app';

export const R_ENDPOINT = 'https://r.promptfoo.app/';
