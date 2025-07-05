import {
  addHomoglyphs,
  homoglyphMap,
  toHomoglyphs,
} from '../../../src/redteam/strategies/homoglyph';
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

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('toHomoglyphs', () => {
    it('should convert lowercase letters', () => {
      expect(toHomoglyphs('abcdefghijklmnopqrstuvwxyz')).not.toBe('abcdefghijklmnopqrstuvwxyz');
      expect(toHomoglyphs('a')).toBe(homoglyphMap['a']);
      expect(toHomoglyphs('z')).toBe(homoglyphMap['z']);
    });

    it('should convert uppercase letters', () => {
      expect(toHomoglyphs('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).not.toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(toHomoglyphs('A')).toBe(homoglyphMap['A']);
      expect(toHomoglyphs('Z')).toBe(homoglyphMap['Z']);
    });

    it('should convert numbers', () => {
      expect(toHomoglyphs('0123456789')).not.toBe('0123456789');
      expect(toHomoglyphs('0')).toBe(homoglyphMap['0']);
      expect(toHomoglyphs('9')).toBe(homoglyphMap['9']);
    });

    it('should handle empty strings', () => {
      expect(toHomoglyphs('')).toBe('');
    });

    it('should preserve unmapped characters', () => {
      expect(toHomoglyphs('!@#$%^&*()')).toBe('!@#$%^&*()');
      expect(toHomoglyphs(' ')).toBe(' ');
    });

    it('should handle mixed content', () => {
      const input = 'Hello123!@#';
      const output = toHomoglyphs(input);
      expect(output).not.toBe(input);
      // Note: Length check removed since homoglyphs may have different UTF-16 lengths
      expect(output).toBeTruthy();
    });

    it('should handle all mapped characters', () => {
      // Test each mapped character individually rather than all at once
      Object.keys(homoglyphMap).forEach((char) => {
        const result = toHomoglyphs(char);
        expect(result).toBe(homoglyphMap[char]);
      });
    });

    it('should handle non-ASCII characters not in the map', () => {
      const nonAsciiChars = '☺★♥♦♣♠€£¥©®™';
      expect(toHomoglyphs(nonAsciiChars)).toBe(nonAsciiChars);
    });
  });

  describe('addHomoglyphs', () => {
    it('should convert text to homoglyphs', () => {
      const injectVar = 'prompt';
      const result = addHomoglyphs(testCases, injectVar);

      expect(result).toEqual([
        {
          ...testCases[0],
          vars: {
            ...testCases[0].vars,
            prompt: expect.not.stringMatching(/^Hello World! 123$/),
          },
          metadata: {
            strategyId: 'homoglyph',
            originalText: 'Hello World! 123',
          },
          assert: [
            {
              type: 'equals',
              value: 'expected value',
              metric: 'original-metric/Homoglyph',
            },
          ],
        },
      ]);
    });

    it('should handle undefined vars', () => {
      const testCase: TestCase = { vars: {} };
      const result = addHomoglyphs([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toHomoglyphs('undefined'));
    });

    it('should handle missing inject var', () => {
      const testCase: TestCase = { vars: { other: 'value' } };
      const result = addHomoglyphs([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toHomoglyphs('undefined'));
      expect(result[0].vars!.other).toBe('value');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      const testCase: TestCase = { vars: { prompt: longString } };
      const result = addHomoglyphs([testCase], 'prompt');
      expect(result[0].vars!.prompt).not.toBe(longString);
      expect(result[0].vars!.prompt).toBe(homoglyphMap['a'].repeat(1000));
    });

    it('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?`~';
      const testCase: TestCase = { vars: { prompt: specialChars } };
      const result = addHomoglyphs([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(specialChars);
    });

    it('should handle null input by converting to string', () => {
      const testCase: TestCase = { vars: { prompt: null as any } };
      const result = addHomoglyphs([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toHomoglyphs('null'));
    });

    it('should handle numeric input by converting to string', () => {
      const testCase: TestCase = { vars: { prompt: 12345 } };
      const result = addHomoglyphs([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toHomoglyphs('12345'));
    });

    it('should preserve assertion objects', () => {
      const testCase: TestCase = {
        vars: { prompt: 'test' },
        assert: [
          { type: 'equals', value: 'expected', metric: 'metric1' },
          { type: 'contains', value: 'partial', metric: 'metric2' },
        ],
      };

      const result = addHomoglyphs([testCase], 'prompt');

      expect(result[0].assert).toEqual([
        { type: 'equals', value: 'expected', metric: 'metric1/Homoglyph' },
        { type: 'contains', value: 'partial', metric: 'metric2/Homoglyph' },
      ]);
    });

    it('should handle test cases with no assertions', () => {
      const testCase: TestCase = { vars: { prompt: 'test' } };
      const result = addHomoglyphs([testCase], 'prompt');

      expect(result[0].assert).toBeUndefined();
    });
  });
});
