import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  redteamProviderFactories,
  withErrorContext,
} from '../../../src/redteam/providers/registry';

import type { LoadApiProviderContext } from '../../../src/types/index';
import type { ProviderOptions } from '../../../src/types/providers';

// Hydra and iterative:meta require remote generation to be enabled;
// authoritative-markup-injection requires it to NOT be explicitly disabled.
// Stub both so every factory's create() body actually runs end-to-end.
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/redteam/remoteGeneration')>();
  return {
    ...mod,
    shouldGenerateRemote: vi.fn(() => true),
    neverGenerateRemote: vi.fn(() => false),
  };
});

describe('redteamProviderFactories', () => {
  const mockProviderOptions: ProviderOptions = {
    id: 'test-provider',
    label: 'Test Provider',
    config: {
      injectVar: 'test',
      maxTurns: 3,
      maxBacktracks: 2,
      redteamProvider: 'test-provider',
      strategyText: 'test-strategy',
    },
  };

  const mockContext: LoadApiProviderContext = {
    basePath: '/test',
    options: mockProviderOptions,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cases: Array<{ path: string; expectedId: string }> = [
    { path: 'agentic:memory-poisoning', expectedId: 'promptfoo:redteam:agentic:memory-poisoning' },
    {
      path: 'promptfoo:redteam:authoritative-markup-injection',
      expectedId: 'promptfoo:redteam:authoritative-markup-injection',
    },
    { path: 'promptfoo:redteam:best-of-n', expectedId: 'promptfoo:redteam:best-of-n' },
    { path: 'promptfoo:redteam:crescendo', expectedId: 'promptfoo:redteam:crescendo' },
    { path: 'promptfoo:redteam:custom', expectedId: 'promptfoo:redteam:custom' },
    { path: 'promptfoo:redteam:custom:my-strategy', expectedId: 'promptfoo:redteam:custom' },
    { path: 'promptfoo:redteam:goat', expectedId: 'promptfoo:redteam:goat' },
    { path: 'promptfoo:redteam:hydra', expectedId: 'promptfoo:redteam:hydra' },
    {
      path: 'promptfoo:redteam:indirect-web-pwn',
      expectedId: 'promptfoo:redteam:indirect-web-pwn',
    },
    { path: 'promptfoo:redteam:iterative', expectedId: 'promptfoo:redteam:iterative' },
    { path: 'promptfoo:redteam:iterative:image', expectedId: 'promptfoo:redteam:iterative:image' },
    { path: 'promptfoo:redteam:iterative:meta', expectedId: 'promptfoo:redteam:iterative:meta' },
    { path: 'promptfoo:redteam:iterative:tree', expectedId: 'promptfoo:redteam:iterative:tree' },
    {
      path: 'promptfoo:redteam:mischievous-user',
      expectedId: 'promptfoo:redteam:mischievous-user',
    },
  ];

  it.each(cases)('$path instantiates via redteamProviderFactories', async ({
    path,
    expectedId,
  }) => {
    const factory = redteamProviderFactories.find((f) => f.test(path));
    expect(factory, `Missing factory for ${path}`).toBeDefined();

    const provider = await factory!.create(path, mockProviderOptions, mockContext);
    expect(provider).toBeDefined();
    expect(provider.id()).toEqual(expectedId);
  });

  it('rejects unknown redteam paths', () => {
    const factory = redteamProviderFactories.find((f) =>
      f.test('promptfoo:redteam:does-not-exist'),
    );
    expect(factory).toBeUndefined();
  });

  describe('isRedteamProviderPath contract', () => {
    // Sanity checks on the canHandle predicate used by src/providers/registry
    // to gate lazy loading. Pinning them here keeps a typo in the predicate
    // from silently breaking dispatch without a matching failing test.
    it.each([
      'agentic:memory-poisoning',
      'promptfoo:redteam:crescendo',
      'promptfoo:redteam:custom',
      'promptfoo:redteam:custom:my-strategy',
    ])('dispatches %s to at least one factory', (path) => {
      const factory = redteamProviderFactories.find((f) => f.test(path));
      expect(factory).toBeDefined();
    });

    it.each([
      'openai:gpt-4',
      'anthropic:claude-3',
      'agentic:other',
      'promptfoo:other',
      '',
    ])('does not dispatch %s', (path) => {
      const factory = redteamProviderFactories.find((f) => f.test(path));
      expect(factory).toBeUndefined();
    });
  });

  describe('withErrorContext', () => {
    it('wraps constructor failures with the requested provider path', async () => {
      const customPath = 'promptfoo:redteam:custom';
      const factory = redteamProviderFactories.find((f) => f.test(customPath));
      expect(factory).toBeDefined();

      const brokenConfig: ProviderOptions = {
        id: 'test-provider',
        config: {
          // intentionally missing strategyText
        },
      };

      await expect(factory!.create(customPath, brokenConfig, mockContext)).rejects.toThrow(
        /Failed to load redteam provider 'promptfoo:redteam:custom'.*strategyText/,
      );
    });

    it('preserves the original error via { cause }', async () => {
      const customPath = 'promptfoo:redteam:custom';
      const factory = redteamProviderFactories.find((f) => f.test(customPath));

      const brokenConfig: ProviderOptions = {
        id: 'test-provider',
        config: {},
      };

      let caught: unknown;
      try {
        await factory!.create(customPath, brokenConfig, mockContext);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).cause).toBeInstanceOf(Error);
    });

    it('handles non-Error throwables with a String() fallback', async () => {
      const wrapped = withErrorContext({
        test: (p) => p === 'fake:non-error',
        create: async () => {
          throw 'raw string thrown'; // eslint-disable-line no-throw-literal
        },
      });

      let caught: unknown;
      try {
        await wrapped.create('fake:non-error', { id: 'x', config: {} }, mockContext);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        "Failed to load redteam provider 'fake:non-error': raw string thrown",
      );
      // Non-Error throwables do not get a `cause` chain attached.
      expect((caught as Error).cause).toBeUndefined();
    });
  });
});
