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
