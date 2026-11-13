import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { loadStrategy } from '../../../src/redteam/strategies/index';
import { addCharSplit } from '../../../src/redteam/strategies/outputFormat';
import { decodeCharSplitOutput } from '../../../src/util/transform';

import type { TestCase, TestCaseWithPlugin } from '../../../src/types/index';

describe('Character-split output', () => {
  it.each(['', '..', 'abc', ' ', '\t', '\n', '\u00a0', '\x00', null, 1, [':'], { a: ':' }])(
    'rejects invalid delimiter %p',
    (delimiter) => {
      expect(() => addCharSplit([{ vars: { prompt: 'hello' } }], 'prompt', { delimiter })).toThrow(
        'delimiter must be a single non-whitespace character',
      );
    },
  );

  it.each([
    ['.', 'H.e.l.l.o c.o-o.p.'],
    ['-', 'H-e-l-l-o c-o--o-p.'],
  ])('shows how to format punctuation with %s', (delimiter, example) => {
    const [test] = addCharSplit([{ vars: { prompt: '' } }], 'prompt', { delimiter });
    expect(test.vars?.prompt).toContain(`"Hello co-op." -> "${example}"`);
  });

  it.each([
    ['H.e.l.l.o w.o.r.l.d!', '.', 'Hello world!'],
    ['', '.', ''],
    ['L.i.n.e o.n.e\nL.i.n.e t.w.o', '.', 'Line one\nLine two'],
    ['H.e.l.l.o.. w.o.r.l.d..', '.', 'Hello. world.'],
    ['H.e.l.l.o c.o-o.p.', '.', 'Hello co-op.'],
    [' . .word.', '.', ' . .word.'],
    ['H-e-l-l-o-- c-o--o-p.', '-', 'Hello- co-op.'],
  ])('decodes %p using %p', (output, delimiter, expected) => {
    expect(decodeCharSplitOutput(output, delimiter)).toBe(expected);
  });

  describe('addCharSplit strategy', () => {
    it('stores a YAML-serializable delimiter and preserves the test transform', async () => {
      const testCases: TestCase[] = [
        {
          vars: {
            prompt: 'tell me a joke',
          },
          options: { transform: 'output.toUpperCase()' },
          assert: [
            {
              type: 'equals',
              value: 'Hello world!',
              metric: 'original-metric',
            },
          ],
        },
      ];

      const result = addCharSplit(testCases, 'prompt', { delimiter: '.' });
      expect(result).toHaveLength(1);
      expect(String(result[0].vars?.prompt)).toMatch(/^tell me a joke\n\nFormat your response/);
      expect(result[0].metadata).toEqual({
        strategyId: 'char-split',
        charSplitDelimiter: '.',
        originalText: 'tell me a joke',
      });
      expect(result[0].assert).toEqual([
        {
          type: 'equals',
          value: 'Hello world!',
          metric: 'original-metric/CharSplit',
        },
      ]);

      const dumpedYaml = yaml.dump(result[0], { skipInvalid: true });
      const reloaded = yaml.load(dumpedYaml) as TestCase;
      expect(reloaded.options?.transform).toBe('output.toUpperCase()');
      expect(reloaded.metadata?.charSplitDelimiter).toBe('.');

      expect(() => addCharSplit(testCases, 'prompt', { delimiter: 123 })).toThrow(
        'delimiter must be a single non-whitespace character',
      );
      expect(() => addCharSplit([{} as TestCase], 'prompt')).toThrow('testCase.vars is required');
    });

    it('loads and executes through loadStrategy("char-split")', async () => {
      const strategy = await loadStrategy('char-split');
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { prompt: 'hello' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];
      const result = await strategy.action(testCases, 'prompt', { delimiter: '-' });
      expect(result).toHaveLength(1);
      expect(result[0].metadata?.strategyId).toBe('char-split');
      expect(String(result[0].vars?.prompt)).toContain("'-'");
    });
  });
});
