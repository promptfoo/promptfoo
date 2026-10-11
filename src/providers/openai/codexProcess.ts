import fs from 'fs';
import path from 'path';

import { getProcessEnv } from '../../envars';

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

export const COMMON_OPTIONAL_PROCESS_ENV_KEYS = [
  'CODEX_HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'NODE_EXTRA_CA_CERTS',
  'SSH_AUTH_SOCK',
  'GIT_SSH_COMMAND',
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

export function findGitRepositoryRoot(workingDir: string): string | undefined {
  let currentDir = path.resolve(workingDir);

  while (true) {
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}
