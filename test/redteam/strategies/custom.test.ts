import { addCustom } from '../../../src/redteam/strategies/custom';
import type { TestCase } from '../../../src/types';

describe('addCustom', () => {
  it('should transform test cases with custom strategy', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt',
          other: 'other var',
        },
        assert: [
          {
            type: 'contains',
            metric: 'similarity',
            value: 0.8,
          },
        ],
        metadata: {
          foo: 'bar',
        },
      },
    ];

    const result = addCustom(testCases, 'prompt', { customConfig: true });

    expect(result).toEqual([
      {
        vars: {
          prompt: 'test prompt',
          other: 'other var',
        },
        provider: {
          id: 'promptfoo:redteam:custom',
          config: {
            injectVar: 'prompt',
            customConfig: true,
          },
        },
        assert: [
          {
            type: 'contains',
            metric: 'similarity/Custom',
            value: 0.8,
          },
        ],
        metadata: {
          foo: 'bar',
          strategyId: 'custom',
          originalText: 'test prompt',
        },
      },
    ]);
  });

  it('should handle test cases without assertions', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt',
        },
        metadata: {},
      },
    ];

    const result = addCustom(testCases, 'prompt', {});

    expect(result[0].assert).toBeUndefined();
  });

  it('should handle test cases without metadata', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt',
        },
      },
    ];

    const result = addCustom(testCases, 'prompt', {});

    expect(result[0].metadata).toEqual({
      strategyId: 'custom',
      originalText: 'test prompt',
    });
  });

  it('should convert non-string var values to string', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          prompt: 123,
        },
      },
    ];

    const result = addCustom(testCases, 'prompt', {});

    expect(result[0].metadata?.originalText).toBe('123');
  });
});
