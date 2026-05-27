import { tmpdir } from 'node:os';

type PackageManagerExecutable = 'npm' | 'pnpm' | 'yarn' | 'bun';

const UPDATE_ENV_KEYS = [
  'PATH',
  'Path',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'SystemRoot',
  'COMSPEC',
  'ComSpec',
  'TEMP',
  'TMP',
  'TMPDIR',
  'SHELL',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'PNPM_HOME',
  'YARN_GLOBAL_FOLDER',
  'BUN_INSTALL',
  'NPM_CONFIG_PREFIX',
  'npm_config_prefix',
  'NPM_CONFIG_USERCONFIG',
  'npm_config_userconfig',
  'NPM_CONFIG_GLOBALCONFIG',
  'npm_config_globalconfig',
] as const;

function sanitizeExecutableSearchPath(pathValue: string): string {
  const delimiter = process.platform === 'win32' ? ';' : ':';
  return pathValue
    .split(delimiter)
    .filter((entry) => !entry.replace(/\\/g, '/').toLowerCase().includes('/node_modules/.bin'))
    .join(delimiter);
}

export function getPackageManagerExecutable(executable: PackageManagerExecutable): string {
  if (process.platform !== 'win32') {
    return executable;
  }

  return executable === 'bun' ? 'bun.exe' : `${executable}.cmd`;
}

export function getUpdateSpawnContext(sourceEnvironment: NodeJS.ProcessEnv): {
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const env: NodeJS.ProcessEnv = {};
  for (const key of UPDATE_ENV_KEYS) {
    const value = sourceEnvironment[key];
    if (value !== undefined) {
      env[key] = key === 'PATH' || key === 'Path' ? sanitizeExecutableSearchPath(value) : value;
    }
  }

  return { cwd: tmpdir(), env };
}

export function withTargetVersion(updateCommand: string, targetVersion: string): string {
  return updateCommand.replace('@latest', `@${targetVersion}`);
}

export function parseUpdateCommandForSpawn(
  updateCommand: string,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
): {
  command: string;
  args: string[];
} {
  const commandParts = updateCommand.split(' ');
  const executable = commandParts[0];
  const args = commandParts.slice(1);

  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return {
      command: sourceEnvironment.ComSpec || sourceEnvironment.COMSPEC || 'cmd.exe',
      args: ['/d', '/s', '/c', executable, ...args],
    };
  }

  return {
    command: executable,
    args,
  };
}
