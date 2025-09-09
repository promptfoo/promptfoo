import packageJson from '../package.json';
import { getEnvInt, getEnvString } from './envars';

export * from './providers/constants';

export const VERSION = packageJson.version;

export const DEFAULT_QUERY_LIMIT = 100;

// Default API base URL used for sharing and other API operations
export const DEFAULT_API_BASE_URL = 'https://api.promptfoo.app';

// This is used for sharing evals.
export function getShareApiBaseUrl(): string {
  return (
    // TODO(ian): Backwards compatibility, 2024-04-01
    getEnvString('NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL') ||
    getEnvString('NEXT_PUBLIC_PROMPTFOO_BASE_URL') ||
    getEnvString('PROMPTFOO_REMOTE_API_BASE_URL') ||
    DEFAULT_API_BASE_URL
  );
}

export function getDefaultShareViewBaseUrl(): string {
  return getEnvString('PROMPTFOO_SHARING_APP_BASE_URL', `https://promptfoo.app`);
}

// This is used for creating shared eval links.
export function getShareViewBaseUrl(): string {
  return (
    getEnvString('NEXT_PUBLIC_PROMPTFOO_BASE_URL') ||
    getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL') ||
    getDefaultShareViewBaseUrl()
  );
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

export const FILE_METADATA_KEY = '_promptfooFileMetadata';
