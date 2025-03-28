import { addIterativeJailbreaks } from '../../../src/redteam/strategies/iterative';
import type { TestCase } from '../../../src/types';

describe('addIterativeJailbreaks', () => {
  const mockTestCases: TestCase[] = [
    {
      assert: [
        {
          type: 'contains-all', // Add required type field
          metric: 'test-metric',
          value: 'test-value',
        },
      ],
      metadata: {
        existingKey: 'existingValue',
      },
    },
  ];

  it('should transform test cases correctly for iterative strategy', () => {
    const result = addIterativeJailbreaks(mockTestCases, 'testVar', 'iterative', {
      configKey: 'configValue',
    });

    expect(result[0]).toEqual({
      ...mockTestCases[0],
      provider: {
        id: 'promptfoo:redteam:iterative',
        config: {
          injectVar: 'testVar',
          configKey: 'configValue',
        },
      },
      assert: [
        {
          type: 'contains-all',
          metric: 'test-metric/Iterative',
          value: 'test-value',
        },
      ],
      metadata: {
        existingKey: 'existingValue',
        strategyId: 'jailbreak',
      },
    });
  });

  it('should transform test cases correctly for iterative:tree strategy', () => {
    const result = addIterativeJailbreaks(mockTestCases, 'testVar', 'iterative:tree', {
      configKey: 'configValue',
    });

    expect(result[0]).toEqual({
      ...mockTestCases[0],
      provider: {
        id: 'promptfoo:redteam:iterative:tree',
        config: {
          injectVar: 'testVar',
          configKey: 'configValue',
        },
      },
      assert: [
        {
          type: 'contains-all',
          metric: 'test-metric/IterativeTree',
          value: 'test-value',
        },
      ],
      metadata: {
        existingKey: 'existingValue',
        strategyId: 'jailbreak:tree',
      },
    });
  });

  it('should handle test cases without assertions', () => {
    const testCasesWithoutAssert: TestCase[] = [
      {
        metadata: {
          existingKey: 'existingValue',
        },
      },
    ];

    const result = addIterativeJailbreaks(testCasesWithoutAssert, 'testVar', 'iterative', {});

    expect(result[0]).toEqual({
      ...testCasesWithoutAssert[0],
      provider: {
        id: 'promptfoo:redteam:iterative',
        config: {
          injectVar: 'testVar',
        },
      },
      assert: undefined,
      metadata: {
        existingKey: 'existingValue',
        strategyId: 'jailbreak',
      },
    });
  });

  it('should handle test cases without metadata', () => {
    const testCasesWithoutMetadata: TestCase[] = [
      {
        assert: [
          {
            type: 'contains-all',
            metric: 'test-metric',
            value: 'test-value',
          },
        ],
      },
    ];

    const result = addIterativeJailbreaks(testCasesWithoutMetadata, 'testVar', 'iterative', {});

    expect(result[0]).toEqual({
      ...testCasesWithoutMetadata[0],
      provider: {
        id: 'promptfoo:redteam:iterative',
        config: {
          injectVar: 'testVar',
        },
      },
      assert: [
        {
          type: 'contains-all',
          metric: 'test-metric/Iterative',
          value: 'test-value',
        },
      ],
      metadata: {
        strategyId: 'jailbreak',
      },
    });
  });

  it('should use default iterative strategy when not specified', () => {
    const result = addIterativeJailbreaks(mockTestCases, 'testVar', 'iterative', {});

    expect(result[0]).toEqual({
      ...mockTestCases[0],
      provider: {
        id: 'promptfoo:redteam:iterative',
        config: {
          injectVar: 'testVar',
        },
      },
      assert: [
        {
          type: 'contains-all',
          metric: 'test-metric/Iterative',
          value: 'test-value',
        },
      ],
      metadata: {
        existingKey: 'existingValue',
        strategyId: 'jailbreak',
      },
    });
  });
});
