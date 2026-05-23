import { getEnvString } from '../envars';

const DEFAULT_LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';

export function getLangfuseBaseUrl(): string {
  return (
    getEnvString('LANGFUSE_BASE_URL') ||
    getEnvString('LANGFUSE_HOST') ||
    DEFAULT_LANGFUSE_BASE_URL
  ).replace(/\/+$/, '');
}

export const LANGFUSE_AUTH_ENV_VARS =
  'LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL or LANGFUSE_HOST';
