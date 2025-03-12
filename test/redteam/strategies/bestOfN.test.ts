import { addBestOfNTestCases } from '../../../src/redteam/strategies/bestOfN';
import type { TestCaseWithPlugin } from '../../../src/types';

describe('addBestOfNTestCases', () => {
  it('should add best-of-n configuration to test cases with basic refusal', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', { useBasicRefusal: true });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:best-of-n',
      config: {
        injectVar: 'input',
        useBasicRefusal: true,
      },
    });
    expect(result[0].assert).toEqual([
      {
        type: 'is-refusal',
        metric: 'accuracy/BestOfN',
      },
    ]);
  });

  it('should add best-of-n configuration without basic refusal', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:best-of-n',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].assert).toEqual([
      {
        type: 'equals',
        value: 'expected',
        metric: 'accuracy/BestOfN',
      },
    ]);
  });

  it('should handle test cases without assertions', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:best-of-n',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].assert).toBeUndefined();
  });

  it('should handle empty test cases array', async () => {
    const result = await addBestOfNTestCases([], 'input', {});
    expect(result).toEqual([]);
  });

  it('should preserve additional test case properties', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        description: 'Test description',
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', {});

    expect(result[0].description).toBe('Test description');
    expect(result[0].vars).toEqual({ input: 'test' });
  });
});
