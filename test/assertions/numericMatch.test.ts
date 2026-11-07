import { describe, expect, it } from 'vitest';
import {
  extractNumbers,
  getStatedAnswerText,
  handleNumericMatch,
} from '../../src/assertions/numericMatch';

import type { Assertion, AssertionParams } from '../../src/types/index';

function runNumericMatch(
  output: string,
  value: unknown,
  options: { threshold?: number; mode?: string; inverse?: boolean } = {},
) {
  const assertion: Assertion = {
    type: options.inverse ? 'not-numeric-match' : 'numeric-match',
    value: value as Assertion['value'],
    ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
    ...(options.mode === undefined ? {} : { config: { mode: options.mode } }),
  };
  return handleNumericMatch({
    assertion,
    baseType: 'numeric-match',
    inverse: options.inverse ?? false,
    output,
    outputString: output,
    renderedValue: value as AssertionParams['renderedValue'],
    providerResponse: { output },
    test: {},
    assertionValueContext: {} as AssertionParams['assertionValueContext'],
  });
}

describe('extractNumbers', () => {
  it.each([
    ['$416.2 billion', 416.2e9],
    ['416,161 million', 416_161e6],
    ['$416.16B', 416.16e9],
    ['416161000000', 416_161_000_000],
    ['€3.5bn', 3.5e9],
    ['£12 mn', 12e6],
    ['250K', 250e3],
    ['1.2 trillion', 1.2e12],
    ['5 thousand', 5e3],
    ['(1,234)', -1234],
    ['-3.5', -3.5],
    ['$-42', -42],
    ['.75', 0.75],
  ])('normalizes %s', (text, expected) => {
    expect(extractNumbers(text)).toEqual([expected]);
  });

  it.each([
    ['4.16161e11', 4.16161e11],
    ['1e-7', 1e-7],
    ['$4.16E+11', 4.16e11],
    ['2.5e3 million', 2.5e9],
  ])('parses scientific notation %s as one number', (text, expected) => {
    expect(extractNumbers(text)).toEqual([expected]);
  });

  it('drops values that overflow when scaled', () => {
    expect(extractNumbers(`${'9'.repeat(300)} trillion and 5`)).toEqual([5]);
  });

  it('ignores digits inside words', () => {
    expect(extractNumbers('Apple FY2025 Q3 revenue was $94.0 billion')).toEqual([94e9]);
  });

  it('does not treat a following word as a scale suffix', () => {
    expect(extractNumbers('5 months and 3 bottles')).toEqual([5, 3]);
  });

  it('returns every number in order', () => {
    expect(extractNumbers('From $391.0 billion to $416.2 billion')).toEqual([391e9, 416.2e9]);
  });
});

describe('getStatedAnswerText', () => {
  it('returns the last final answer line', () => {
    expect(
      getStatedAnswerText('Revenue was $90.7 billion.\nFinal answer: $89.3 billion\nThanks'),
    ).toBe('$89.3 billion');
  });

  it.each([
    ['Final answer -42', '-42'],
    ['Final answer: -42', '-42'],
    ['Final answer - 42', '42'],
    ['Final answer — $5 million', '$5 million'],
  ])('keeps a minus sign attached to the number in %s', (text, expected) => {
    expect(getStatedAnswerText(text)).toBe(expected);
  });

  it('returns the whole output when there is no final answer line', () => {
    expect(getStatedAnswerText('About $5 million')).toBe('About $5 million');
  });
});

