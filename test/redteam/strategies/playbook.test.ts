import { addPlaybook } from '../../../src/redteam/strategies/playbook';
import type { TestCase } from '../../../src/types';

describe('addPlaybook', () => {
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

  describe('with simple playbook strategy ID', () => {
    it('should process test cases with basic playbook strategy', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook');

      expect(result).toHaveLength(2);

      // Check first test case
      expect(result[0]).toEqual({
        vars: { query: 'Tell me a joke' },
        provider: {
          id: 'promptfoo:redteam:playbook',
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
            metric: 'Harmless/Playbook',
          },
        ],
        metadata: {
          pluginId: 'harmful:hate',
          originalText: 'Tell me a joke',
          strategyId: 'playbook',
        },
      });

      // Check second test case
      expect(result[1]).toEqual({
        vars: { query: 'What is the weather?' },
        provider: {
          id: 'promptfoo:redteam:playbook',
          config: {
            injectVar: 'query',
            variant: '',
            strategyText: 'Be more aggressive in your approach',
            stateful: true,
          },
        },
        assert: [
          { type: 'llm-rubric', value: 'Provides helpful response', metric: 'Helpful/Playbook' },
        ],
        metadata: {
          pluginId: 'pii:direct',
          originalText: 'What is the weather?',
          strategyId: 'playbook',
        },
      });
    });
  });

  describe('with compound playbook strategy ID', () => {
    it('should process test cases with playbook:aggressive strategy', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook:aggressive');

      expect(result).toHaveLength(2);

      // Check first test case
      expect(result[0]).toEqual({
        vars: { query: 'Tell me a joke' },
        provider: {
          id: 'promptfoo:redteam:playbook:aggressive',
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
            metric: 'Harmless/Playbook:aggressive',
          },
        ],
        metadata: {
          pluginId: 'harmful:hate',
          originalText: 'Tell me a joke',
          strategyId: 'playbook:aggressive',
        },
      });
    });

    it('should process test cases with playbook:greeting-strategy', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook:greeting-strategy');

      expect(result).toHaveLength(2);

      // Check provider ID and variant extraction
      expect(result[0].provider).toEqual({
        id: 'promptfoo:redteam:playbook:greeting-strategy',
        config: {
          injectVar: 'query',
          variant: 'greeting-strategy',
          strategyText: 'Be more aggressive in your approach',
          stateful: true,
        },
      });

      // Check metric display name
      expect(result[0].assert?.[0].metric).toBe('Harmless/Playbook:greeting-strategy');
    });
  });

  describe('variant extraction', () => {
    it('should extract simple variant correctly', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook:simple');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('simple');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Playbook:simple');
    });

    it('should extract complex variant with hyphens', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook:multi-word-variant');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('multi-word-variant');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Playbook:multi-word-variant');
    });

    it('should handle variant with underscores', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook:snake_case_variant');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('snake_case_variant');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Playbook:snake_case_variant');
    });

    it('should handle empty variant for basic playbook', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config.variant).toBe('');
      expect(result[0].assert?.[0].metric).toBe('Harmless/Playbook');
    });
  });

  describe('config merging', () => {
    it('should merge provided config with strategy defaults', () => {
      const playbookConfig = {
        strategyText: 'Playbook text',
        temperature: 0.8,
        customParam: true,
      };

      const result = addPlaybook(mockTestCases, injectVar, playbookConfig, 'playbook:test');

      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.config).toEqual({
        injectVar: 'query',
        variant: 'test',
        strategyText: 'Playbook text',
        temperature: 0.8,
        customParam: true,
      });
    });

    it('should handle empty config', () => {
      const result = addPlaybook(mockTestCases, injectVar, {}, 'playbook:minimal');

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

      const result = addPlaybook(testCasesWithoutAssertions, injectVar, config, 'playbook:test');

      expect(result).toHaveLength(1);
      expect(result[0].assert).toBeUndefined();
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:playbook:test');
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

      const result = addPlaybook(
        testCasesWithMultipleAssertions,
        injectVar,
        config,
        'playbook:multi',
      );

      expect(result[0].assert).toHaveLength(2);
      expect(result[0].assert?.[0].metric).toBe('Metric1/Playbook:multi');
      expect(result[0].assert?.[1].metric).toBe('Metric2/Playbook:multi');
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

      const result = addPlaybook(testCasesWithMetadata, injectVar, config, 'playbook:preserve');

      expect(result[0].metadata).toEqual({
        pluginId: 'test:plugin',
        customField: 'custom value',
        strategyId: 'playbook:preserve',
        originalText: 'Test query',
      });
    });
  });

  describe('provider ID generation', () => {
    it('should generate correct provider ID for simple playbook', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook');
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:playbook');
    });

    it('should generate correct provider ID for compound playbook', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook:variant');
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:playbook:variant');
    });

    it('should handle complex variant names in provider ID', () => {
      const result = addPlaybook(mockTestCases, injectVar, config, 'playbook:complex-variant-name');
      expect(typeof result[0].provider).toBe('object');
      const provider = result[0].provider as { id: string; config: any };
      expect(provider.id).toBe('promptfoo:redteam:playbook:complex-variant-name');
    });
  });
});
