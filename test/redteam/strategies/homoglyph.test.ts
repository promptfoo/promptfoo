import { addHomoglyphs } from '../../../src/redteam/strategies/homoglyph';
import type { TestCase } from '../../../src/types';

describe('homoglyph strategy', () => {
  const testCases: TestCase[] = [
    {
      vars: {
        prompt: 'Hello World! 123',
        expected: 'normal value',
      },
      assert: [
        {
          type: 'equals',
          value: 'expected value',
          metric: 'original-metric',
        },
      ],
    },
  ];

  it('should convert text to homoglyphs', () => {
    const injectVar = 'prompt';
    const result = addHomoglyphs(testCases, injectVar);

    // The result should have the same number of test cases
    expect(result).toHaveLength(testCases.length);

    // The 'prompt' value should be converted to homoglyphs
    expect(result[0].vars!.prompt).not.toBe('Hello World! 123');

    // Check some specific characters were converted
    const homoglyphText = result[0].vars!.prompt as string;
    expect(homoglyphText).not.toBe('Hello World! 123');

    // Check that other vars are not affected
    expect(result[0].vars!.expected).toBe('normal value');

    // Check that metadata and assertion are updated correctly
    expect(result[0].metadata?.strategyId).toBe('homoglyph');
    expect(result[0].assert?.[0].metric).toBe('original-metric/Homoglyph');
  });
});