describe('handleNumericMatch', () => {
  it.each(['$416.2 billion', '416,161 million', '$416.16B', '416161000000'])(
    'passes a correct answer written as %s',
    (output) => {
      const result = runNumericMatch(`Total net sales were ${output}.`, 416_161_000_000);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    },
  );

  it('fails the prior-year figure that a contains check would accept', () => {
    const result = runNumericMatch('Total net sales were $391.0 billion.', 416_161_000_000);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('391000000000');
  });

  it('grades the final answer line instead of other numbers in the output', () => {
    const output = 'Operating income was $90.7 billion in one view.\nFinal answer: $89.3 billion';
    expect(runNumericMatch(output, 90.7e9).pass).toBe(false);
    expect(runNumericMatch(output, 89.3e9).pass).toBe(true);
  });

  it('accepts a numeric string as the expected value', () => {
    expect(runNumericMatch('About 416,161 million', '$416.161 billion').pass).toBe(true);
  });

  it('uses the threshold as the relative tolerance', () => {
    expect(runNumericMatch('105', 100, { threshold: 0.05 }).pass).toBe(true);
    expect(runNumericMatch('106', 100, { threshold: 0.05 }).pass).toBe(false);
  });

  it('scores near misses above wild misses', () => {
    const exact = runNumericMatch('100', 100, { threshold: 0.1 });
    const near = runNumericMatch('103', 100, { threshold: 0.1 });
    const far = runNumericMatch('150', 100, { threshold: 0.1 });
    expect(exact.score).toBe(1);
    expect(near.score).toBeCloseTo(0.7);
    expect(far.score).toBe(0);
  });

  it('supports first, last and closest modes', () => {
    const output = 'Last year 391 billion, this year 416 billion, next year 450 billion';
    expect(runNumericMatch(output, 416e9, { mode: 'first' }).pass).toBe(false);
    expect(runNumericMatch(output, 391e9, { mode: 'first' }).pass).toBe(true);
    expect(runNumericMatch(output, 450e9, { mode: 'last' }).pass).toBe(true);
    expect(runNumericMatch(output, 416e9, { mode: 'closest' }).pass).toBe(true);
  });

  it('uses absolute error when the expected value is zero', () => {
    expect(runNumericMatch('0.001', 0, { threshold: 0.01 }).pass).toBe(true);
    expect(runNumericMatch('0.5', 0, { threshold: 0.01 }).pass).toBe(false);
  });

  it('handles accounting negatives', () => {
    expect(runNumericMatch('Net loss: (1,234)', -1234).pass).toBe(true);
    expect(runNumericMatch('Net loss: (1,234)', 1234).pass).toBe(false);
  });

  it('fails when the output has no number', () => {
    const result = runNumericMatch('I could not find that figure.', 42);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('no number was found');
  });

  it('inverts the result for not-numeric-match', () => {
    const near = runNumericMatch('100', 100, { inverse: true });
    expect(near.pass).toBe(false);
    expect(near.score).toBe(0);
    const far = runNumericMatch('200', 100, { inverse: true });
    expect(far.pass).toBe(true);
    expect(far.score).toBe(1);
    expect(runNumericMatch('no numbers', 100, { inverse: true }).pass).toBe(true);
  });

  describe('stated answers from real 10-K Q&A runs (#11909)', () => {
    const examples = [
      'Per the 10-K, net sales were $416.2 billion.',
      'In fiscal 2025, net sales were $416.2 billion.',
      'Net sales grew 6% to $416.2 billion.',
      'Total net sales (Item 8) were $416.2 billion.',
    ];

    it.each(examples)('passes with the default mode: %s', (output) => {
      expect(runNumericMatch(output, 416_161_000_000).pass).toBe(true);
    });

    it.each(examples.slice(0, 3))(
      'skips SEC form names, bare years and percentages in first mode: %s',
      (output) => {
        expect(runNumericMatch(output, 416_161_000_000, { mode: 'first' }).pass).toBe(true);
      },
    );

    it('skips incidental numbers in last mode', () => {
      const output = 'Net sales were $416.2 billion, up 6%, per the 10-Q filed in 2025';
      expect(runNumericMatch(output, 416_161_000_000, { mode: 'last' }).pass).toBe(true);
    });

    it.each([
      ['8-K', 8],
      ['20-F', 20],
      ['6-K', 6],
    ])('treats %s as a form name', (form, value) => {
      expect(runNumericMatch(`Filed a ${form}; total 42`, 42, { mode: 'first' }).pass).toBe(true);
      expect(runNumericMatch(`Filed a ${form}; total 42`, value, { mode: 'first' }).pass).toBe(
        false,
      );
    });

    it('does not skip years with currency, scale or separators', () => {
      expect(runNumericMatch('Revenue was $2025 then', 2025, { mode: 'first' }).pass).toBe(true);
      expect(runNumericMatch('About 2,025 units, 7 left', 2025, { mode: 'first' }).pass).toBe(true);
    });

    it('falls back to incidental numbers when nothing else is left', () => {
      expect(runNumericMatch('Final answer: 2025', 2025, { mode: 'first' }).pass).toBe(true);
      expect(runNumericMatch('Growth was 6%', 6, { mode: 'last' }).pass).toBe(true);
    });
  });

  it('grades scientific notation in output and expected values', () => {
    expect(runNumericMatch('Net sales: 4.16161e11', 416_161_000_000).pass).toBe(true);
    expect(runNumericMatch('About 0.0000001', '1e-7').pass).toBe(true);
  });

  it('keeps a negative final answer written without a colon', () => {
    expect(runNumericMatch('Change was 42 points.\nFinal answer -42', -42).pass).toBe(true);
    expect(runNumericMatch('Final answer -42', 42).pass).toBe(false);
  });

  describe('Markdown bullets and prose (Codex review)', () => {
    it.each([
      ['- $42', 42],
      ['- 42', 42],
      ['* 42', 42],
    ])('does not read the bullet in "%s" as a minus sign', (text, expected) => {
      expect(extractNumbers(text)).toEqual([expected]);
    });

    it('still reads signs that touch the number', () => {
      expect(extractNumbers('-$42')).toEqual([-42]);
      expect(extractNumbers('$-42')).toEqual([-42]);
      expect(extractNumbers('- -42')).toEqual([-42]);
    });

    it('grades a positive bullet under a Final answer heading', () => {
      const output = 'Change was -7.\nFinal answer:\n- $42';
      expect(runNumericMatch(output, 42).pass).toBe(true);
      expect(runNumericMatch(output, -42).pass).toBe(false);
      expect(runNumericMatch('## Final answer\n* 42\n\nNotes: 7', 42, { mode: 'first' }).pass).toBe(
        true,
      );
    });

    it('stops a bare heading block at the next blank line', () => {
      expect(getStatedAnswerText('Final answer:\n- $42\n- $43\n\nExtra 99')).toBe('\n- $42\n- $43');
    });

    it('does not treat prose that mentions the phrase as a heading', () => {
      const output = 'To get the final answer, apply the formula.\nResult: 42';
      expect(getStatedAnswerText(output)).toBe(output);
      expect(runNumericMatch(output, 42).pass).toBe(true);
      expect(getStatedAnswerText('The final answer: 5')).toBe('The final answer: 5');
    });

    it('requires a word boundary after the phrase', () => {
      const output = 'Final answers were collected: 7\nTotal: 42';
      expect(getStatedAnswerText(output)).toBe(output);
    });

    it('accepts Markdown-decorated headings', () => {
      expect(getStatedAnswerText('Work...\n**Final answer:** $42')).toBe('$42');
      expect(getStatedAnswerText('> Final answer: 42')).toBe('42');
    });
  });

  it('rejects expected values that overflow when scaled', () => {
    expect(() => runNumericMatch('1', `${'9'.repeat(300)} trillion`)).toThrow('overflows');
  });

  it('rejects invalid configuration', () => {
    expect(() => runNumericMatch('1', 'one and two: 1, 2')).toThrow('exactly one number');
    expect(() => runNumericMatch('1', { a: 1 })).toThrow('number or numeric string');
    expect(() => runNumericMatch('1', 1, { threshold: -1 })).toThrow('non-negative');
    expect(() => runNumericMatch('1', 1, { mode: 'median' })).toThrow('config.mode');
  });
});
