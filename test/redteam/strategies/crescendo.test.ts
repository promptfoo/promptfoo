import { addCrescendo } from '../../../src/redteam/strategies/crescendo';
import type { TestCase } from '../../../src/types';

describe('addCrescendo', () => {
  it('should add crescendo configuration to test cases', () => {
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

    const injectVar = 'injectedVar';
    const config = { someConfig: 'value' };

    const result = addCrescendo(testCases, injectVar, config);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      description: 'Test case 1',
      vars: { input: 'test input' },
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar: 'injectedVar',
          someConfig: 'value',
        },
      },
      assert: [
        {
          type: 'contains',
          metric: 'exactMatch/Crescendo',
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

    const result = addCrescendo(testCases, 'inject', {});

    expect(result).toHaveLength(1);
    expect(result[0].assert).toBeUndefined();
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:crescendo',
      config: {
        injectVar: 'inject',
      },
    });
  });

  it('should handle empty test cases array', () => {
    const result = addCrescendo([], 'inject', {});
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

    const result = addCrescendo(testCases, 'inject', {});

    expect(result[0]).toMatchObject({
      description: 'Test case',
      vars: { input: 'test' },
      otherProp: 'should be preserved',
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar: 'inject',
        },
      },
    });
  });
});
