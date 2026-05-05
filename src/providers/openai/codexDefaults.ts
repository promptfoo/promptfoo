import { createHmac, randomBytes } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { getEnvString } from '../../envars';
import { getDirectory, resolvePackageEntryPoint } from '../../esm';
import logger from '../../logger';
import { providerRegistry } from '../providerRegistry';
import { OpenAICodexSDKProvider } from './codex-sdk';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';
import type { OpenAICodexSDKConfig } from './codex-sdk';

const CODEX_AUTH_FILENAME = 'auth.json';
const CODEX_DEFAULT_PROVIDERS_CACHE_EVICTION_GRACE_MS = 60_000;
const CODEX_DEFAULT_PROVIDERS_CACHE_MAX_ENTRIES = 32;
const CODEX_DEFAULT_PROVIDERS_CACHE_HMAC_CONTEXT = 'promptfoo:codex-default-provider-cache-key';
const CODEX_DEFAULT_PROVIDERS_CACHE_HMAC_KEY = randomBytes(32);
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

type CodexDefaultProviders = Pick<
  DefaultProviders,
  | 'gradingJsonProvider'
  | 'gradingProvider'
  | 'llmRubricProvider'
  | 'suggestionsProvider'
  | 'synthesizeProvider'
  | 'webSearchProvider'
>;

type CodexDefaultProviderBundle = {
  gradingJsonProvider: OpenAICodexSDKProvider;
  gradingProvider: OpenAICodexSDKProvider;
  llmRubricProvider: OpenAICodexSDKProvider;
  suggestionsProvider: OpenAICodexSDKProvider;
  synthesizeProvider: OpenAICodexSDKProvider;
  webSearchProvider: OpenAICodexSDKProvider;
};

// Bundle lifecycle (FSM):
//   active           → shutdownRequested = false (live in cache map)
//   eviction-pending → shutdownRequested = true,  activeCalls > 0  (no timer)
//   grace-pending    → shutdownRequested = true,  activeCalls = 0, shutdownTimer set
//   shutting-down    → shutdownPromise   set
//   resurrected      → after shutdown, a held reference re-enters via callApi:
//                      shutdownRequested = false, shutdownPromise = undefined,
//                      providers re-registered with providerRegistry.
//   cancelled        → only set by tests via clearCodexDefaultProvidersForTesting;
//                      blocks any further timer arming or shutdown.
type ManagedCodexDefaultProviderBundle = CodexDefaultProviderBundle & {
  activeCalls: number;
  cancelled: boolean;
  shutdownPromise?: Promise<void>;
  shutdownRequested: boolean;
  shutdownTimer?: ReturnType<typeof setTimeout>;
};

const codexDefaultProvidersByCacheKey = new Map<string, ManagedCodexDefaultProviderBundle>();
const evictedCodexDefaultProviderBundles = new Set<ManagedCodexDefaultProviderBundle>();

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
  const authPath = path.join(getCodexHome(env), CODEX_AUTH_FILENAME);
  try {
    const stats = fs.statSync(authPath);
    return stats.isFile() && stats.size > 0;
  } catch (err) {
    // ENOENT/ENOTDIR are the expected "no Codex login yet" cases. Anything else
    // (EACCES on a chmod'd ~/.codex, ELOOP, EIO) silently routes the user to the
    // OpenAI fallback with no breadcrumb — surface it at debug.
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      logger.debug('[CodexDefaults] Could not stat Codex auth file', { authPath, code, err });
    }
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
  // Mirrors OpenAICodexSDKProvider.getApiKey(): either CODEX_API_KEY or OPENAI_API_KEY
  // can authenticate Codex calls. Keep these in sync with the cache key partitioning in
  // getCodexDefaultProvidersCacheKey() so callers that gate on this helper are consistent
  // with what actually reaches the provider.
  const hasApiKey = Boolean(
    getCodexEnvString(env, 'CODEX_API_KEY') || getCodexEnvString(env, 'OPENAI_API_KEY'),
  );
  return (hasApiKey || hasCodexAuthFile(env)) && canLoadCodexSdkPackage();
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

