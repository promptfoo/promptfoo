import { addCustom } from '../../../src/redteam/strategies/custom';

import type { TestCase } from '../../../src/types';

describe('addCustom', () => {
  const mockTestCases: TestCase[] = [
    {
      vars: { query: 'Tell me a joke' },
      assert: [
        { type: 'llm-rubric', value: 'Does not contain harmful content', metric: 'Harmless' },
      ],
      metadata: { pluginId: 'harmful:hate', originalText: 'Tell me a joke' },
    },
    {
      vars: { query: 'What is the weather?' },
      assert: [{ type: 'llm-rubric', value: 'Provides helpful response', metric: 'Helpful' }],
      metadata: { pluginId: 'pii:direct', originalText: 'What is the weather?' },
    },
  ];

  const injectVar = 'query';
  const config = {
    strategyText: 'Be more aggressive in your approach',
    stateful: true,
  };

  describe('with simple custom strategy ID', () => {
    it('should process test cases with basic custom strategy', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom');

      expect(result).toHaveLength(2);

      // Check first test case
      expect(result[0]).toEqual({
        vars: { query: 'Tell me a joke' },
        provider: {
          id: 'promptfoo:redteam:custom',
          config: {
            injectVar: 'query',
            variant: '',
            strategyText: 'Be more aggressive in your approach',
            stateful: true,
          },
        },
        assert: [
          {
            type: 'llm-rubric',
            value: 'Does not contain harmful content',
            metric: 'Harmless/Custom',
          },
        ],
        metadata: {
          pluginId: 'harmful:hate',
          originalText: 'Tell me a joke',
          strategyId: 'custom',
        },
      });

      // Check second test case
      expect(result[1]).toEqual({
        vars: { query: 'What is the weather?' },
        provider: {
          id: 'promptfoo:redteam:custom',
          config: {
            injectVar: 'query',
            variant: '',
            strategyText: 'Be more aggressive in your approach',
            stateful: true,
          },
        },
        assert: [
          { type: 'llm-rubric', value: 'Provides helpful response', metric: 'Helpful/Custom' },
        ],
        metadata: {
          pluginId: 'pii:direct',
          originalText: 'What is the weather?',
          strategyId: 'custom',
        },
      });
    });
  });

  describe('with compound custom strategy ID', () => {
    it('should process test cases with custom:aggressive strategy', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom:aggressive');

      expect(result).toHaveLength(2);

      // Check first test case
      expect(result[0]).toEqual({
        vars: { query: 'Tell me a joke' },
        provider: {
          id: 'promptfoo:redteam:custom:aggressive',
          config: {
            injectVar: 'query',
            variant: 'aggressive',
            strategyText: 'Be more aggressive in your approach',
            stateful: true,
          },
        },
        assert: [
          {
            type: 'llm-rubric',
            value: 'Does not contain harmful content',
            metric: 'Harmless/Custom:aggressive',
          },
        ],
        metadata: {
          pluginId: 'harmful:hate',
          originalText: 'Tell me a joke',
          strategyId: 'custom:aggressive',
        },
      });
    });

    it('should process test cases with custom:greeting-strategy', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom:greeting-strategy');

      expect(result).toHaveLength(2);

      // Check provider ID and variant extraction
      expect(result[0].provider).toEqual({
        id: 'promptfoo:redteam:custom:greeting-strategy',
        config: {
          injectVar: 'query',
          variant: 'greeting-strategy',
          strategyText: 'Be more aggressive in your approach',
          stateful: true,
        },
      });

      // Check metric display name
      expect(result[0].assert?.[0].metric).toBe('Harmless/Custom:greeting-strategy');
    });
  });

  describe('variant extraction', () => {
    it('should extract simple variant correctly', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom:simple');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('simple');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Custom:simple');
    });

    it('should extract complex variant with hyphens', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom:multi-word-variant');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('multi-word-variant');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Custom:multi-word-variant');
    });

    it('should handle variant with underscores', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom:snake_case_variant');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('snake_case_variant');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Custom:snake_case_variant');
    });

    it('should handle empty variant for basic custom', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Custom');
    });
  });

  describe('config merging', () => {
    it('should merge provided config with strategy defaults', () => {
      const customConfig = {
        strategyText: 'Custom text',
        temperature: 0.8,
        customParam: true,
      };

      const result = addCustom(mockTestCases, injectVar, customConfig, 'custom:test');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config).toEqual({
        injectVar: 'query',
        variant: 'test',
        strategyText: 'Custom text',
        temperature: 0.8,
        customParam: true,
      });
    });

    it('should handle empty config', () => {
      const result = addCustom(mockTestCases, injectVar, {}, 'custom:minimal');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config).toEqual({
        injectVar: 'query',
        variant: 'minimal',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle test cases without assertions', () => {
      const testCasesWithoutAssertions: TestCase[] = [
        {
          vars: { query: 'Test query' },
          metadata: { pluginId: 'test', originalText: 'Test query' },
        },
      ];

      const result = addCustom(testCasesWithoutAssertions, injectVar, config, 'custom:test');

      expect(result).toHaveLength(1);
      expect(result[0].assert).toBeUndefined();
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:custom:test');
    });

    it('should handle test cases with multiple assertions', () => {
      const testCasesWithMultipleAssertions: TestCase[] = [
        {
          vars: { query: 'Test query' },
          assert: [
            { type: 'llm-rubric', value: 'First assertion', metric: 'Metric1' },
            { type: 'llm-rubric', value: 'Second assertion', metric: 'Metric2' },
          ],
          metadata: { pluginId: 'test', originalText: 'Test query' },
        },
      ];

      const result = addCustom(testCasesWithMultipleAssertions, injectVar, config, 'custom:multi');

      expect(result[0].assert).toHaveLength(2);
      expect(result[0].assert?.[0].metric).toBe('Metric1/Custom:multi');
      expect(result[0].assert?.[1].metric).toBe('Metric2/Custom:multi');
    });

    it('should preserve most metadata, add strategy metadata, and set originalText from inject variable', () => {
      const originalMetadata = {
        pluginId: 'test:plugin',
        originalText: 'Original text',
        customField: 'custom value',
      };

      const testCasesWithMetadata: TestCase[] = [
        {
          vars: { query: 'Test query' },
          metadata: originalMetadata,
        },
      ];

      const result = addCustom(testCasesWithMetadata, injectVar, config, 'custom:preserve');

      expect(result[0].metadata).toEqual({
        pluginId: 'test:plugin',
        customField: 'custom value',
        strategyId: 'custom:preserve',
        originalText: 'Test query',
      });
    });
  });

  describe('provider ID generation', () => {
    it('should generate correct provider ID for simple custom', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom');
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:custom');
    });

    it('should generate correct provider ID for compound custom', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom:variant');
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:custom:variant');
    });

    it('should handle complex variant names in provider ID', () => {
      const result = addCustom(mockTestCases, injectVar, config, 'custom:complex-variant-name');
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:custom:complex-variant-name');
    });
  });
});
