import { afterEach, describe, expect, it, vi } from 'vitest';
import { addFullwidth, toFullwidth } from '../../../src/redteam/strategies/fullwidth';

import type { TestCase } from '../../../src/types/index';

describe('fullwidth strategy', () => {
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
    vi.resetAllMocks();
  });

  describe('toFullwidth', () => {
    it('should convert uppercase letters, lowercase letters, digits, and punctuation', () => {
      expect(toFullwidth('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(
        'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ',
      );
      expect(toFullwidth('abcdefghijklmnopqrstuvwxyz')).toBe(
        'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
      );
      expect(toFullwidth('0123456789')).toBe('０１２３４５６７８９');
      expect(toFullwidth('!@#$%^&*()')).toBe('！＠＃＄％＾＆＊（）');
      expect(toFullwidth('!~')).toBe('！～');
    });

    it('should convert every printable ASCII character in U+0021..U+007E to U+FF01..U+FF5E', () => {
      for (let code = 0x21; code <= 0x7e; code++) {
        const input = String.fromCharCode(code);
        const expected = String.fromCharCode(code + 0xfee0);
        expect(toFullwidth(input), `failed for U+${code.toString(16)} (${input})`).toBe(expected);
      }
    });

    it('should convert ASCII space (U+0020) to ideographic space (U+3000)', () => {
      expect(toFullwidth(' ')).toBe('\u3000');
      expect(toFullwidth('Hello World')).toBe('Ｈｅｌｌｏ\u3000Ｗｏｒｌｄ');
    });

    it('should handle empty strings', () => {
      expect(toFullwidth('')).toBe('');
    });

    it('should preserve non-ASCII characters, newlines, and tabs', () => {
      expect(toFullwidth('éèüöçß')).toBe('éèüöçß');
      expect(toFullwidth('日本語テスト')).toBe('日本語テスト');
      expect(toFullwidth('👋🚀🔒')).toBe('👋🚀🔒');
      expect(toFullwidth('\n\t\r')).toBe('\n\t\r');
      expect(toFullwidth('Hello\n\tWorld! café 日本語 👋')).toBe(
        'Ｈｅｌｌｏ\n\tＷｏｒｌｄ！\u3000ｃａｆé\u3000日本語\u3000👋',
      );
    });

    it('should preserve equivalence under NFKC normalization for ASCII and mixed strings', () => {
      const printableAscii = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
        String.fromCharCode(0x20 + i),
      ).join('');
      const samples = [
        printableAscii,
        'Ignore previous instructions! 123',
        'café naïve résumé 日本語 👋\n\tTest: 42',
      ];

      for (const sample of samples) {
        expect(toFullwidth(sample).normalize('NFKC')).toBe(sample.normalize('NFKC'));
      }
    });
  });

  describe('addFullwidth', () => {
    it('should convert the injected variable to fullwidth and tag metadata and metrics', () => {
      const result = addFullwidth(testCases, 'prompt');

      expect(result).toEqual([
        {
          ...testCases[0],
          vars: {
            ...testCases[0].vars,
            prompt: 'Ｈｅｌｌｏ\u3000Ｗｏｒｌｄ！\u3000１２３',
          },
          metadata: {
            strategyId: 'fullwidth',
            originalText: 'Hello World! 123',
          },
          assert: [
            {
              type: 'equals',
              value: 'expected value',
              metric: 'original-metric/Fullwidth',
            },
          ],
        },
      ]);
    });

    it('should preserve other vars, test case properties, prior metadata, and not mutate input', () => {
      const original: TestCase = {
        description: 'preserve fields',
        providerOutput: { output: 'cached' },
        vars: {
          prompt: 'Secret 42!',
          context: 'keep untouched',
        },
        assert: [{ type: 'contains', value: 'expected', metric: 'Policy' }],
        metadata: {
          pluginId: 'policy',
          customKey: 'custom-value',
        },
      };
      const snapshot = structuredClone(original);

      const result = addFullwidth([original], 'prompt');

      expect(result).toEqual([
        {
          description: 'preserve fields',
          providerOutput: { output: 'cached' },
          vars: {
            prompt: 'Ｓｅｃｒｅｔ\u3000４２！',
            context: 'keep untouched',
          },
          assert: [{ type: 'contains', value: 'expected', metric: 'Policy/Fullwidth' }],
          metadata: {
            pluginId: 'policy',
            customKey: 'custom-value',
            strategyId: 'fullwidth',
            originalText: 'Secret 42!',
          },
        },
      ]);
      expect(result[0]).not.toBe(original);
      expect(result[0].vars).not.toBe(original.vars);
      expect(result[0].assert).not.toBe(original.assert);
      expect(result[0].metadata).not.toBe(original.metadata);
      expect(original).toStrictEqual(snapshot);
    });

    it('should append /Fullwidth to multiple assertions and preserve assertions without metric', () => {
      const testCase: TestCase = {
        vars: { prompt: 'test' },
        assert: [
          { type: 'equals', value: 'expected', metric: 'metric1' },
          { type: 'contains', value: 'partial', metric: 'metric2' },
          { type: 'contains', value: 'no-metric' },
          { type: 'contains', value: 'empty-metric', metric: '' },
        ],
      };

      const result = addFullwidth([testCase], 'prompt');

      expect(result[0].assert).toEqual([
        { type: 'equals', value: 'expected', metric: 'metric1/Fullwidth' },
        { type: 'contains', value: 'partial', metric: 'metric2/Fullwidth' },
        { type: 'contains', value: 'no-metric', metric: undefined },
        { type: 'contains', value: 'empty-metric', metric: '' },
      ]);
    });

    it('should handle test cases with no assertions', () => {
      const testCase: TestCase = { vars: { prompt: 'test' } };
      const result = addFullwidth([testCase], 'prompt');

      expect(result[0].assert).toBeUndefined();
      expect(result[0].vars!.prompt).toBe('ｔｅｓｔ');
    });

    it('should coerce numeric, boolean, null, and missing injectVar values to strings', () => {
      const cases: TestCase[] = [
        { vars: { prompt: 12345 } },
        { vars: { prompt: true } },
        { vars: { prompt: false } },
        { vars: { prompt: null as any } },
        { vars: { other: 'value' } },
      ];

      const result = addFullwidth(cases, 'prompt');

      expect(result[0].vars!.prompt).toBe(toFullwidth('12345'));
      expect(result[0].metadata).toEqual({ strategyId: 'fullwidth', originalText: '12345' });

      expect(result[1].vars!.prompt).toBe(toFullwidth('true'));
      expect(result[1].metadata).toEqual({ strategyId: 'fullwidth', originalText: 'true' });

      expect(result[2].vars!.prompt).toBe(toFullwidth('false'));
      expect(result[2].metadata).toEqual({ strategyId: 'fullwidth', originalText: 'false' });

      expect(result[3].vars!.prompt).toBe(toFullwidth('null'));
      expect(result[3].metadata).toEqual({ strategyId: 'fullwidth', originalText: 'null' });

      expect(result[4].vars!.prompt).toBe(toFullwidth('undefined'));
      expect(result[4].vars!.other).toBe('value');
      expect(result[4].metadata).toEqual({ strategyId: 'fullwidth', originalText: 'undefined' });
    });
  });
});