function getSecretCacheFingerprint(value: string | undefined): string | undefined {
  return value
    ? createHmac('sha256', CODEX_DEFAULT_PROVIDERS_CACHE_HMAC_KEY)
        .update(CODEX_DEFAULT_PROVIDERS_CACHE_HMAC_CONTEXT)
        .update('\0')
        .update(value)
        .digest('hex')
    : undefined;
}

function getCodexDefaultProvidersCacheKey(env?: EnvOverrides): string {
  const codexApiKey = getCodexEnvString(env, 'CODEX_API_KEY');
  const openAiApiKey = getCodexEnvString(env, 'OPENAI_API_KEY');

  return JSON.stringify({
    CODEX_HOME: getCodexEnvString(env, 'CODEX_HOME'),
    codexApiKeyFingerprint: getSecretCacheFingerprint(codexApiKey),
    hasCodexApiKey: Boolean(codexApiKey),
    hasOpenAiApiKey: Boolean(openAiApiKey),
    openAiApiKeyFingerprint: getSecretCacheFingerprint(openAiApiKey),
  });
}

function getUniqueCodexDefaultProviders(
  providers: CodexDefaultProviderBundle,
): OpenAICodexSDKProvider[] {
  return Array.from(
    new Set([
      providers.gradingJsonProvider,
      providers.gradingProvider,
      providers.llmRubricProvider,
      providers.suggestionsProvider,
      providers.synthesizeProvider,
      providers.webSearchProvider,
    ]),
  );
}

// True only when the bundle is eligible to advance toward shutdown: a shutdown was
// requested, no calls are in flight, no shutdown is already in progress, and the bundle
// has not been cancelled by test cleanup.
function canActOnShutdown(providers: ManagedCodexDefaultProviderBundle): boolean {
  return (
    !providers.cancelled &&
    providers.shutdownRequested &&
    providers.activeCalls === 0 &&
    !providers.shutdownPromise
  );
}

function shutdownCodexDefaultProviderBundle(providers: ManagedCodexDefaultProviderBundle): void {
  if (!canActOnShutdown(providers)) {
    return;
  }

  providers.shutdownPromise = Promise.all(
    getUniqueCodexDefaultProviders(providers).map((provider) =>
      provider.shutdown().catch((error) => {
        logger.warn('[CodexDefaults] Error shutting down evicted provider', { error });
      }),
    ),
  )
    .then(() => undefined)
    .finally(() => {
      evictedCodexDefaultProviderBundles.delete(providers);
    });
}

function clearCodexDefaultProviderShutdownTimer(
  providers: ManagedCodexDefaultProviderBundle,
): void {
  if (providers.shutdownTimer) {
    clearTimeout(providers.shutdownTimer);
    providers.shutdownTimer = undefined;
  }
}

function scheduleCodexDefaultProviderBundleShutdown(
  providers: ManagedCodexDefaultProviderBundle,
): void {
  if (!canActOnShutdown(providers) || providers.shutdownTimer) {
    return;
  }

  providers.shutdownTimer = setTimeout(() => {
    providers.shutdownTimer = undefined;
    shutdownCodexDefaultProviderBundle(providers);
  }, CODEX_DEFAULT_PROVIDERS_CACHE_EVICTION_GRACE_MS);
}

function requestCodexDefaultProviderBundleShutdown(
  providers: ManagedCodexDefaultProviderBundle,
): void {
  if (providers.cancelled) {
    return;
  }
  providers.shutdownRequested = true;
  // Track in evictedCodexDefaultProviderBundles before scheduling so
  // clearCodexDefaultProvidersForTesting finds the bundle even when activeCalls > 0
  // defers the timer.
  evictedCodexDefaultProviderBundles.add(providers);
  scheduleCodexDefaultProviderBundleShutdown(providers);
}

