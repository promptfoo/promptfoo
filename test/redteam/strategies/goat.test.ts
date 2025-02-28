import { describe, it, expect } from '@jest/globals';
import { addGoatTestCases } from '../../../src/redteam/strategies/goat';
import type { TestCaseWithPlugin, AssertionType } from '../../../src/types';

describe('GOAT Strategy', () => {
  it('should add GOAT configuration to test cases', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { goal: 'test goal' },
        assert: [
          {
            type: 'exactMatch' as AssertionType,
            metric: 'exactMatch',
            value: 'expected',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addGoatTestCases(testCases, 'goal', {});

    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:goat',
      config: {
        injectVar: 'goal',
      },
    });

    expect(result[0].assert?.[0].metric).toBe('exactMatch/GOAT');
  });

  it('should preserve original test case properties', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { goal: 'test goal', other: 'value' },
        metadata: {
          pluginId: 'test-plugin',
          key: 'value',
        },
      },
    ];

    const result = await addGoatTestCases(testCases, 'goal', {});

    expect(result[0].vars).toEqual(testCases[0].vars);
    expect(result[0].metadata).toEqual(testCases[0].metadata);
  });
});
