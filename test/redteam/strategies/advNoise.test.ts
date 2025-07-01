import { addAdvNoiseTestCases } from '../../../src/redteam/strategies/advNoise';
import type { TestCaseWithPlugin } from '../../../src/types';

describe('addAdvNoiseTestCases', () => {
  it('should add adversarial noise test cases with default config', () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        description: 'Test case 1',
        vars: {
          prompt: 'Hello world',
        },
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = addAdvNoiseTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    expect(
      result[0].provider && typeof result[0].provider === 'object' && 'id' in result[0].provider
        ? result[0].provider.id
        : null,
    ).toBe('promptfoo:redteam:adv-noise');
    expect(
      result[0].provider && typeof result[0].provider === 'object' && 'config' in result[0].provider
        ? result[0].provider.config
        : null,
    ).toEqual({
      injectVar: 'prompt',
      levenshteinThreshold: 0.2,
      maxAttempts: 5,
      typoRate: 0.1,
      synonymRate: 0.2,
      punctuationRate: 0.1,
    });
    expect(result[0].metadata!.strategyId).toBe('adv-noise');
    expect(result[0].metadata!.originalText).toBe('Hello world');
  });

  it('should add adversarial noise test cases with custom config', () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        description: 'Test case 1',
        vars: {
          input: 'Test input',
        },
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const config = {
      levenshteinThreshold: 0.3,
      maxAttempts: 10,
      typoRate: 0.2,
      synonymRate: 0.3,
      punctuationRate: 0.2,
    };

    const result = addAdvNoiseTestCases(testCases, 'input', config);

    expect(result).toHaveLength(1);
    expect(
      result[0].provider && typeof result[0].provider === 'object' && 'config' in result[0].provider
        ? result[0].provider.config
        : null,
    ).toEqual({
      injectVar: 'input',
      ...config,
    });
  });

  it('should preserve existing assertions and append adversarial noise metric', () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        description: 'Test case with assertions',
        vars: {
          prompt: 'Test',
        },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'Accuracy',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = addAdvNoiseTestCases(testCases, 'prompt', {});

    expect(result[0].assert).toHaveLength(2);
    expect(result[0].assert![0].metric).toBe('AdversarialNoise');
    expect(result[0].assert![1].metric).toBe('Accuracy/AdversarialNoise');
  });

  it('should handle empty test cases array', () => {
    const result = addAdvNoiseTestCases([], 'prompt', {});
    expect(result).toEqual([]);
  });

  it('should handle undefined assertions', () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        description: 'Test case without assertions',
        vars: {
          prompt: 'Test',
        },
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = addAdvNoiseTestCases(testCases, 'prompt', {});

    expect(result[0].assert).toHaveLength(1);
    expect(result[0].assert![0].metric).toBe('AdversarialNoise');
  });
});
