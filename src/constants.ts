import packageJson from '../package.json';
import { getEnvInt, getEnvString } from './envars';

export const VERSION = packageJson.version;

export const DEFAULT_QUERY_LIMIT = 100;

// This is used for sharing evals.
export const SHARE_API_BASE_URL =
  // TODO(ian): Backwards compatibility, 2024-04-01
  getEnvString('NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL') ||
  getEnvString('NEXT_PUBLIC_PROMPTFOO_BASE_URL') ||
  getEnvString('PROMPTFOO_REMOTE_API_BASE_URL') ||
  `https://api.promptfoo.app`;

export const DEFAULT_SHARE_VIEW_BASE_URL = getEnvString(
  'PROMPTFOO_SHARING_APP_BASE_URL',
  `https://promptfoo.app`,
);

// This is used for creating shared eval links.
export const SHARE_VIEW_BASE_URL =
  getEnvString('NEXT_PUBLIC_PROMPTFOO_BASE_URL') ||
  getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL') ||
  DEFAULT_SHARE_VIEW_BASE_URL;

export const DEFAULT_PORT = getEnvInt('API_PORT', 15500);

// Maximum width for terminal outputs.
export const TERMINAL_MAX_WIDTH =
  process?.stdout?.isTTY && process?.stdout?.columns && process?.stdout?.columns > 10
    ? process?.stdout?.columns - 10
    : 120;

export const CLOUD_PROVIDER_PREFIX = 'promptfoo://provider/';
