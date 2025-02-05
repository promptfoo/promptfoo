import { deduplicateTests } from '../../../src/redteam/strategies/retry';
import type { TestCase } from '../../../src/types';

describe('deduplicateTests', () => {
  it('should deduplicate test cases based on vars', () => {
    const testCases: TestCase[] = [
      {
        vars: { a: '1', b: '2' },
        assert: [],
      },
      {
        vars: { a: '1', b: '2' }, // Duplicate
        assert: [],
      },
      {
        vars: { a: '2', b: '3' },
        assert: [],
      },
    ];

    const result = deduplicateTests(testCases);

    expect(result).toHaveLength(2);
    expect(result[0].vars).toEqual({ a: '1', b: '2' });
    expect(result[1].vars).toEqual({ a: '2', b: '3' });
  });

  it('should handle empty test cases array', () => {
    const result = deduplicateTests([]);
    expect(result).toHaveLength(0);
  });

  it('should handle test cases with no vars', () => {
    const testCases: TestCase[] = [
      {
        vars: {},
        assert: [],
      },
      {
        vars: {},
        assert: [],
      },
    ];

    const result = deduplicateTests(testCases);
    expect(result).toHaveLength(1);
  });

  it('should preserve non-vars properties', () => {
    const testCases: TestCase[] = [
      {
        vars: { a: '1' },
        assert: [{ type: 'equals', value: 'test' }],
        description: 'test case',
      },
      {
        vars: { a: '1' },
        assert: [{ type: 'equals', value: 'different' }],
        description: 'another test case',
      },
    ];

    const result = deduplicateTests(testCases);
    expect(result).toHaveLength(1);
    expect(result[0].assert).toEqual([{ type: 'equals', value: 'test' }]);
    expect(result[0].description).toBe('test case');
  });
});
