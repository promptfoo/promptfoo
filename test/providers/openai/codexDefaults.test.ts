import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { createDeferred, mockProcessEnv } from '../../util/utils';

import type { OpenAICodexSDKProvider } from '../../../src/providers/openai/codex-sdk';

type CodexProviderBundle = {
  gradingProvider: OpenAICodexSDKProvider;
  gradingJsonProvider: OpenAICodexSDKProvider;
  webSearchProvider: OpenAICodexSDKProvider;
};

// Each new bundle replaces the LRU's oldest entry once we add 32 keys, so the loop
// below evicts whichever bundle was most recently used before the loop started.
function fillCacheToOverflow(getProviders: (env: { CODEX_API_KEY: string }) => unknown): void {
  for (let index = 1; index <= 32; index++) {
    getProviders({ CODEX_API_KEY: `codex-key-${index}` });
  }
}

function spyAndStubShutdowns(providers: CodexProviderBundle): {
  grading: ReturnType<typeof vi.spyOn>;
  gradingJson: ReturnType<typeof vi.spyOn>;
  webSearch: ReturnType<typeof vi.spyOn>;
} {
  return {
    grading: vi.spyOn(providers.gradingProvider, 'shutdown').mockResolvedValue(undefined),
    gradingJson: vi.spyOn(providers.gradingJsonProvider, 'shutdown').mockResolvedValue(undefined),
    webSearch: vi.spyOn(providers.webSearchProvider, 'shutdown').mockResolvedValue(undefined),
  };
}

const mockGetDirectory = vi.hoisted(() => vi.fn(() => process.cwd()));
const mockResolvePackageEntryPoint = vi.hoisted(() =>
  vi.fn<(packageName: string, baseDir: string) => string | null>(() => '/tmp/codex-sdk/index.js'),
);

vi.mock('../../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/esm')>()),
  getDirectory: mockGetDirectory,
  resolvePackageEntryPoint: mockResolvePackageEntryPoint,
}));

