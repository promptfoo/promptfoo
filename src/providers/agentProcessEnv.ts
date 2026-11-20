import { getProcessEnv } from '../envars';

const MINIMAL_CLI_ENV_KEYS = [
  'PATH',
  'Path',
  'HOME',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SHELL',
  'COMSPEC',
  'SystemRoot',
  'PATHEXT',
  'LANG',
  'LC_ALL',
  'TERM',
] as const;

export function getMinimalProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const processEnv = getProcessEnv();
  for (const key of MINIMAL_CLI_ENV_KEYS) {
    const value = processEnv[key];
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value;
    }
  }
  return env;
}
