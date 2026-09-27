import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Strategies } from '../../../src/redteam/strategies/index';

import type { StrategyRuntimeContext } from '../../../src/redteam/strategies/types';
import type { TestCaseWithPlugin } from '../../../src/types/index';

const inputs = { query: 'User question', document: 'Untrusted document' };
const example: TestCaseWithPlugin = {
  vars: { prompt: 'Synthetic objective', document: 'Context' },
  assert: [{ type: 'promptfoo:redteam:policy', metric: 'Policy' }],
  metadata: { pluginId: 'policy', pluginConfig: { inputs }, purpose: 'Synthetic QA' },
};

const layer = (
  tests: TestCaseWithPlugin[],
  config: Record<string, unknown>,
  runtimeContext?: StrategyRuntimeContext,
) =>
  Strategies.find((strategy) => strategy.id === 'layer')!.action(
    tests,
    'prompt',
    config,
    'layer',
    runtimeContext,
  );

describe('registered layer attack adapters', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    'hydra',
    'jailbreak:hydra',
    'promptfoo:redteam:hydra',
    'goblin',
    'crescendo',
    'goat',
    'jailbreak',
    'iterative',
    'jailbreak:meta',
    'promptfoo:redteam:iterative:meta',
    'jailbreak:tree',
  ])('preserves multi-input plugin context for %s', async (id) => {
    const result = await layer([example], { steps: [id] });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual(
      expect.objectContaining({ config: expect.objectContaining({ inputs }) }),
    );
    expect(result[0].vars).toEqual(example.vars);
    expect(result[0].metadata?.pluginConfig).toEqual({ inputs });
  });

  it.each(['hydra', 'jailbreak:hydra', 'promptfoo:redteam:hydra'])(
    'honors the registered strategy exclusion for layer alias %s',
    async (id) => {
      const excluded = {
        ...example,
        metadata: {
          ...example.metadata,
          pluginConfig: { inputs, excludeStrategies: ['jailbreak:hydra'] },
        },
      };

      expect(await layer([excluded], { steps: [id, 'audio'] })).toEqual([]);
    },
  );

  it('honors an exclusion written using the configured step alias', async () => {
    const excluded = {
      ...example,
      metadata: { ...example.metadata, pluginConfig: { excludeStrategies: ['hydra'] } },
    };

    expect(await layer([excluded], { steps: ['hydra'] })).toEqual([]);
  });

  it('excludes sequence providers and strategy-exempt plugins', async () => {
    const sequence = { ...example, provider: { id: 'sequence' } };
    const standalone = { ...example, metadata: { pluginId: 'system-prompt-override' } };

    expect(await layer([sequence, standalone], { steps: ['hydra'] })).toEqual([]);
  });

  it('uses step plugin targets ahead of outer targets', async () => {
    const harmful = { ...example, metadata: { ...example.metadata, pluginId: 'harmful:hate' } };
    const tests = [example, harmful];
    const outer = await layer(tests, { plugins: ['policy'], steps: ['hydra'] });
    const step = await layer(tests, {
      plugins: ['policy'],
      steps: [{ id: 'hydra', config: { plugins: ['harmful'] } }],
    });

    expect(outer.map((test) => test.metadata?.pluginId)).toEqual(['policy']);
    expect(step.map((test) => test.metadata?.pluginId)).toEqual(['harmful:hate']);
  });

  it.each(['custom:aggressive', 'promptfoo:redteam:custom:aggressive'])(
    'passes variant %s through the registered custom adapter',
    async (id) => {
      const result = await layer([example], { steps: [id, 'base64'] });

      expect(result[0].provider).toEqual({
        id: 'promptfoo:redteam:custom:aggressive',
        config: expect.objectContaining({ variant: 'aggressive', _perTurnLayers: ['base64'] }),
      });
      expect(result[0].assert?.[0]).toEqual(
        expect.objectContaining({ metric: 'Policy/Custom:aggressive' }),
      );
    },
  );

  it('preserves legacy iterative routing, layer metrics, config boundaries and caller data', async () => {
    const tests = [structuredClone(example), structuredClone(example)];
    const original = structuredClone(tests);
    const runtimeContext: StrategyRuntimeContext = {
      generationProviderSelection: {
        provider: { id: () => 'runtime-only', callApi: vi.fn(async () => ({ output: '' })) },
        source: 'explicit',
        persistableId: 'file://generator.mjs',
      },
      wrapGenerationProvider: vi.fn((provider) => provider),
    };
    const result = await layer(
      tests,
      {
        label: 'legacy',
        targetId: 'current-target',
        steps: [
          { id: 'jailbreak', config: { maxIterations: 2, targetId: 'stale-target' } },
          { id: 'base64', config: { nested: { preserve: true } } },
        ],
      },
      runtimeContext,
    );

    expect(result).toHaveLength(2);
    for (const test of result) {
      expect(test.provider).toEqual({
        id: 'promptfoo:redteam:iterative',
        config: expect.objectContaining({
          injectVar: 'prompt',
          scanId: '00000000-0000-4000-8000-000000000001',
          maxIterations: 2,
          targetId: 'current-target',
          redteamProvider: 'file://generator.mjs',
          _perTurnLayers: [{ id: 'base64', config: { nested: { preserve: true } } }],
        }),
      });
      expect(test.provider).not.toEqual(
        expect.objectContaining({ config: expect.objectContaining({ steps: expect.anything() }) }),
      );
      expect(test.assert?.[0]).toEqual(expect.objectContaining({ metric: 'Policy/Jailbreak' }));
      expect(test.metadata).toEqual(
        expect.objectContaining({
          strategyId: 'layer/legacy:jailbreak:jailbreak/base64',
          originalText: 'Synthetic objective',
        }),
      );
    }
    expect(tests).toEqual(original);
    expect(runtimeContext.wrapGenerationProvider).not.toHaveBeenCalled();
  });

  it.each(['crescendo', 'jailbreak:meta', 'custom:aggressive'])(
    'keeps nonpersistable provider credentials out of %s configs',
    async (id) => {
      const runtimeContext: StrategyRuntimeContext = {
        generationProviderSelection: {
          provider: { id: () => 'runtime-only', callApi: vi.fn(async () => ({ output: '' })) },
          source: 'explicit',
          localProviderSpec: { id: 'echo', config: { apiKey: 'synthetic-private-value' } },
        },
      };
      const result = await layer([example], { steps: [id] }, runtimeContext);

      expect(JSON.stringify(result)).not.toContain('synthetic-private-value');
      expect(result[0].provider).not.toEqual(
        expect.objectContaining({
          config: expect.objectContaining({ redteamProvider: expect.anything() }),
        }),
      );
    },
  );

  it.each(['hydra', 'jailbreak', 'custom'])(
    'preserves missing variables and empty original text for %s',
    async (id) => {
      const test = { ...example, vars: undefined };
      const [result] = await layer([test], { steps: [id] });

      expect(result.vars).toBeUndefined();
      expect(result.metadata?.originalText).toBe('');
    },
  );

  it('preserves an explicit attack scan ID and generation provider', async () => {
    const [result] = await layer(
      [example],
      {
        steps: [{ id: 'crescendo', config: { scanId: 'existing-scan', redteamProvider: 'echo' } }],
      },
      {
        generationProviderSelection: {
          provider: { id: () => 'runtime-only', callApi: vi.fn(async () => ({ output: '' })) },
          source: 'explicit',
          persistableId: 'file://generator.mjs',
        },
      },
    );

    expect(result.provider).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({ scanId: 'existing-scan', redteamProvider: 'echo' }),
      }),
    );
  });
});
