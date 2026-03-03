import { describe, expect, it } from 'vitest';
import { handleWordCount } from '../../src/assertions/wordCount';

import type {
  ApiProvider,
  AssertionParams,
  AssertionValue,
  AtomicTestCase,
} from '../../src/types/index';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const defaultParams = {
  baseType: 'word-count' as const,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'test output' },
  },
  output: 'test output',
  providerResponse: { output: 'test output' },
  test: {} as AtomicTestCase,
};

describe('handleWordCount', () => {
  describe('exact count', () => {
    it('should pass when word count matches exactly (number value)', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 5 },
        renderedValue: 5 as AssertionValue,
        outputString: 'This is a test sentence',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: params.assertion,
      });
    });

    it('should pass when word count matches exactly (string value)', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: '3' },
        renderedValue: '3' as AssertionValue,
        outputString: 'Hello world test',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: params.assertion,
      });
    });

    it('should fail when word count does not match', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 10 },
        renderedValue: 10 as AssertionValue,
        outputString: 'Short text',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Word count 2 does not equal expected 10',
        assertion: params.assertion,
      });
    });

    it('should count words correctly with multiple spaces', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 4 },
        renderedValue: 4 as AssertionValue,
        outputString: 'Word   with    multiple     spaces',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
    });

    it('should handle single word', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 1 },
        renderedValue: 1 as AssertionValue,
        outputString: 'Hello',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
    });

    it('should handle empty string as 0 words', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 0 },
        renderedValue: 0 as AssertionValue,
        outputString: '',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
    });
  });

  describe('range (min and max)', () => {
    it('should pass when word count is within range', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 3, max: 7 } },
        renderedValue: { min: 3, max: 7 } as AssertionValue,
        outputString: 'This is a test sentence',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: params.assertion,
      });
    });

    it('should pass when word count equals min', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 5, max: 10 } },
        renderedValue: { min: 5, max: 10 } as AssertionValue,
        outputString: 'This is a test sentence',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
    });

    it('should pass when word count equals max', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 1, max: 5 } },
        renderedValue: { min: 1, max: 5 } as AssertionValue,
        outputString: 'This is a test sentence',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
    });

    it('should fail when word count is below min', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 10, max: 20 } },
        renderedValue: { min: 10, max: 20 } as AssertionValue,
        outputString: 'Too few words',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Word count 3 is not between 10 and 20',
        assertion: params.assertion,
      });
    });

    it('should fail when word count is above max', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 1, max: 3 } },
        renderedValue: { min: 1, max: 3 } as AssertionValue,
        outputString: 'This has way too many words in it',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Word count 8 is not between 1 and 3',
        assertion: params.assertion,
      });
    });
  });

  describe('min only', () => {
    it('should pass when word count meets minimum', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 3 } },
        renderedValue: { min: 3 } as AssertionValue,
        outputString: 'This is a test sentence',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: params.assertion,
      });
    });

    it('should fail when word count is below minimum', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 10 } },
        renderedValue: { min: 10 } as AssertionValue,
        outputString: 'Too short',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Word count 2 is less than minimum 10',
        assertion: params.assertion,
      });
    });
  });

  describe('max only', () => {
    it('should pass when word count is below maximum', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { max: 10 } },
        renderedValue: { max: 10 } as AssertionValue,
        outputString: 'Short text here',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: params.assertion,
      });
    });

    it('should fail when word count exceeds maximum', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { max: 3 } },
        renderedValue: { max: 3 } as AssertionValue,
        outputString: 'This text has too many words',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Word count 6 is greater than maximum 3',
        assertion: params.assertion,
      });
    });
  });

  describe('inverse mode', () => {
    it('should pass inverse when word count does not match', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'not-word-count', value: 10 },
        renderedValue: 10 as AssertionValue,
        outputString: 'Short text',
        inverse: true,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail inverse when word count matches with descriptive message', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'not-word-count', value: 2 },
        renderedValue: 2 as AssertionValue,
        outputString: 'Two words',
        inverse: true,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Expected word count to not equal 2, but got 2');
    });

    it('should fail inverse with range and provide descriptive message', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'not-word-count', value: { min: 1, max: 5 } },
        renderedValue: { min: 1, max: 5 } as AssertionValue,
        outputString: 'Three word text',
        inverse: true,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Expected word count to not be between 1 and 5, but got 3');
    });

    it('should fail inverse with min only and provide descriptive message', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'not-word-count', value: { min: 2 } },
        renderedValue: { min: 2 } as AssertionValue,
        outputString: 'Three word text',
        inverse: true,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Expected word count to be less than 2, but got 3');
    });

    it('should fail inverse with max only and provide descriptive message', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'not-word-count', value: { max: 5 } },
        renderedValue: { max: 5 } as AssertionValue,
        outputString: 'Three word text',
        inverse: true,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Expected word count to be greater than 5, but got 3');
    });
  });

  describe('edge cases', () => {
    it('should handle text with newlines', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 7 },
        renderedValue: 7 as AssertionValue,
        outputString: 'First line\nSecond line here\nThird line',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
    });

    it('should handle text with tabs', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 4 },
        renderedValue: 4 as AssertionValue,
        outputString: 'Word\tWith\tTabs\tHere',
        inverse: false,
      };

      const result = handleWordCount(params);
      expect(result.pass).toBe(true);
    });

    it('should throw error when value is null', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: null as any },
        renderedValue: null as any,
        outputString: 'Some text',
        inverse: false,
      };

      expect(() => handleWordCount(params)).toThrow('"word-count" assertion must have a value');
    });

    it('should throw error when object has neither min nor max', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: {} as any },
        renderedValue: {} as any,
        outputString: 'Some text',
        inverse: false,
      };

      expect(() => handleWordCount(params)).toThrow(
        '"word-count" assertion object must have "min" and/or "max" properties',
      );
    });

    it('should throw error when value is invalid type', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: 'invalid' as any },
        renderedValue: 'invalid' as any,
        outputString: 'Some text',
        inverse: false,
      };

      expect(() => handleWordCount(params)).toThrow(
        '"word-count" assertion value must be a number or an object with min/max properties',
      );
    });

    it('should throw error when min is greater than max', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'word-count', value: { min: 10, max: 5 } },
        renderedValue: { min: 10, max: 5 } as AssertionValue,
        outputString: 'Some text',
        inverse: false,
      };

      expect(() => handleWordCount(params)).toThrow(
        '"word-count" assertion: min (10) must be less than or equal to max (5)',
      );
    });
  });
});
