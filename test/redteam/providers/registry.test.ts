import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProviderFactories } from '../../../src/providers/registry';
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

  afterEach(() => {
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

  // Route every case through getProviderFactories so a regression in
  // isRedteamProviderPath (the canHandle predicate in src/providers/registry)
  // fails the corresponding row instead of silently passing because the
  // isolated factory array still matched. Without this, a tightened prefix
  // (e.g. `promptfoo:redteam:attack:`) could break real dispatch for 12 of
  // 14 paths while leaving these tests green.
  it.each(cases)('$path dispatches via getProviderFactories', async ({ path, expectedId }) => {
    const factories = await getProviderFactories(path);
    const factory = factories.find((f) => f.test(path));
    expect(factory, `Missing factory for ${path} via getProviderFactories`).toBeDefined();

    const provider = await factory!.create(path, mockProviderOptions, mockContext);
    expect(provider.id()).toEqual(expectedId);
  });

  it('rejects unknown redteam paths', async () => {
    // Unknown redteam-shaped IDs still take the family-load branch via
    // canHandle (the prefix matches), so we route through getProviderFactories
    // to confirm no factory claims them at that boundary either.
    const factories = await getProviderFactories('promptfoo:redteam:does-not-exist');
    const factory = factories.find((f) => f.test('promptfoo:redteam:does-not-exist'));
    expect(factory).toBeUndefined();
  });

  it('redteamProviderFactories array and getProviderFactories agree on the handled set', async () => {
    // Pin equivalence between the exported array (tested directly by
    // withErrorContext cases below) and the registry-boundary view. A
    // regression where the family stopped returning the full array would be
    // caught here without having to invert the per-path loop.
    const factories = await getProviderFactories('promptfoo:redteam:crescendo');
    for (const redteamFactory of redteamProviderFactories) {
      expect(factories).toContain(redteamFactory);
    }
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

      const brokenConfig: ProviderOptions = {
        id: 'test-provider',
        config: {},
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

    it('wraps dynamic-import failures with the requested provider path', async () => {
      // The withErrorContext docstring specifically calls out dynamic-import
      // failures as the motivating case, but only the constructor leg was
      // previously covered. This test simulates the canonical Node ESM
      // resolution error shape (ERR_MODULE_NOT_FOUND) to pin that the
      // wrapper tags it with the requested provider path and preserves the
      // original error via { cause } so the caller can still inspect .code.
      const wrapped = withErrorContext({
        test: (p) => p === 'fake:bad-import',
        create: async () => {
          const err = new Error("Cannot find module './missing'") as Error & { code?: string };
          err.code = 'ERR_MODULE_NOT_FOUND';
          throw err;
        },
      });

      let caught: unknown;
      try {
        await wrapped.create('fake:bad-import', { id: 'x', config: {} }, mockContext);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain(
        "Failed to load redteam provider 'fake:bad-import'",
      );
      expect((caught as Error).message).toContain('Cannot find module');
      const cause = (caught as Error).cause as Error & { code?: string };
      expect(cause).toBeInstanceOf(Error);
      expect(cause.code).toBe('ERR_MODULE_NOT_FOUND');
    });
  });
});
