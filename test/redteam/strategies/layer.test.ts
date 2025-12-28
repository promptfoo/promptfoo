import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addLayerTestCases } from '../../../src/redteam/strategies/layer';

import type { Strategy } from '../../../src/redteam/strategies/index';
import type { TestCaseWithPlugin } from '../../../src/types/index';

describe('addLayerTestCases', () => {
  const mockStrategies: Strategy[] = [
    {
      id: 'base64',
      action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
        testCases.map((tc) => ({
          ...tc,
          vars: {
            ...tc.vars,
            input: Buffer.from(String(tc.vars?.input || '')).toString('base64'),
          },
          metadata: {
            ...tc.metadata,
            strategyId: 'base64',
            transformed: 'base64',
          },
        })),
      ),
    },
    {
      id: 'rot13',
      action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
        testCases.map((tc) => ({
          ...tc,
          vars: {
            ...tc.vars,
            input: String(tc.vars?.input || '').replace(/[A-Za-z]/g, (char) => {
              const code = char.charCodeAt(0);
              const base = code < 97 ? 65 : 97;
              return String.fromCharCode(((code - base + 13) % 26) + base);
            }),
          },
          metadata: {
            ...tc.metadata,
            strategyId: 'rot13',
            transformed: 'rot13',
          },
        })),
      ),
    },
    {
      id: 'multilingual',
      action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
        testCases.map((tc) => ({
          ...tc,
          vars: {
            ...tc.vars,
            input: `[Translated to Spanish] ${tc.vars?.input}`,
          },
          metadata: {
            ...tc.metadata,
            strategyId: 'multilingual',
            transformed: 'multilingual',
          },
        })),
      ),
    },
  ];

  const mockLoadStrategy = vi.fn(async (path: string): Promise<Strategy> => {
    if (path === 'file://custom-strategy.js') {
      return {
        id: 'custom',
        action: async (testCases: TestCaseWithPlugin[]) =>
          testCases.map((tc) => ({
            ...tc,
            vars: {
              ...tc.vars,
              input: `[Custom] ${tc.vars?.input}`,
            },
            metadata: {
              ...tc.metadata,
              strategyId: 'custom',
              transformed: 'custom',
            },
          })),
      };
    }
    throw new Error(`Strategy not found: ${path}`);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no steps are provided', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      {},
      mockStrategies,
      mockLoadStrategy,
    );

    expect(result).toEqual([]);
  });

  it('should apply single strategy step', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'hello' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      { steps: ['base64'] },
      mockStrategies,
      mockLoadStrategy,
    );

    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('aGVsbG8=');
    expect(result[0].metadata?.transformed).toBe('base64');
    expect(mockStrategies[0].action).toHaveBeenCalledTimes(1);
  });

  it('should compose multiple strategy steps in order', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'hello' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      { steps: ['multilingual', 'rot13'] },
      mockStrategies,
      mockLoadStrategy,
    );

    expect(result).toHaveLength(1);
    // First multilingual adds "[Translated to Spanish] ", then rot13 transforms it
    const expectedOutput = '[Translated to Spanish] hello'.replace(/[A-Za-z]/g, (char) => {
      const code = char.charCodeAt(0);
      const base = code < 97 ? 65 : 97;
      return String.fromCharCode(((code - base + 13) % 26) + base);
    });
    expect(result[0].vars?.input).toBe(expectedOutput);
    expect(result[0].metadata?.transformed).toBe('rot13');
    expect(mockStrategies[2].action).toHaveBeenCalledTimes(1); // multilingual
    expect(mockStrategies[1].action).toHaveBeenCalledTimes(1); // rot13
  });

  it('should handle strategy steps with config objects', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      {
        steps: [{ id: 'base64', config: { custom: 'value' } }, 'rot13'],
      },
      mockStrategies,
      mockLoadStrategy,
    );

    expect(result).toHaveLength(1);
    expect(mockStrategies[0].action).toHaveBeenCalledWith(
      expect.any(Array),
      'input',
      expect.objectContaining({ custom: 'value' }),
    );
  });

  it('should load and apply custom file:// strategies', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      { steps: ['file://custom-strategy.js'] },
      mockStrategies,
      mockLoadStrategy,
    );

    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('[Custom] test');
    expect(result[0].metadata?.transformed).toBe('custom');
    expect(mockLoadStrategy).toHaveBeenCalledWith('file://custom-strategy.js');
  });

  it('should skip unknown strategies with warning', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      { steps: ['unknown-strategy', 'base64'] },
      mockStrategies,
      mockLoadStrategy,
    );

    // Should skip unknown-strategy but still apply base64
    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('dGVzdA==');
    expect(mockStrategies[0].action).toHaveBeenCalledTimes(1);
  });

  it('should handle strategy loading errors gracefully', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    mockLoadStrategy.mockRejectedValueOnce(new Error('Failed to load'));

    const result = await addLayerTestCases(
      testCases,
      'input',
      { steps: ['file://invalid.js', 'base64'] },
      mockStrategies,
      mockLoadStrategy,
    );

    // Should skip failed strategy but still apply base64
    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('dGVzdA==');
    expect(mockStrategies[0].action).toHaveBeenCalledTimes(1);
  });

  it('should respect plugin targeting in steps', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test1' },
        metadata: { pluginId: 'plugin-a' },
      },
      {
        vars: { input: 'test2' },
        metadata: { pluginId: 'plugin-b' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      {
        steps: [{ id: 'base64', config: { plugins: ['plugin-a'] } }],
      },
      mockStrategies,
      mockLoadStrategy,
    );

    // Should only transform plugin-a test case
    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('dGVzdDE=');
  });

  it('should handle empty result from intermediate step', async () => {
    // Mock a strategy that returns empty array
    const emptyStrategy: Strategy = {
      id: 'filter-all',
      action: vi.fn(async () => []),
    };

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      { steps: ['filter-all', 'base64'] },
      [...mockStrategies, emptyStrategy],
      mockLoadStrategy,
    );

    // Should return empty array since first step filtered everything
    expect(result).toEqual([]);
    expect(emptyStrategy.action).toHaveBeenCalledTimes(1);
    // base64 is still called but with empty array
    expect(mockStrategies[0].action).toHaveBeenCalledWith([], 'input', expect.any(Object));
  });

  it('should handle colon-separated strategy IDs', async () => {
    const colonStrategy: Strategy = {
      id: 'jailbreak',
      action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
        testCases.map((tc) => ({
          ...tc,
          vars: {
            ...tc.vars,
            input: `[Jailbreak] ${tc.vars?.input}`,
          },
        })),
      ),
    };

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      { steps: ['jailbreak:composite'] },
      [...mockStrategies, colonStrategy],
      mockLoadStrategy,
    );

    // Should find and use the base 'jailbreak' strategy
    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('[Jailbreak] test');
    expect(colonStrategy.action).toHaveBeenCalledTimes(1);
  });

  it('should accept label in config for unique identification', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const result = await addLayerTestCases(
      testCases,
      'input',
      { label: 'audio-attack', steps: ['base64'] },
      mockStrategies,
      mockLoadStrategy,
    );

    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('dGVzdA==');
  });

  it('should work correctly with label config for unique strategy identification', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    // Test with label - should complete without error
    const result = await addLayerTestCases(
      testCases,
      'input',
      { label: 'custom-label', steps: ['base64'] },
      mockStrategies,
      mockLoadStrategy,
    );

    expect(result).toHaveLength(1);
    expect(result[0].vars?.input).toBe('dGVzdA==');
    // The result should contain metadata from the strategy
    expect(result[0].metadata).toBeDefined();
  });

  it('should merge step config with global config', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: { pluginId: 'test-plugin' },
      },
    ];

    const globalConfig = { globalKey: 'globalValue' };
    const stepConfig = { stepKey: 'stepValue' };

    await addLayerTestCases(
      testCases,
      'input',
      {
        ...globalConfig,
        steps: [{ id: 'base64', config: stepConfig }],
      },
      mockStrategies,
      mockLoadStrategy,
    );

    expect(mockStrategies[0].action).toHaveBeenCalledWith(
      expect.any(Array),
      'input',
      expect.objectContaining({
        globalKey: 'globalValue',
        stepKey: 'stepValue',
      }),
    );
  });

  describe('attack provider detection', () => {
    it('should detect hydra as attack provider and configure per-turn layers', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          assert: [{ type: 'promptfoo:redteam:harmful:test' as const, metric: 'Harmful/Test' }],
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { steps: ['jailbreak:hydra', 'audio'] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      // Should have provider configured
      const provider = result[0].provider;
      expect(provider).toBeDefined();
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'id' in provider) {
        expect(provider.id).toBe('promptfoo:redteam:hydra');
        expect(provider.config).toEqual(
          expect.objectContaining({
            injectVar: 'input',
            _perTurnLayers: ['audio'],
          }),
        );
      }
      // Should have metric suffix updated
      expect(result[0].assert?.[0]?.metric).toBe('Harmful/Test/Hydra');
      // Should have strategyId in metadata
      expect(result[0].metadata?.strategyId).toContain('hydra');
    });

    it('should detect crescendo as attack provider', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { steps: ['crescendo', 'image'] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      const provider = result[0].provider;
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'id' in provider) {
        expect(provider.id).toBe('promptfoo:redteam:crescendo');
        expect(provider.config).toEqual(
          expect.objectContaining({
            _perTurnLayers: ['image'],
          }),
        );
      }
    });

    it('should detect goat as attack provider', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { steps: ['goat', 'audio'] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      const provider = result[0].provider;
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'id' in provider) {
        expect(provider.id).toBe('promptfoo:redteam:goat');
      }
    });

    it('should detect jailbreak (base iterative) as attack provider', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { steps: ['jailbreak', 'audio'] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      const provider = result[0].provider;
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'id' in provider) {
        expect(provider.id).toBe('promptfoo:redteam:iterative');
      }
    });

    it('should detect jailbreak:meta as attack provider', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { steps: ['jailbreak:meta', 'audio'] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      const provider = result[0].provider;
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'id' in provider) {
        expect(provider.id).toBe('promptfoo:redteam:iterative:meta');
      }
    });

    it('should detect jailbreak:tree as attack provider', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { steps: ['jailbreak:tree', 'audio'] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      const provider = result[0].provider;
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'id' in provider) {
        expect(provider.id).toBe('promptfoo:redteam:iterative:tree');
      }
    });

    it('should include label in strategyId when provided', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { label: 'hydra-audio', steps: ['jailbreak:hydra', 'audio'] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      expect(result[0].metadata?.strategyId).toContain('layer/hydra-audio');
    });

    it('should pass attack provider config to provider', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        {
          steps: [{ id: 'jailbreak:hydra', config: { maxTurns: 5, stateful: true } }, 'audio'],
        },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      const provider = result[0].provider;
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'config' in provider) {
        expect(provider.config).toEqual(
          expect.objectContaining({
            maxTurns: 5,
            stateful: true,
            _perTurnLayers: ['audio'],
          }),
        );
      }
    });

    it('should handle multiple per-turn layers', async () => {
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      const result = await addLayerTestCases(
        testCases,
        'input',
        { steps: ['jailbreak:hydra', 'audio', { id: 'base64', config: { someOption: true } }] },
        mockStrategies,
        mockLoadStrategy,
      );

      expect(result).toHaveLength(1);
      const provider = result[0].provider;
      expect(typeof provider).toBe('object');
      if (typeof provider === 'object' && provider !== null && 'config' in provider) {
        expect((provider.config as Record<string, unknown>)?._perTurnLayers).toEqual([
          'audio',
          { id: 'base64', config: { someOption: true } },
        ]);
      }
    });

    it('should generate correct metric suffix for each attack provider', async () => {
      const testCasesWithAssert: TestCaseWithPlugin[] = [
        {
          vars: { input: 'test' },
          assert: [{ type: 'promptfoo:redteam:test' as const, metric: 'TestMetric' }],
          metadata: { pluginId: 'test-plugin' },
        },
      ];

      // Test different providers and their expected suffixes
      // Note: 'jailbreak' becomes 'Jailbreak' (capitalized) in getMetricSuffix,
      // while 'iterative' becomes 'Iterative'. The provider ID mapping is separate.
      const providers = [
        { step: 'jailbreak:hydra', expectedSuffix: 'Hydra' },
        { step: 'crescendo', expectedSuffix: 'Crescendo' },
        { step: 'goat', expectedSuffix: 'GOAT' },
        { step: 'jailbreak', expectedSuffix: 'Jailbreak' }, // base jailbreak -> Jailbreak
        { step: 'jailbreak:meta', expectedSuffix: 'Meta' },
        { step: 'jailbreak:tree', expectedSuffix: 'Tree' },
      ];

      for (const { step, expectedSuffix } of providers) {
        const result = await addLayerTestCases(
          testCasesWithAssert,
          'input',
          { steps: [step, 'audio'] },
          mockStrategies,
          mockLoadStrategy,
        );

        expect(result[0].assert?.[0]?.metric).toBe(`TestMetric/${expectedSuffix}`);
      }
    });
  });
});
