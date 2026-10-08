import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addArabicPresentationForms,
  arabicPresentationFormsMap,
  toArabicPresentationForms,
} from '../../../src/redteam/strategies/arabicPresentationForms';

import type { TestCase } from '../../../src/types/index';

describe('arabic-presentation-forms strategy', () => {
  const testCases: TestCase[] = [
    {
      vars: {
        prompt: 'مرحبا بالعالم! 123',
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
    vi.resetAllMocks();
  });

  describe('toArabicPresentationForms', () => {
    it('should convert standard Arabic letters to presentation forms', () => {
      expect(toArabicPresentationForms('ا')).toBe(arabicPresentationFormsMap['ا']);
      expect(toArabicPresentationForms('ب')).toBe(arabicPresentationFormsMap['ب']);
      expect(toArabicPresentationForms('ي')).toBe(arabicPresentationFormsMap['ي']);
    });

    it('should map every core Arabic letter to a presentation form', () => {
      const coreLetters = 'ءاأؤإئابتثجحخدرزسشصضطظعغفقكلمنهويىة';
      for (const char of coreLetters) {
        const mapped = arabicPresentationFormsMap[char];
        expect(mapped, `missing presentation form for '${char}'`).toBeDefined();
        expect(toArabicPresentationForms(char), `'${char}' left unmapped`).not.toBe(char);
      }
    });

    it('should map presentation forms outside the standard Arabic block', () => {
      for (const char of Object.keys(arabicPresentationFormsMap)) {
        const mapped = arabicPresentationFormsMap[char];
        const codePoint = mapped.codePointAt(0) ?? 0;
        const inFormsA = codePoint >= 0xfb50 && codePoint <= 0xfdff;
        const inFormsB = codePoint >= 0xfe70 && codePoint <= 0xfeff;
        expect(
          inFormsA || inFormsB,
          `'${char}' maps to U+${codePoint.toString(16)} which is outside presentation forms`,
        ).toBe(true);
      }
    });

    it('preserves the mapped letters under compatibility normalization', () => {
      const input = Object.keys(arabicPresentationFormsMap).join('') + ' مرحبًا! English 👋';
      expect(toArabicPresentationForms(input).normalize('NFKC')).toBe(input.normalize('NFKC'));
      expect(toArabicPresentationForms('مرحبا')).toBe('ﻡﺭﺡﺏﺍ');
    });

    it('should handle empty strings', () => {
      expect(toArabicPresentationForms('')).toBe('');
    });

    it('should preserve Latin, digits, and punctuation', () => {
      expect(toArabicPresentationForms('Hello World! 123')).toBe('Hello World! 123');
      expect(toArabicPresentationForms('!@#$%^&*()')).toBe('!@#$%^&*()');
      expect(toArabicPresentationForms(' ')).toBe(' ');
    });

    it('should preserve unmapped characters', () => {
      const nonArabic = '☺★♥♦♣♠€£¥©®™';
      expect(toArabicPresentationForms(nonArabic)).toBe(nonArabic);
    });

    it('should handle mixed Arabic and Latin content', () => {
      const input = 'Hello مرحبا 123!';
      const output = toArabicPresentationForms(input);
      expect(output).not.toBe(input);
      expect(output).toContain('Hello');
      expect(output).toContain('123!');
    });

    it('should handle all mapped characters', () => {
      Object.keys(arabicPresentationFormsMap).forEach((char) => {
        const result = toArabicPresentationForms(char);
        expect(result).toBe(arabicPresentationFormsMap[char]);
      });
    });
  });

  describe('addArabicPresentationForms', () => {
    it('should convert Arabic text to presentation forms', () => {
      const injectVar = 'prompt';
      const result = addArabicPresentationForms(testCases, injectVar);

      expect(result).toEqual([
        {
          ...testCases[0],
          vars: {
            ...testCases[0].vars,
            prompt: expect.not.stringMatching(/^مرحبا بالعالم! 123$/),
          },
          metadata: {
            strategyId: 'arabic-presentation-forms',
            originalText: 'مرحبا بالعالم! 123',
          },
          assert: [
            {
              type: 'equals',
              value: 'expected value',
              metric: 'original-metric/ArabicPresentationForms',
            },
          ],
        },
      ]);
    });

    it('should leave non-Arabic text unchanged but still tag metadata', () => {
      const testCase: TestCase = { vars: { prompt: 'Hello World! 123' } };
      const result = addArabicPresentationForms([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe('Hello World! 123');
      expect(result[0].metadata).toMatchObject({
        strategyId: 'arabic-presentation-forms',
        originalText: 'Hello World! 123',
      });
    });

    it('handles an omitted vars object', () => {
      expect(addArabicPresentationForms([{}], 'prompt')[0].vars?.prompt).toBe('undefined');
    });

    it('should handle undefined vars', () => {
      const testCase: TestCase = { vars: {} };
      const result = addArabicPresentationForms([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toArabicPresentationForms('undefined'));
    });

    it('should handle missing inject var', () => {
      const testCase: TestCase = { vars: { other: 'value' } };
      const result = addArabicPresentationForms([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toArabicPresentationForms('undefined'));
      expect(result[0].vars!.other).toBe('value');
    });

    it('should handle very long strings', () => {
      const longString = 'ب'.repeat(1000);
      const testCase: TestCase = { vars: { prompt: longString } };
      const result = addArabicPresentationForms([testCase], 'prompt');
      expect(result[0].vars!.prompt).not.toBe(longString);
      expect(result[0].vars!.prompt).toBe(arabicPresentationFormsMap['ب'].repeat(1000));
    });

    it('should handle null input by converting to string', () => {
      const testCase: TestCase = { vars: { prompt: null as any } };
      const result = addArabicPresentationForms([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toArabicPresentationForms('null'));
    });

    it('should handle numeric input by converting to string', () => {
      const testCase: TestCase = { vars: { prompt: 12345 } };
      const result = addArabicPresentationForms([testCase], 'prompt');
      expect(result[0].vars!.prompt).toBe(toArabicPresentationForms('12345'));
    });

    it('should preserve assertion objects', () => {
      const testCase: TestCase = {
        vars: { prompt: 'مرحبا' },
        assert: [
          { type: 'equals', value: 'expected', metric: 'metric1' },
          { type: 'contains', value: 'partial', metric: 'metric2' },
        ],
      };

      const result = addArabicPresentationForms([testCase], 'prompt');

      expect(result[0].assert).toEqual([
        { type: 'equals', value: 'expected', metric: 'metric1/ArabicPresentationForms' },
        { type: 'contains', value: 'partial', metric: 'metric2/ArabicPresentationForms' },
      ]);
    });

    it('should handle test cases with no assertions', () => {
      const testCase: TestCase = { vars: { prompt: 'مرحبا' } };
      const result = addArabicPresentationForms([testCase], 'prompt');

      expect(result[0].assert).toBeUndefined();
    });
  });
});
