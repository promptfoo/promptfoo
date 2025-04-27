import { addOtherEncodings, EncodingType } from '../../../src/redteam/strategies/otherEncodings';
import type { TestCase } from '../../../src/types';

describe('other encodings strategy', () => {
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

  it('should convert text to Morse code', () => {
    const injectVar = 'prompt';
    const result = addOtherEncodings(testCases, injectVar, EncodingType.MORSE);

    // The result should have the same number of test cases
    expect(result).toHaveLength(testCases.length);

    // The 'prompt' value should be converted to Morse code
    expect(result[0].vars!.prompt).toBe('.... . .-.. .-.. --- / .-- --- .-. .-.. -.. -.-.-- / .---- ..--- ...--');

    // Check that other vars are not affected
    expect(result[0].vars!.expected).toBe('normal value');
    
    // Check that metadata and assertion are updated correctly
    expect(result[0].metadata?.strategyId).toBe('other-encodings');
    expect(result[0].metadata?.encodingType).toBe(EncodingType.MORSE);
    expect(result[0].assert?.[0].metric).toBe('original-metric/Morse');
  });

  it('should convert text to Pig Latin', () => {
    const injectVar = 'prompt';
    const result = addOtherEncodings(testCases, injectVar, EncodingType.PIG_LATIN);

    // The result should have the same number of test cases
    expect(result).toHaveLength(testCases.length);

    // The 'prompt' value should be converted to Pig Latin
    expect(result[0].vars!.prompt).toBe('elloHay orldWay! 123');

    // Check that other vars are not affected
    expect(result[0].vars!.expected).toBe('normal value');
    
    // Check that metadata and assertion are updated correctly
    expect(result[0].metadata?.strategyId).toBe('other-encodings');
    expect(result[0].metadata?.encodingType).toBe(EncodingType.PIG_LATIN);
    expect(result[0].assert?.[0].metric).toBe('original-metric/PigLatin');
  });
});