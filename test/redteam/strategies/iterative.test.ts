import { addIterativeJailbreaks } from '../../../src/redteam/strategies/iterative';
import type { TestCase } from '../../../src/types';

describe('addIterativeJailbreaks', () => {
  it('should add iterative jailbreak config to test cases', () => {
    const testCases: TestCase[] = [
      {
        vars: { input: 'test' },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
      },
    ];

    const result = addIterativeJailbreaks(testCases, 'input', 'iterative', { foo: 'bar' });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:iterative',
      config: {
        injectVar: 'input',
        foo: 'bar',
      },
    });
    expect(result[0].assert?.[0].metric).toBe('accuracy/Iterative');
  });

  it('should add iterative tree jailbreak config to test cases', () => {
    const testCases: TestCase[] = [
      {
        vars: { input: 'test' },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
      },
    ];

    const result = addIterativeJailbreaks(testCases, 'input', 'iterative:tree', { foo: 'bar' });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:iterative:tree',
      config: {
        injectVar: 'input',
        foo: 'bar',
      },
    });
    expect(result[0].assert?.[0].metric).toBe('accuracy/IterativeTree');
  });

  it('should handle test cases without assertions', () => {
    const testCases: TestCase[] = [
      {
        vars: { input: 'test' },
      },
    ];

    const result = addIterativeJailbreaks(testCases, 'input', 'iterative', {});

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:iterative',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].assert).toBeUndefined();
  });

  it('should preserve original test case properties', () => {
    const testCases: TestCase[] = [
      {
        vars: { input: 'test' },
        description: 'Test description',
      },
    ];

    const result = addIterativeJailbreaks(testCases, 'input', 'iterative', {});

    expect(result[0].vars).toEqual({ input: 'test' });
    expect(result[0].description).toBe('Test description');
  });
});