describe('Codex default providers', () => {
  let codexHome: string;
  let originalCodexApiKey: string | undefined;
  let originalCodexHome: string | undefined;
  let originalOpenAiApiKey: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetDirectory.mockReset();
    mockResolvePackageEntryPoint.mockReset();
    mockGetDirectory.mockReturnValue(process.cwd());
    mockResolvePackageEntryPoint.mockReturnValue('/tmp/codex-sdk/index.js');

    originalCodexApiKey = process.env.CODEX_API_KEY;
    originalCodexHome = process.env.CODEX_HOME;
    originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    mockProcessEnv({ CODEX_API_KEY: undefined });
    mockProcessEnv({ OPENAI_API_KEY: undefined });

    codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-defaults-'));
    mockProcessEnv({ CODEX_HOME: codexHome });

    const { clearCodexDefaultProvidersForTesting } = await import(
      '../../../src/providers/openai/codexDefaults'
    );
    clearCodexDefaultProvidersForTesting();
  });

  afterEach(async () => {
    const { clearCodexDefaultProvidersForTesting } = await import(
      '../../../src/providers/openai/codexDefaults'
    );
    clearCodexDefaultProvidersForTesting();
    await providerRegistry.shutdownAll();
    vi.useRealTimers();
    vi.resetAllMocks();

    fs.rmSync(codexHome, { force: true, recursive: true });

    if (originalCodexApiKey === undefined) {
      mockProcessEnv({ CODEX_API_KEY: undefined });
    } else {
      mockProcessEnv({ CODEX_API_KEY: originalCodexApiKey });
    }

    if (originalCodexHome === undefined) {
      mockProcessEnv({ CODEX_HOME: undefined });
    } else {
      mockProcessEnv({ CODEX_HOME: originalCodexHome });
    }

    if (originalOpenAiApiKey === undefined) {
      mockProcessEnv({ OPENAI_API_KEY: undefined });
    } else {
      mockProcessEnv({ OPENAI_API_KEY: originalOpenAiApiKey });
    }
  });

  it('returns true when CODEX_API_KEY exists and the Codex SDK package can be resolved', async () => {
    mockProcessEnv({ CODEX_API_KEY: 'test-codex-key' });

    const { hasCodexDefaultCredentials } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    expect(hasCodexDefaultCredentials()).toBe(true);
  });

  it('returns true when Codex auth state exists and the Codex SDK package can be resolved', async () => {
    fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"ok":true}');

    const { hasCodexDefaultCredentials } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    expect(hasCodexDefaultCredentials()).toBe(true);
  });

  it('returns false when Codex auth state exists but the Codex SDK package cannot be resolved', async () => {
    fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"ok":true}');
    mockResolvePackageEntryPoint.mockReturnValue(null);

    const { hasCodexDefaultCredentials } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    expect(hasCodexDefaultCredentials()).toBe(false);
  });

  it('returns false when neither CODEX_API_KEY nor Codex auth state exists', async () => {
    const { hasCodexDefaultCredentials } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    expect(hasCodexDefaultCredentials()).toBe(false);
  });

  it('creates reusable Codex text and web-search providers with a read-only sandbox', async () => {
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    const providers = getCodexDefaultProviders();
    const cachedProviders = getCodexDefaultProviders();

    expect(cachedProviders).toBe(providers);
    expect(providers.gradingProvider.id()).toBe('openai:codex-sdk');
    expect(providers.gradingJsonProvider.id()).toBe('openai:codex-sdk');
    expect(providers.llmRubricProvider?.id()).toBe('openai:codex-sdk');
    expect(providers.suggestionsProvider).toBe(providers.gradingProvider);
    expect(providers.synthesizeProvider).toBe(providers.gradingProvider);
    expect(providers.gradingProvider.config).toMatchObject({
      approval_policy: 'never',
      cli_env: {
        CODEX_HOME: codexHome,
      },
      sandbox_mode: 'read-only',
      skip_git_repo_check: true,
    });
    expect(providers.gradingProvider.config.working_dir).toMatch(/promptfoo-codex-default-/);
    expect(providers.gradingProvider.config.working_dir).not.toBe(
      path.join(os.tmpdir(), 'promptfoo-codex-default'),
    );
    expect(providers.gradingJsonProvider.config.working_dir).toBe(
      providers.gradingProvider.config.working_dir,
    );
    expect(providers.gradingJsonProvider.config.output_schema).toEqual({
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
    });
    expect(providers.webSearchProvider?.config).toMatchObject({
      network_access_enabled: true,
      working_dir: providers.gradingProvider.config.working_dir,
      web_search_mode: 'live',
    });
  });

  it('isolates cached default providers by process API credential without using raw keys in cache keys', async () => {
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    mockProcessEnv({ CODEX_API_KEY: 'first-codex-key' });
    const firstProviders = getCodexDefaultProviders();
    expect((firstProviders.gradingProvider as OpenAICodexSDKProvider).apiKey).toBe(
      'first-codex-key',
    );

    mockProcessEnv({ CODEX_API_KEY: 'second-codex-key' });
    const secondProviders = getCodexDefaultProviders();

    expect(secondProviders).not.toBe(firstProviders);
    expect((secondProviders.gradingProvider as OpenAICodexSDKProvider).apiKey).toBe(
      'second-codex-key',
    );
    expect((secondProviders.gradingProvider as OpenAICodexSDKProvider).getApiKey()).toBe(
      'second-codex-key',
    );
  });

  it('isolates cached default providers by process OpenAI API credential', async () => {
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    mockProcessEnv({ OPENAI_API_KEY: 'first-openai-key' });
    const firstProviders = getCodexDefaultProviders();
    expect((firstProviders.gradingProvider as OpenAICodexSDKProvider).getApiKey()).toBe(
      'first-openai-key',
    );

    mockProcessEnv({ OPENAI_API_KEY: 'second-openai-key' });
    const secondProviders = getCodexDefaultProviders();

    expect(secondProviders).not.toBe(firstProviders);
    expect((secondProviders.gradingProvider as OpenAICodexSDKProvider).getApiKey()).toBe(
      'second-openai-key',
    );
  });

  it('isolates cached default providers by env override API credential', async () => {
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    const firstProviders = getCodexDefaultProviders({ CODEX_API_KEY: 'first-codex-key' });
    const firstProvidersAgain = getCodexDefaultProviders({ CODEX_API_KEY: 'first-codex-key' });
    const secondProviders = getCodexDefaultProviders({ CODEX_API_KEY: 'second-codex-key' });

    expect(firstProvidersAgain).toBe(firstProviders);
    expect(secondProviders).not.toBe(firstProviders);
    expect((firstProviders.gradingProvider as OpenAICodexSDKProvider).getApiKey()).toBe(
      'first-codex-key',
    );
    expect((secondProviders.gradingProvider as OpenAICodexSDKProvider).getApiKey()).toBe(
      'second-codex-key',
    );
  });

  it('evicts and shuts down idle least-recently-used cached providers when credentials rotate', async () => {
    vi.useFakeTimers();

    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    const firstProviders = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-key-0' });
    const firstGradingShutdown = vi.spyOn(
      firstProviders.gradingProvider as OpenAICodexSDKProvider,
      'shutdown',
    );
    const firstGradingJsonShutdown = vi.spyOn(
      firstProviders.gradingJsonProvider as OpenAICodexSDKProvider,
      'shutdown',
    );
    const firstWebSearchShutdown = vi.spyOn(
      firstProviders.webSearchProvider as OpenAICodexSDKProvider,
      'shutdown',
    );

    fillCacheToOverflow(getCodexDefaultProviders);

    expect(firstGradingShutdown).not.toHaveBeenCalled();
    expect(firstGradingJsonShutdown).not.toHaveBeenCalled();
    expect(firstWebSearchShutdown).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(firstGradingShutdown).toHaveBeenCalledTimes(1);
    expect(firstGradingJsonShutdown).toHaveBeenCalledTimes(1);
    expect(firstWebSearchShutdown).toHaveBeenCalledTimes(1);

    const recachedFirstProviders = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-key-0' });
    expect(recachedFirstProviders).not.toBe(firstProviders);
  });

  it('defers evicted provider shutdown until in-flight calls finish', async () => {
    vi.useFakeTimers();

    const { OpenAICodexSDKProvider } = await import('../../../src/providers/openai/codex-sdk');
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    const inFlightCall = createDeferred<any>();
    const callApiSpy = vi
      .spyOn(OpenAICodexSDKProvider.prototype, 'callApi')
      .mockImplementation(() => inFlightCall.promise);

    const firstProviders = getCodexDefaultProviders({
      CODEX_API_KEY: 'codex-key-0',
    }) as unknown as CodexProviderBundle;
    const shutdowns = spyAndStubShutdowns(firstProviders);

    const resultPromise = firstProviders.gradingProvider.callApi('test prompt');

    fillCacheToOverflow(getCodexDefaultProviders);

    expect(shutdowns.grading).not.toHaveBeenCalled();
    expect(shutdowns.gradingJson).not.toHaveBeenCalled();
    expect(shutdowns.webSearch).not.toHaveBeenCalled();

    inFlightCall.resolve({ output: 'ok' });
    await expect(resultPromise).resolves.toEqual({ output: 'ok' });

    expect(shutdowns.grading).not.toHaveBeenCalled();
    expect(shutdowns.gradingJson).not.toHaveBeenCalled();
    expect(shutdowns.webSearch).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(shutdowns.grading).toHaveBeenCalledTimes(1);
    expect(shutdowns.gradingJson).toHaveBeenCalledTimes(1);
    expect(shutdowns.webSearch).toHaveBeenCalledTimes(1);
    expect(callApiSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps evicted providers usable for sequential calls before the eviction grace period elapses', async () => {
    vi.useFakeTimers();

    const { OpenAICodexSDKProvider } = await import('../../../src/providers/openai/codex-sdk');
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    const callApiSpy = vi
      .spyOn(OpenAICodexSDKProvider.prototype, 'callApi')
      .mockResolvedValue({ output: 'ok' });

    const firstProviders = getCodexDefaultProviders({
      CODEX_API_KEY: 'codex-key-0',
    }) as unknown as CodexProviderBundle;
    const shutdowns = spyAndStubShutdowns(firstProviders);

    fillCacheToOverflow(getCodexDefaultProviders);

    await expect(firstProviders.gradingProvider.callApi('first prompt')).resolves.toEqual({
      output: 'ok',
    });
    await expect(firstProviders.gradingProvider.callApi('second prompt')).resolves.toEqual({
      output: 'ok',
    });

    expect(shutdowns.grading).not.toHaveBeenCalled();
    expect(shutdowns.gradingJson).not.toHaveBeenCalled();
    expect(shutdowns.webSearch).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(shutdowns.grading).toHaveBeenCalledTimes(1);
    expect(shutdowns.gradingJson).toHaveBeenCalledTimes(1);
    expect(shutdowns.webSearch).toHaveBeenCalledTimes(1);
    expect(callApiSpy).toHaveBeenCalledTimes(2);
  });

  it('returns true when only OPENAI_API_KEY is set, mirroring the provider api-key resolution', async () => {
    mockProcessEnv({ CODEX_API_KEY: undefined, OPENAI_API_KEY: 'openai-only-key' });

    const { hasCodexDefaultCredentials } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    expect(hasCodexDefaultCredentials()).toBe(true);
  });

  it('resurrects providers that received a callApi after eviction shutdown completed', async () => {
    vi.useFakeTimers();

    const { OpenAICodexSDKProvider } = await import('../../../src/providers/openai/codex-sdk');
    const { providerRegistry: registry } = await import('../../../src/providers/providerRegistry');
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    const callApiSpy = vi
      .spyOn(OpenAICodexSDKProvider.prototype, 'callApi')
      .mockResolvedValue({ output: 'ok' });
    const registerSpy = vi.spyOn(registry, 'register');

    const firstProviders = getCodexDefaultProviders({
      CODEX_API_KEY: 'codex-key-0',
    }) as unknown as CodexProviderBundle;
    const shutdowns = spyAndStubShutdowns(firstProviders);

    fillCacheToOverflow(getCodexDefaultProviders);

    // Drain the grace timer so eviction shutdown actually fires (mocked) before we
    // attempt to use the provider again.
    await vi.runOnlyPendingTimersAsync();
    expect(shutdowns.grading).toHaveBeenCalledTimes(1);
    expect(shutdowns.gradingJson).toHaveBeenCalledTimes(1);
    expect(shutdowns.webSearch).toHaveBeenCalledTimes(1);

    registerSpy.mockClear();

    // Holder still has firstProviders.gradingProvider — the wrapped callApi must wait
    // for the in-flight shutdown to settle, re-register the providers, and forward the
    // call rather than returning a zombie response.
    await expect(firstProviders.gradingProvider.callApi('post-shutdown prompt')).resolves.toEqual({
      output: 'ok',
    });

    expect(callApiSpy).toHaveBeenCalledWith('post-shutdown prompt');
    // Re-registration covers the unique providers (grading, gradingJson, webSearch).
    expect(registerSpy).toHaveBeenCalledTimes(3);
    const reregistered = new Set<unknown>(registerSpy.mock.calls.map((call) => call[0]));
    expect(reregistered.has(firstProviders.gradingProvider)).toBe(true);
    expect(reregistered.has(firstProviders.gradingJsonProvider)).toBe(true);
    expect(reregistered.has(firstProviders.webSearchProvider)).toBe(true);
  });

  it('does not re-arm an eviction timer after clearCodexDefaultProvidersForTesting', async () => {
    vi.useFakeTimers();

    const { OpenAICodexSDKProvider } = await import('../../../src/providers/openai/codex-sdk');
    const { clearCodexDefaultProvidersForTesting, getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    const inFlightCall = createDeferred<any>();
    vi.spyOn(OpenAICodexSDKProvider.prototype, 'callApi').mockImplementation(
      () => inFlightCall.promise,
    );

    const firstProviders = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-key-0' });
    const firstGradingShutdown = vi
      .spyOn(firstProviders.gradingProvider as OpenAICodexSDKProvider, 'shutdown')
      .mockResolvedValue(undefined);

    // Start a call that will keep activeCalls > 0 across the eviction.
    const inFlightPromise = firstProviders.gradingProvider.callApi('long prompt');

    fillCacheToOverflow(getCodexDefaultProviders);

    // Cleanup before the in-flight call completes — this is the brittle window.
    clearCodexDefaultProvidersForTesting();

    // Resolve the in-flight call. The wrapper finally must NOT re-arm a shutdown timer.
    inFlightCall.resolve({ output: 'late' });
    await expect(inFlightPromise).resolves.toEqual({ output: 'late' });

    // No pending timers — confirms scheduleCodexDefaultProviderBundleShutdown's
    // cancelled guard kept the finally block from re-arming a timer.
    expect(vi.getTimerCount()).toBe(0);
    await vi.runOnlyPendingTimersAsync();
    expect(firstGradingShutdown).not.toHaveBeenCalled();
  });

  it('partitions cache by the resolved api key, not by every raw credential slot', async () => {
    // OPENAI_API_KEY takes precedence in OpenAICodexSDKProvider.getApiKey(), so two
    // env-overrides that differ only in the (ignored) CODEX_API_KEY fallback resolve
    // to the same effective credential and must hit the same cached bundle.
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    mockProcessEnv({ OPENAI_API_KEY: 'shared-openai-key' });

    const first = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-A' });
    const second = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-B' });
    expect(second).toBe(first);

    // Rotating the OPENAI key (the resolved credential) does invalidate the cache.
    mockProcessEnv({ OPENAI_API_KEY: 'rotated-openai-key' });
    const third = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-A' });
    expect(third).not.toBe(first);
  });

  it('keeps resurrected bundles bounded by re-entering eviction-pending after their next idle', async () => {
    // Without this, a held reference that survives eviction would live indefinitely
    // outside both the LRU map and the eviction set, defeating the cache-size bound for
    // long-running processes.
    vi.useFakeTimers();

    const { OpenAICodexSDKProvider } = await import('../../../src/providers/openai/codex-sdk');
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    vi.spyOn(OpenAICodexSDKProvider.prototype, 'callApi').mockResolvedValue({ output: 'ok' });

    const firstProviders = getCodexDefaultProviders({
      CODEX_API_KEY: 'codex-key-0',
    }) as unknown as CodexProviderBundle;
    const shutdowns = spyAndStubShutdowns(firstProviders);

    fillCacheToOverflow(getCodexDefaultProviders);

    // First eviction shutdown.
    await vi.runOnlyPendingTimersAsync();
    expect(shutdowns.grading).toHaveBeenCalledTimes(1);

    // Resurrection via held reference.
    await firstProviders.gradingProvider.callApi('post-shutdown prompt');

    // After the call finishes, the wrapper's finally must have re-armed a shutdown
    // timer; running it should fire shutdown a second time on the same bundle, proving
    // the resurrected bundle did not escape the cleanup path.
    await vi.runOnlyPendingTimersAsync();
    expect(shutdowns.grading).toHaveBeenCalledTimes(2);
    expect(shutdowns.gradingJson).toHaveBeenCalledTimes(2);
    expect(shutdowns.webSearch).toHaveBeenCalledTimes(2);
  });
});
