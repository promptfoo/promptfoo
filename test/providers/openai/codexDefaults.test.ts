import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../../src/providers/providerRegistry';

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

  it('does not include raw API credentials in the provider cache key', async () => {
    const { getCodexDefaultProviders } = await import(
      '../../../src/providers/openai/codexDefaults'
    );

    process.env.CODEX_API_KEY = 'first-codex-key';
    const firstProviders = getCodexDefaultProviders();

    process.env.CODEX_API_KEY = 'second-codex-key';
    const secondProviders = getCodexDefaultProviders();

    expect(secondProviders).toBe(firstProviders);
    expect((secondProviders.gradingProvider as OpenAICodexSDKProvider).getApiKey()).toBe(
      'second-codex-key',
    );
  });
});
