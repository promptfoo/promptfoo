import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { createDeferred } from '../../util/utils';

import type { OpenAICodexSDKProvider } from '../../../src/providers/openai/codex-sdk';

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
    delete process.env.CODEX_API_KEY;
    delete process.env.OPENAI_API_KEY;

    codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-defaults-'));
    process.env.CODEX_HOME = codexHome;

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
      delete process.env.CODEX_API_KEY;
    } else {
      process.env.CODEX_API_KEY = originalCodexApiKey;
    }

    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }

    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
  });

  it('returns true when CODEX_API_KEY exists and the Codex SDK package can be resolved', async () => {
    process.env.CODEX_API_KEY = 'test-codex-key';

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

    process.env.CODEX_API_KEY = 'first-codex-key';
    const firstProviders = getCodexDefaultProviders();
    expect((firstProviders.gradingProvider as OpenAICodexSDKProvider).apiKey).toBe(
      'first-codex-key',
    );

    process.env.CODEX_API_KEY = 'second-codex-key';
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

    process.env.OPENAI_API_KEY = 'first-openai-key';
    const firstProviders = getCodexDefaultProviders();
    expect((firstProviders.gradingProvider as OpenAICodexSDKProvider).getApiKey()).toBe(
      'first-openai-key',
    );

    process.env.OPENAI_API_KEY = 'second-openai-key';
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

    for (let index = 1; index <= 32; index++) {
      getCodexDefaultProviders({ CODEX_API_KEY: `codex-key-${index}` });
    }

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

    const firstProviders = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-key-0' });
    const firstGradingShutdown = vi
      .spyOn(firstProviders.gradingProvider as OpenAICodexSDKProvider, 'shutdown')
      .mockResolvedValue(undefined);
    const firstGradingJsonShutdown = vi
      .spyOn(firstProviders.gradingJsonProvider as OpenAICodexSDKProvider, 'shutdown')
      .mockResolvedValue(undefined);
    const firstWebSearchShutdown = vi
      .spyOn(firstProviders.webSearchProvider as OpenAICodexSDKProvider, 'shutdown')
      .mockResolvedValue(undefined);

    const resultPromise = firstProviders.gradingProvider.callApi('test prompt');

    for (let index = 1; index <= 32; index++) {
      getCodexDefaultProviders({ CODEX_API_KEY: `codex-key-${index}` });
    }

    expect(firstGradingShutdown).not.toHaveBeenCalled();
    expect(firstGradingJsonShutdown).not.toHaveBeenCalled();
    expect(firstWebSearchShutdown).not.toHaveBeenCalled();

    inFlightCall.resolve({ output: 'ok' });
    await expect(resultPromise).resolves.toEqual({ output: 'ok' });

    expect(firstGradingShutdown).not.toHaveBeenCalled();
    expect(firstGradingJsonShutdown).not.toHaveBeenCalled();
    expect(firstWebSearchShutdown).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(firstGradingShutdown).toHaveBeenCalledTimes(1);
    expect(firstGradingJsonShutdown).toHaveBeenCalledTimes(1);
    expect(firstWebSearchShutdown).toHaveBeenCalledTimes(1);
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

    const firstProviders = getCodexDefaultProviders({ CODEX_API_KEY: 'codex-key-0' });
    const firstGradingShutdown = vi
      .spyOn(firstProviders.gradingProvider as OpenAICodexSDKProvider, 'shutdown')
      .mockResolvedValue(undefined);
    const firstGradingJsonShutdown = vi
      .spyOn(firstProviders.gradingJsonProvider as OpenAICodexSDKProvider, 'shutdown')
      .mockResolvedValue(undefined);
    const firstWebSearchShutdown = vi
      .spyOn(firstProviders.webSearchProvider as OpenAICodexSDKProvider, 'shutdown')
      .mockResolvedValue(undefined);

    for (let index = 1; index <= 32; index++) {
      getCodexDefaultProviders({ CODEX_API_KEY: `codex-key-${index}` });
    }

    await expect(firstProviders.gradingProvider.callApi('first prompt')).resolves.toEqual({
      output: 'ok',
    });
    await expect(firstProviders.gradingProvider.callApi('second prompt')).resolves.toEqual({
      output: 'ok',
    });

    expect(firstGradingShutdown).not.toHaveBeenCalled();
    expect(firstGradingJsonShutdown).not.toHaveBeenCalled();
    expect(firstWebSearchShutdown).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(firstGradingShutdown).toHaveBeenCalledTimes(1);
    expect(firstGradingJsonShutdown).toHaveBeenCalledTimes(1);
    expect(firstWebSearchShutdown).toHaveBeenCalledTimes(1);
    expect(callApiSpy).toHaveBeenCalledTimes(2);
  });
});
