import fs from 'fs';
import path from 'path';

import dedent from 'dedent';
import { z } from 'zod';
import { resolveAgenticWorkingDir } from '../agentic-utils';
import { applyApiKeyToCliEnv } from './codexApiKeyGating';

const MINIMAL_PROCESS_ENV_KEYS = [
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

const OPTIONAL_PROCESS_ENV_KEYS = [
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

const codexCliEnvValueSchema = z.union([z.string(), z.number(), z.boolean()]).transform(String);

export const codexBaseConfigShape = {
  basePath: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  provider: z.unknown().optional(),
  linkedTargetId: z.string().optional(),
  apiKey: z.string().min(1).optional(),
  base_url: z.string().min(1).optional(),
  working_dir: z.string().min(1).optional(),
  additional_directories: z.array(z.string().min(1)).optional(),
  skip_git_repo_check: z.boolean().optional(),
  codex_path_override: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  model_provider: z.string().min(1).optional(),
  sandbox_mode: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
  network_access_enabled: z.boolean().optional(),
  output_schema: z.record(z.string(), z.unknown()).optional(),
  thread_id: z.string().min(1).optional(),
  persist_threads: z.boolean().optional(),
  thread_pool_size: z.number().int().positive().optional(),
  cli_config: z.record(z.string(), z.unknown()).optional(),
  cli_env: z.record(z.string(), codexCliEnvValueSchema).optional(),
  inherit_process_env: z.boolean().optional(),
  deep_tracing: z.boolean().optional(),
} as const;

type CodexProcessConfig = {
  apiKey?: string;
  cli_config?: Record<string, unknown>;
  cli_env?: Record<string, string | number | boolean>;
  inherit_process_env?: boolean;
  model_provider?: string;
};

export function prepareCodexProcessEnv(
  config: CodexProcessConfig,
  apiKey?: string,
): Record<string, string> {
  const processEnv = config.inherit_process_env
    ? process.env
    : Object.fromEntries(
        MINIMAL_PROCESS_ENV_KEYS.flatMap((key) => {
          const value = process.env[key];
          return typeof value === 'string' && value.length > 0 ? [[key, value]] : [];
        }),
      );
  const env = {
    ...processEnv,
    ...Object.fromEntries(
      Object.entries(config.cli_env ?? {}).map(([key, value]) => [key, String(value)]),
    ),
  };
  const sortedEnv = Object.fromEntries(
    Object.keys(env)
      .sort()
      .flatMap((key) => {
        const value = env[key];
        return value === undefined ? [] : [[key, value]];
      }),
  ) as Record<string, string>;

  applyApiKeyToCliEnv(sortedEnv, config, apiKey);
  return sortedEnv;
}

export function getIgnoredCodexProviderEnvKeys(
  providerEnv: Record<string, unknown> | undefined,
  config: CodexProcessConfig,
): string[] {
  return Object.keys(providerEnv ?? {})
    .filter(
      (key) =>
        key !== 'OPENAI_API_KEY' && key !== 'CODEX_API_KEY' && !(key in (config.cli_env ?? {})),
    )
    .sort();
}

export function getOmittedCodexProcessEnvKeys(
  env: Record<string, string>,
  includeSsh = false,
): string[] {
  return OPTIONAL_PROCESS_ENV_KEYS.filter(
    (key) =>
      typeof process.env[key] === 'string' &&
      !(key in env) &&
      (includeSsh || (key !== 'SSH_AUTH_SOCK' && key !== 'GIT_SSH_COMMAND')),
  );
}

export function resolveCodexWorkingDirectory(
  workingDirectory: string | undefined,
  basePath?: string,
): string {
  return resolveAgenticWorkingDir(workingDirectory, basePath) ?? process.cwd();
}

export function findCodexGitRepositoryRoot(workingDirectory: string): string | undefined {
  let currentDirectory = path.resolve(workingDirectory);

  while (true) {
    if (fs.existsSync(path.join(currentDirectory, '.git'))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return undefined;
    }
    currentDirectory = parentDirectory;
  }
}

export function validateCodexWorkingDirectory(
  workingDirectory: string,
  skipGitCheck = false,
  providerName = 'Codex',
): void {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(workingDirectory);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Working directory ${workingDirectory} does not exist or isn't accessible: ${message}`,
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(`Working directory ${workingDirectory} is not a directory`);
  }

  if (!skipGitCheck && !findCodexGitRepositoryRoot(workingDirectory)) {
    throw new Error(
      dedent`Working directory ${workingDirectory} is not inside a Git repository.

      ${providerName} requires a Git repository by default to prevent unrecoverable errors.

      To bypass this check, set skip_git_repo_check: true in your provider config.`,
    );
  }
}
