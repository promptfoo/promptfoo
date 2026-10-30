import { describe, expect, it } from 'vitest';
import { addReactCrescendo } from '../../../src/redteam/strategies/react-crescendo';

import type { TestCase } from '../../../src/types/index';

describe('addReactCrescendo', () => {
  it('should add react-crescendo configuration to test cases', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case 1',
        vars: { input: 'test input' },
        assert: [
          {
            type: 'contains',
            metric: 'exactMatch',
            value: 'expected output',
          },
        ],
      },
    ];

    const injectVar = 'input';
    const config = { someConfig: 'value' };

    const result = addReactCrescendo(testCases, injectVar, config);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      description: 'Test case 1',
      vars: { input: 'test input' },
      provider: {
        id: 'promptfoo:redteam:react-crescendo',
        config: {
          injectVar: 'input',
          someConfig: 'value',
        },
      },
      metadata: {
        strategyId: 'react-crescendo',
        originalText: 'test input',
      },
      assert: [
        {
          type: 'contains',
          metric: 'exactMatch/ReactCrescendo',
          value: 'expected output',
        },
      ],
    });
  });

  it('should handle test cases without assertions', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case without assertions',
        vars: { input: 'test input' },
      },
    ];

    const result = addReactCrescendo(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].assert).toBeUndefined();
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:react-crescendo',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].metadata).toEqual({
      strategyId: 'react-crescendo',
      originalText: 'test input',
    });
  });

  it('should handle empty test cases array', () => {
    const result = addReactCrescendo([], 'inject', {});
    expect(result).toEqual([]);
  });

  it('should preserve other test case properties', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case',
        vars: { input: 'test' },
        provider: { id: 'original-provider' },
        assert: [{ type: 'contains', metric: 'test', value: 'value' }],
        otherProp: 'should be preserved',
      } as TestCase & { otherProp: string },
    ];

    const result = addReactCrescendo(testCases, 'input', {});

    expect(result[0]).toMatchObject({
      description: 'Test case',
      vars: { input: 'test' },
      otherProp: 'should be preserved',
      provider: {
        id: 'promptfoo:redteam:react-crescendo',
        config: {
          injectVar: 'input',
        },
      },
      metadata: {
        strategyId: 'react-crescendo',
        originalText: 'test',
      },
    });
  });
});