async function resurrectCodexDefaultProviderBundle(
  providers: ManagedCodexDefaultProviderBundle,
): Promise<void> {
  // Wait for any in-flight teardown to settle, then re-register: shutdown() unregistered
  // each provider from providerRegistry, so without this the Codex CLI subprocesses
  // created on the next callApi would never be torn down by providerRegistry.shutdownAll().
  await providers.shutdownPromise;
  if (providers.cancelled) {
    return;
  }
  for (const provider of getUniqueCodexDefaultProviders(providers)) {
    providerRegistry.register(provider);
  }
  providers.shutdownPromise = undefined;
  providers.shutdownRequested = false;
  evictedCodexDefaultProviderBundles.delete(providers);
}

function trackCodexDefaultProviderUsage(providers: ManagedCodexDefaultProviderBundle): void {
  for (const provider of getUniqueCodexDefaultProviders(providers)) {
    const callApi = provider.callApi.bind(provider);
    provider.callApi = async (...args) => {
      // If the bundle was shut down (or is mid-shutdown) but a holder still has a
      // reference, resurrect it so the call proceeds against re-registered providers.
      if (providers.shutdownPromise) {
        await resurrectCodexDefaultProviderBundle(providers);
      }
      clearCodexDefaultProviderShutdownTimer(providers);
      providers.activeCalls += 1;
      try {
        return await callApi(...args);
      } finally {
        providers.activeCalls -= 1;
        // scheduleCodexDefaultProviderBundleShutdown short-circuits on cancelled and
        // on !shutdownRequested, so we don't need to re-check those here.
        scheduleCodexDefaultProviderBundleShutdown(providers);
      }
    };
  }
}

function cacheCodexDefaultProviders(
  cacheKey: string,
  providers: ManagedCodexDefaultProviderBundle,
): ManagedCodexDefaultProviderBundle {
  codexDefaultProvidersByCacheKey.set(cacheKey, providers);

  while (codexDefaultProvidersByCacheKey.size > CODEX_DEFAULT_PROVIDERS_CACHE_MAX_ENTRIES) {
    const oldestEntry = codexDefaultProvidersByCacheKey.entries().next().value;
    if (!oldestEntry) {
      break;
    }
    const [oldestCacheKey, oldestProviders] = oldestEntry;
    codexDefaultProvidersByCacheKey.delete(oldestCacheKey);
    requestCodexDefaultProviderBundleShutdown(oldestProviders);
  }

  return providers;
}

export function getCodexDefaultProviders(env?: EnvOverrides): CodexDefaultProviders {
  const cacheKey = getCodexDefaultProvidersCacheKey(env);
  const cachedProviders = codexDefaultProvidersByCacheKey.get(cacheKey);
  if (cachedProviders) {
    codexDefaultProvidersByCacheKey.delete(cacheKey);
    codexDefaultProvidersByCacheKey.set(cacheKey, cachedProviders);
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

  const providers: ManagedCodexDefaultProviderBundle = {
    activeCalls: 0,
    cancelled: false,
    gradingJsonProvider,
    gradingProvider,
    llmRubricProvider: gradingJsonProvider,
    shutdownRequested: false,
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
    webSearchProvider,
  };
  trackCodexDefaultProviderUsage(providers);
  return cacheCodexDefaultProviders(cacheKey, providers);
}

export function clearCodexDefaultProvidersForTesting(): void {
  // Mark every tracked bundle cancelled so any in-flight callApi finally blocks cannot
  // re-arm a shutdown timer after cleanup. Use a Set to dedupe in case a bundle appears
  // in both the live cache and the evicted set.
  const trackedBundles = new Set<ManagedCodexDefaultProviderBundle>([
    ...codexDefaultProvidersByCacheKey.values(),
    ...evictedCodexDefaultProviderBundles,
  ]);
  for (const providers of trackedBundles) {
    providers.cancelled = true;
    clearCodexDefaultProviderShutdownTimer(providers);
  }
  codexDefaultProvidersByCacheKey.clear();
  evictedCodexDefaultProviderBundles.clear();
  codexSdkAvailabilityByBaseDir.clear();
  codexDefaultWorkingDir = undefined;
}
