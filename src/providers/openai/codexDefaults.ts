import fs from 'fs';
import os from 'os';
import path from 'path';

import { getEnvString } from '../../envars';
import { getDirectory, resolvePackageEntryPoint } from '../../esm';
import { OpenAICodexSDKProvider } from './codex-sdk';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';
import type { OpenAICodexSDKConfig } from './codex-sdk';

const CODEX_AUTH_FILENAME = 'auth.json';
const CODEX_SDK_PACKAGE_NAME = '@openai/codex-sdk';

let codexDefaultWorkingDir: string | undefined;

const CODEX_GRADING_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    pass: {
      type: 'boolean',
    },
    score: {
      type: 'number',
    },
    reason: {
      type: 'string',
    },
  },
  required: ['pass', 'score', 'reason'],
  additionalProperties: false,
} as const;

const codexDefaultProvidersByCacheKey = new Map<
  string,
  Pick<
    DefaultProviders,
    | 'gradingJsonProvider'
    | 'gradingProvider'
    | 'llmRubricProvider'
    | 'suggestionsProvider'
    | 'synthesizeProvider'
    | 'webSearchProvider'
  >
>();

const codexSdkAvailabilityByBaseDir = new Map<string, boolean>();

function getCodexEnvString(env: EnvOverrides | undefined, key: string): string | undefined {
  return env?.[key] || getEnvString(key);
}

function getCodexHome(env?: EnvOverrides): string {
  const homeDir = os.homedir?.();
  const defaultHome =
    typeof homeDir === 'string' && homeDir ? path.join(homeDir, '.codex') : undefined;
  const codexHome = getCodexEnvString(env, 'CODEX_HOME') || defaultHome || '.codex';
  return path.resolve(codexHome);
}

function getTempDirectory(): string {
  const tempDir = os.tmpdir?.();
  return typeof tempDir === 'string' && tempDir ? tempDir : process.cwd();
}

function getCodexDefaultWorkingDir(): string {
  if (!codexDefaultWorkingDir) {
    codexDefaultWorkingDir = fs.mkdtempSync(
      path.join(getTempDirectory(), 'promptfoo-codex-default-'),
    );
  }

  return codexDefaultWorkingDir;
}

function hasCodexAuthFile(env?: EnvOverrides): boolean {
  try {
    const stats = fs.statSync(path.join(getCodexHome(env), CODEX_AUTH_FILENAME));
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

function hasCodexSdkPackage(baseDir: string): boolean {
  const cached = codexSdkAvailabilityByBaseDir.get(baseDir);
  if (cached !== undefined) {
    return cached;
  }

  const hasPackage = resolvePackageEntryPoint(CODEX_SDK_PACKAGE_NAME, baseDir) !== null;
  codexSdkAvailabilityByBaseDir.set(baseDir, hasPackage);
  return hasPackage;
}

function canLoadCodexSdkPackage(): boolean {
  return [process.cwd(), getDirectory()].some((baseDir) => hasCodexSdkPackage(baseDir));
}

export function hasCodexDefaultCredentials(env?: EnvOverrides): boolean {
  const hasCodexApiKey = Boolean(getCodexEnvString(env, 'CODEX_API_KEY'));
  return (hasCodexApiKey || hasCodexAuthFile(env)) && canLoadCodexSdkPackage();
}

function getCodexDefaultProviderConfig(
  env: EnvOverrides | undefined,
  config?: OpenAICodexSDKConfig,
  defaultWorkingDir: string = getCodexDefaultWorkingDir(),
): OpenAICodexSDKConfig {
  const codexHome = getCodexEnvString(env, 'CODEX_HOME');
  const workingDir = config?.working_dir || defaultWorkingDir;
  fs.mkdirSync(workingDir, { recursive: true });
  const cliEnv = {
    ...(codexHome ? { CODEX_HOME: path.resolve(codexHome) } : {}),
    ...config?.cli_env,
  };

  return {
    approval_policy: 'never',
    sandbox_mode: 'read-only',
    skip_git_repo_check: true,
    working_dir: workingDir,
    ...config,
    ...(Object.keys(cliEnv).length > 0 ? { cli_env: cliEnv } : {}),
  };
}

function getCodexDefaultProvidersCacheKey(env?: EnvOverrides): string {
  return JSON.stringify({
    CODEX_HOME: getCodexEnvString(env, 'CODEX_HOME'),
    hasCodexApiKey: Boolean(getCodexEnvString(env, 'CODEX_API_KEY')),
    hasOpenAiApiKey: Boolean(getCodexEnvString(env, 'OPENAI_API_KEY')),
  });
}

export function getCodexDefaultProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  | 'gradingJsonProvider'
  | 'gradingProvider'
  | 'llmRubricProvider'
  | 'suggestionsProvider'
  | 'synthesizeProvider'
  | 'webSearchProvider'
> {
  const cacheKey = getCodexDefaultProvidersCacheKey(env);
  const cachedProviders = codexDefaultProvidersByCacheKey.get(cacheKey);
  if (cachedProviders) {
    return cachedProviders;
  }

  const defaultWorkingDir = getCodexDefaultWorkingDir();

  const gradingProvider = new OpenAICodexSDKProvider({
    config: getCodexDefaultProviderConfig(env, undefined, defaultWorkingDir),
    env,
  });
  const gradingJsonProvider = new OpenAICodexSDKProvider({
    config: getCodexDefaultProviderConfig(
      env,
      {
        output_schema: CODEX_GRADING_OUTPUT_SCHEMA,
      },
      defaultWorkingDir,
    ),
    env,
  });
  const webSearchProvider = new OpenAICodexSDKProvider({
    config: getCodexDefaultProviderConfig(
      env,
      {
        network_access_enabled: true,
        output_schema: CODEX_GRADING_OUTPUT_SCHEMA,
        web_search_mode: 'live',
      },
      defaultWorkingDir,
    ),
    env,
  });

  const providers = {
    gradingJsonProvider,
    gradingProvider,
    llmRubricProvider: gradingJsonProvider,
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
    webSearchProvider,
  };
  codexDefaultProvidersByCacheKey.set(cacheKey, providers);
  return providers;
}

export function clearCodexDefaultProvidersForTesting(): void {
  codexDefaultProvidersByCacheKey.clear();
  codexSdkAvailabilityByBaseDir.clear();
  codexDefaultWorkingDir = undefined;
}
