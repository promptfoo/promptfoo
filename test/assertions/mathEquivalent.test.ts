/**
 * Tests for the math-equivalent assertion: helper-level coverage of
 * normalization, cleaning, extraction, and parsing, plus end-to-end
 * equivalence checks against representative LLM-output shapes.
 */
import { ComputeEngine } from '@cortex-js/compute-engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanMathText,
  extractMathAnswer,
  handleMathEquivalent,
  isMathEquivalent,
  normalizeLatex,
  parseMathExpression,
  tryParseEachSegment,
} from '../../src/assertions/mathEquivalent';

import type { AssertionParams } from '../../src/types/index';

// =============================================================================
// normalizeLatex
// =============================================================================

describe('normalizeLatex', async () => {
  describe('approximation symbols', async () => {
    it('strips ≈ and the variable assignment around it', async () => {
      const result = normalizeLatex('V ≈ 5.09');
      expect(result.includes('≈')).toBe(false);
      expect(result.includes('5.09')).toBe(true);
    });

    it('strips \\approx and the variable assignment around it', async () => {
      const result = normalizeLatex('V \\approx 5.09');
      expect(result.includes('\\approx')).toBe(false);
      expect(result.includes('5.09')).toBe(true);
    });
  });

  describe('variable-assignment prefix', async () => {
    it('strips "V = " prefix', async () => {
      expect(normalizeLatex('V = 5.09')).toBe('5.09');
    });

    it('strips "V ≈ " prefix', async () => {
      expect(normalizeLatex('V ≈ 5.09')).toBe('5.09');
    });

    it('strips "x_0 = " prefix', async () => {
      expect(normalizeLatex('x_0 = 3')).toBe('3');
    });

    it('does not strip pure expressions', async () => {
      expect(normalizeLatex('5.09')).toBe('5.09');
    });
  });

  describe('\\frac normalization', async () => {
    it('adds braces around single-char denominator', async () => {
      expect(normalizeLatex('\\frac{32}3')).toBe('\\frac{32}{3}');
    });

    it('does not corrupt nested \\frac with braced numerator', async () => {
      const expr = '\\frac{8\\pi(2\\sqrt{2}-1)}{3}';
      expect(normalizeLatex(expr)).toBe(expr);
    });

    it('leaves a fully-braced \\frac alone', async () => {
      expect(normalizeLatex('\\frac{1}{2}')).toBe('\\frac{1}{2}');
    });

    it('expands \\fracAB (two bare single chars) to \\frac{A}{B}', async () => {
      expect(normalizeLatex('\\frac32')).toBe('\\frac{3}{2}');
    });

    it('does not corrupt "\\frac{32} + 2" by capturing whitespace as a denominator', async () => {
      // Earlier versions captured the trailing space as the new denominator,
      // producing "\\frac{32}{ }+ 2" which CortexJS could not parse.
      expect(normalizeLatex('\\frac{32} + 2')).toBe('\\frac{32} + 2');
    });

    it('does not auto-brace a non-letter/digit/backslash denominator', async () => {
      expect(normalizeLatex('\\frac{32}+2')).toBe('\\frac{32}+2');
    });

    it('braces a backslash-command denominator (\\frac{1}\\pi → \\frac{1}{\\pi})', async () => {
      // Earlier versions captured only the leading backslash and produced
      // "\\frac{1}{\\}pi" which CortexJS could not parse; the regex must
      // grab the entire LaTeX command token as the denominator.
      expect(normalizeLatex('\\frac{1}\\pi')).toBe('\\frac{1}{\\pi}');
    });

    it('braces a multi-letter command denominator (\\frac{2}\\theta)', async () => {
      expect(normalizeLatex('\\frac{2}\\theta')).toBe('\\frac{2}{\\theta}');
    });
  });

  describe('trig backslash insertion', async () => {
    it('escapes cos(', async () => {
      expect(normalizeLatex('cos(4)')).toContain('\\cos(');
    });

    it('escapes sin(', async () => {
      expect(normalizeLatex('sin(x)')).toContain('\\sin(');
    });

    it('escapes cos<digit> as \\cos(<digit>)', async () => {
      expect(normalizeLatex('6cos4')).toContain('\\cos');
    });

    it('escapes sin<digit> as \\sin(<digit>)', async () => {
      expect(normalizeLatex('sin2')).toContain('\\sin');
    });

    it('escapes ln(', async () => {
      expect(normalizeLatex('ln(x)')).toContain('\\ln(');
    });

    it('escapes sqrt(', async () => {
      expect(normalizeLatex('sqrt(x)')).toContain('\\sqrt(');
    });

    it('does not double-escape \\cos(', async () => {
      const result = normalizeLatex('\\cos(4)');
      expect(result.split('\\cos').length - 1).toBe(1);
    });

    it('escapes arctan as \\arctan, not arc\\tan', async () => {
      const result = normalizeLatex('arctan(x)');
      expect(result).toContain('\\arctan');
      expect(result).not.toContain('arc\\tan');
    });

    it.each([
      ['sqrt2var', 'sqrt2var'],
      ['sqrt2_x', 'sqrt2_x'],
      ['cos4abc', 'cos4abc'],
      ['log10base', 'log10base'],
    ])('does not split identifier-like trailing tokens (%s)', async (input, expected) => {
      // Adding a trailing-word-boundary guard ((?!\w)) prevents the trig
      // regexes from rewriting identifiers like `sqrt2var` to `\sqrt(2)var`.
      expect(normalizeLatex(input)).toBe(expected);
    });

    it.each([
      ['sqrt2', '\\sqrt(2)'],
      ['cos4', '\\cos(4)'],
      ['cos 4', '\\cos(4)'],
      ['sin x', '\\sin(x)'],
      ['sqrt 23', '\\sqrt(23)'],
    ])('still rewrites legitimate function shorthand (%s → %s)', async (input, expected) => {
      expect(normalizeLatex(input)).toBe(expected);
    });
  });

  describe('Unicode characters', async () => {
    it('converts unicode minus (−) to ASCII -', async () => {
      expect(normalizeLatex('−1/4')).toBe('-1/4');
    });

    it('converts √N to \\sqrt{N}', async () => {
      expect(normalizeLatex('20√57')).toBe('20\\sqrt{57}');
    });

    it('converts √{...} to \\sqrt{...}', async () => {
      expect(normalizeLatex('√{2}')).toBe('\\sqrt{2}');
    });

    it('converts √ over variables and commands to braced \\sqrt arguments', async () => {
      expect(normalizeLatex('√x')).toBe('\\sqrt{x}');
      expect(normalizeLatex('√\\pi')).toBe('\\sqrt{\\pi}');
    });

    it('converts × to *', async () => {
      // a × b = 2 → a * b = 2 → after assignment strip: not applied (lhs is "a * b")
      // but the unicode replacement itself should fire.
      expect(normalizeLatex('a × b')).toContain('*');
    });
  });

  describe('thousands separators vs european decimal commas', async () => {
    it.each([
      ['1,000', '1000'],
      ['1,234', '1234'],
      ['1,234,567', '1234567'],
      ['12,345', '12345'],
      ['100,000,000', '100000000'],
    ])('strips US thousands separators ("%s" → "%s")', async (input, expected) => {
      expect(normalizeLatex(input)).toBe(expected);
    });

    it.each([
      ['2,00625', '2.00625'],
      ['3,14159', '3.14159'],
    ])('still rewrites European decimal commas ("%s" → "%s")', async (input, expected) => {
      expect(normalizeLatex(input)).toBe(expected);
    });

    it('leaves coordinate-style "(2,3)" alone', async () => {
      expect(normalizeLatex('(2,3)')).toBe('(2,3)');
    });
  });

  describe('european decimal comma', async () => {
    it('converts "2,00625" to "2.00625"', async () => {
      expect(normalizeLatex('2,00625')).toBe('2.00625');
    });

    it('does not mangle short comma-separated pairs (2,3)', async () => {
      // Single-digit on the right of the comma should be left as-is.
      expect(normalizeLatex('2,3')).toBe('2,3');
    });
  });

  describe('parenthetical suffixes', async () => {
    it('strips trailing "(i.e., ...)"', async () => {
      const result = normalizeLatex('-1/4 (i.e., -$0.25)');
      expect(result).toBe('-1/4');
    });

    it('strips leading = symbol', async () => {
      expect(normalizeLatex('= 33167.52')).toBe('33167.52');
    });

    it('strips leading ≈ symbol after conversion', async () => {
      expect(normalizeLatex('≈ 33167.52')).toBe('33167.52');
    });
  });
});

// =============================================================================
// cleanMathText
// =============================================================================

describe('cleanMathText', async () => {
  it('strips <think> blocks', async () => {
    expect(cleanMathText('<think>\nwork\n</think>\n0.5')).toBe('0.5');
  });

  it('strips multi-line <think> blocks', async () => {
    expect(cleanMathText('<think>\nlong\nwork\n</think>\n\n42')).toBe('42');
  });

  it('strips redacted thinking blocks', async () => {
    const raw = 'Thinking: \nSignature: AbCd123\n\n0.5';
    expect(cleanMathText(raw)).toBe('0.5');
  });

  it('strips Anthropic redacted thinking blocks', async () => {
    expect(cleanMathText('Redacted Thinking: $$99$$\n\n0.5')).toBe('0.5');
  });

  it('strips thinking blocks with content before a signature line', async () => {
    expect(cleanMathText('Thinking: $$99$$\nSignature: AbCd123\n\n0.5')).toBe('0.5');
  });

  it('strips signatureless thinking blocks', async () => {
    expect(cleanMathText('Thinking: $$99$$\n\n0.5')).toBe('0.5');
  });

  it('strips multi-paragraph thinking blocks before a signature line', async () => {
    expect(cleanMathText('Thinking: line1\n\nline2 $$2$$\nSignature: AbCd123\n\n0.5')).toBe('0.5');
  });

  it('strips multi-paragraph signatureless thinking blocks', async () => {
    // Provider format is `Thinking: ${reasoning}\n\n${output}` — reasoning uses
    // single newlines between paragraphs, not blank-line separators.
    expect(cleanMathText('Thinking: line1\nline2 $$2$$\n\n0.5')).toBe('0.5');
  });

  it('stops signatureless thinking strip at the first blank line before output', async () => {
    expect(cleanMathText('Thinking: hidden\n\nFinal answer: 3\n\nNotes')).toBe(
      'Final answer: 3\n\nNotes',
    );
  });

  it('strips Bedrock <thinking> blocks', async () => {
    expect(cleanMathText('<thinking>\n$$2$$\n</thinking>\n\n0.5')).toBe('0.5');
  });

  it('strips \\text{...} units', async () => {
    expect(cleanMathText('10 \\text{m}')).toBe('10');
  });

  it('strips \\text{...} with backslash-space prefix', async () => {
    expect(cleanMathText('10\\ \\text{km}')).toBe('10');
  });

  it.each([
    ['10 m', '10'],
    ['5.2 kg', '5.2'],
    ['45 deg', '45'],
    ['45°', '45'],
    ['3.14 s', '3.14'],
  ])('strips trailing unit "%s" → "%s"', async (input, expected) => {
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['10kg', '10'],
    ['5m', '5'],
    ['45deg', '45'],
    ['100ms', '100'],
    ['5.2km', '5.2'],
    ['100mm', '100'],
    ['9.81rad', '9.81'],
  ])('strips trailing unit attached to the number "%s" → "%s"', async (input, expected) => {
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['Vm', 'Vm'],
    ['5kgsmth', '5kgsmth'],
    ['50sec', '50sec'],
    ['\\sum', '\\sum'],
    ['\\lim', '\\lim'],
  ])('does not strip an identifier whose suffix happens to contain a unit (%s)', async (input, expected) => {
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['x + m', 'x + m'],
    ['x + y * m', 'x + y * m'],
    ['a - b - g', 'a - b - g'],
    ['p + q * s', 'p + q * s'],
    ['2*m + 3*s', '2*m + 3*s'],
  ])('does not strip single-letter unit when used as a variable in an algebraic expression (%s)', async (input, expected) => {
    // Earlier versions stripped any `\s+m\s*$` (and later, any
    // digit-or-space lookbehind), which corrupted "x + m" to "x +".
    // Only strip when a number is the immediate left context of the unit.
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['1/2 m', '1/2'],
    ['1/2m', '1/2'],
    ['1.5/2.5 kg', '1.5/2.5'],
    ['\\frac{1}{2} kg', '\\frac{1}{2}'],
    ['\\frac{1}{2}m', '\\frac{1}{2}'],
    ['\\frac{8\\pi}{3} m', '\\frac{8\\pi}{3}'],
    ['\\dfrac{1}{2} m', '\\dfrac{1}{2}'],
    ['\\sqrt{2} m', '\\sqrt{2}'],
    ['\\frac{1}{\\sqrt{2}} m', '\\frac{1}{\\sqrt{2}}'],
    ['\\frac{1}{\\sqrt{\\frac{2}{3}}} kg', '\\frac{1}{\\sqrt{\\frac{2}{3}}}'],
  ])('strips trailing unit after a fractional/LaTeX answer (%s → %s)', async (input, expected) => {
    // The unit cleanup previously only matched a plain integer/decimal as
    // the left context, so "1/2 m" or "\\frac{1}{2} kg" left the unit in
    // place and CE then parsed it as a symbolic factor (e.g. `m`).
    expect(cleanMathText(input)).toBe(expected);
  });

  it('strips display math $$...$$', async () => {
    expect(cleanMathText('$$\\frac{1}{2}$$')).toBe('\\frac{1}{2}');
  });

  it('strips display math \\[ ... \\]', async () => {
    expect(cleanMathText('\\[\\frac{1}{2}\\]')).toBe('\\frac{1}{2}');
  });

  it('strips inline math \\( ... \\)', async () => {
    expect(cleanMathText('\\(\\frac{1}{2}\\)')).toBe('\\frac{1}{2}');
  });

  it('strips inline math $...$', async () => {
    expect(cleanMathText('$\\frac{1}{2}$')).toBe('\\frac{1}{2}');
  });

  it('strips bold markdown', async () => {
    expect(cleanMathText('**42**')).toBe('42');
  });

  it('strips italic markdown', async () => {
    expect(cleanMathText('*42*')).toBe('42');
  });

  it('preserves V = 32 inside bold markers', async () => {
    expect(cleanMathText('**V = 32**')).toBe('V = 32');
  });

  it.each([
    ['2*3*4', '2*3*4'],
    ['1*2', '1*2'],
    ['x*y*z', 'x*y*z'],
    ['2*x*3', '2*x*3'],
  ])('preserves * multiplication operators (%s)', async (input, expected) => {
    // The italic regex must NOT match asterisks adjacent to digits/letters,
    // otherwise "2*3*4" silently collapses to "234" before parsing.
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['2**3**4', '2**3**4'],
    ['x**y**z', 'x**y**z'],
  ])('preserves ** exponent / multiplication operators (%s)', async (input, expected) => {
    expect(cleanMathText(input)).toBe(expected);
  });

  it('returns empty string unchanged', async () => {
    expect(cleanMathText('')).toBe('');
  });

  it('leaves a plain number alone', async () => {
    expect(cleanMathText('0.5')).toBe('0.5');
  });
});

// =============================================================================
// parseMathExpression / tryParseEachSegment
// =============================================================================

describe('parseMathExpression', async () => {
  it('parses an integer', async () => {
    const result = await parseMathExpression('42');
    expect(result).toBeDefined();
  });

  it('parses a decimal', async () => {
    const result = await parseMathExpression('0.5');
    expect(result).toBeDefined();
  });

  it('parses a LaTeX \\frac', async () => {
    const result = await parseMathExpression('\\frac{1}{2}');
    expect(result).toBeDefined();
  });

  it('parses plain division 32/3', async () => {
    const result = await parseMathExpression('32/3');
    expect(result).toBeDefined();
  });

  it('parses cos(\\pi)', async () => {
    const result = await parseMathExpression('\\cos(\\pi)');
    expect(result).toBeDefined();
  });

  it('parses cos(4) (no backslash) after normalization', async () => {
    const result = await parseMathExpression('cos(4)');
    expect(result).toBeDefined();
  });

  it('strips "V ≈ " before parsing 5.09', async () => {
    const result = await parseMathExpression('V ≈ 5.09');
    expect(result).toBeDefined();
  });

  it('strips "a = " and parses 2', async () => {
    const result = await parseMathExpression('a = 2');
    expect(result).toBeDefined();
  });

  it('returns undefined for an empty string', async () => {
    expect(await parseMathExpression('')).toBeUndefined();
  });

  it('rejects bare equality "1 = 2" as not a value', async () => {
    // The variable-assignment prefix-strip regex only fires when the LHS is an
    // identifier. "1 = 2" survives normalization unchanged and parses as an
    // Equal expression, which we treat as not-a-value.
    expect(await parseMathExpression('1 = 2')).toBeUndefined();
  });

  describe('rejects pure prose to prevent letter-multiplication false positives', async () => {
    it.each([
      ['apple'],
      ['hello'],
      ['no answer here'],
      ['some long prose with no answer'],
      ['the quick brown fox'],
    ])('rejects %s', async (input) => {
      expect(await parseMathExpression(input)).toBeUndefined();
    });

    it.each([
      ['42'],
      ['a+b'],
      ['x^2'],
      ['\\pi'],
      ['xy'], // 2-letter implicit product is intentionally still allowed
      ['\\frac{1}{2}'],
    ])('still parses %s as math', async (input) => {
      expect(await parseMathExpression(input)).toBeDefined();
    });
  });
});

describe('tryParseEachSegment', async () => {
  it('returns the rightmost parseable segment of an equality chain', async () => {
    const result = await tryParseEachSegment('a × b = 4 × 1 = 4');
    expect(result).toBeDefined();
  });

  it('returns undefined for an empty string', async () => {
    expect(await tryParseEachSegment('')).toBeUndefined();
  });
});

// =============================================================================
// extractMathAnswer
// =============================================================================

describe('extractMathAnswer', async () => {
  it('returns a plain number unchanged', async () => {
    expect(await extractMathAnswer('0.5')).toBe('0.5');
  });

  it('returns the last non-trivial line', async () => {
    expect(await extractMathAnswer('blah\nblah\n0.5')).toBe('0.5');
  });

  it('extracts a simple \\boxed{}', async () => {
    expect(await extractMathAnswer('answer is $\\boxed{42}$')).toBe('42');
  });

  it('extracts a \\boxed{\\frac{...}}', async () => {
    expect(await extractMathAnswer('\\boxed{\\frac{1}{2}}')).toBe('\\frac{1}{2}');
  });

  it('extracts a boxed answer with deeply nested braces', async () => {
    expect(await extractMathAnswer('\\boxed{\\frac{1}{\\sqrt{\\frac{2}{3}}}}')).toBe(
      '\\frac{1}{\\sqrt{\\frac{2}{3}}}',
    );
  });

  it('extracts a \\boxed{\\dfrac{...}} inside a $$ block', async () => {
    expect(await extractMathAnswer('$$\\boxed{\\dfrac{1}{2}}$$')).toBe('\\dfrac{1}{2}');
  });

  it('extracts deeply nested \\boxed{\\dfrac{8\\pi(2\\sqrt{2}-1)}{3}}', async () => {
    const raw = '$$S(1) = \\boxed{\\dfrac{8\\pi(2\\sqrt{2}-1)}{3}}$$';
    const result = await extractMathAnswer(raw);
    expect(result).toContain('\\dfrac');
    expect(result).toContain('\\sqrt');
  });

  it('strips <think> blocks before extracting', async () => {
    expect(await extractMathAnswer('<think>\nsteps\n</think>\n\n0.5')).toBe('0.5');
  });

  it('strips redacted thinking blocks before extracting', async () => {
    expect(await extractMathAnswer('Thinking: \nSignature: ErEeClkIDRgCK...\n\n0.5')).toBe('0.5');
  });

  it('strips inline-math wrappers from a fraction', async () => {
    expect(await extractMathAnswer('\\(\\frac{1}{6}\\)')).toBe('\\frac{1}{6}');
  });

  it('preserves negative sign on a fraction', async () => {
    expect(await extractMathAnswer('\\(-\\frac{10}{27}\\)')).toBe('-\\frac{10}{27}');
  });

  it('strips bold markers around 15', async () => {
    expect(await extractMathAnswer('**15**')).toBe('15');
  });

  it('returns the bold last line', async () => {
    expect(await extractMathAnswer('some work\n**32**')).toBe('32');
  });

  it('keeps assignment "V = 32" inside bold markers', async () => {
    expect(await extractMathAnswer('**V = 32**')).toBe('V = 32');
  });

  it('strips "Total: " label prefix', async () => {
    expect(await extractMathAnswer('Total: 14')).toBe('14');
  });

  it('strips "Answer: " label prefix', async () => {
    expect(await extractMathAnswer('Answer: 42')).toBe('42');
  });

  it('strips trailing prose after a comma', async () => {
    const result = await extractMathAnswer('7+e^{-4}, attained at $(-2,3)$');
    expect(result).toContain('e^{-4}');
    expect(result).not.toContain('attained');
  });

  it('skips a trailing \\] line that follows a $$...$$ block', async () => {
    const raw = '$$\\frac{8\\pi}{3}$$\n\\]';
    const result = await extractMathAnswer(raw);
    expect(result).not.toBe('\\]');
  });

  it('uses the display block when the surrounding line is truncated', async () => {
    const raw = 'Let me compute: $$a = 2$$ and continuing... (truncated';
    expect(await extractMathAnswer(raw)).toBe('a = 2');
  });

  it('strips units from inside \\boxed{}', async () => {
    expect(await extractMathAnswer('\\boxed{10\\ \\text{m}}')).toBe('10');
  });

  it('returns 5.09 from "**V ≈ 5.09**"', async () => {
    expect(await extractMathAnswer('**V ≈ 5.09**')).toContain('5.09');
  });

  it('returns empty string on empty input', async () => {
    expect(await extractMathAnswer('')).toBe('');
  });

  describe('prose-line answer extraction (rightmost numeric/LaTeX)', async () => {
    it.each([
      ['The answer is 0.5', '0.5'],
      ['Therefore the result is 42', '42'],
      ['So the value is 7', '7'],
      ['After simplification we get \\frac{1}{2}', '\\frac{1}{2}'],
      ['the final value comes out to be 3.14159', '3.14159'],
    ])('extracts %s → %s', async (input, expected) => {
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['The answer is 0.5.', '0.5'],
      ['The answer is 42.', '42'],
      ['Therefore the result is 7.', '7'],
      ['So the value comes out to 3.14159.', '3.14159'],
      ['After simplification we get \\frac{1}{2}.', '\\frac{1}{2}'],
    ])('strips terminal sentence punctuation (%s → %s)', async (input, expected) => {
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['Answer: 0.5.', '0.5'],
      ['Final answer: 42.', '42'],
      ['Total: 14.', '14'],
      ['Result: 3.14159.', '3.14159'],
    ])('strips terminal sentence punctuation from labelled (non-prose) answers (%s → %s)', async (input, expected) => {
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['The answer is 1 / 2', '1 / 2'],
      ['The answer is x + 1', 'x + 1'],
      ['Therefore the result is x + y - 3', 'x + y - 3'],
      ['So the value comes out to 1 + 2 + 3', '1 + 2 + 3'],
      ['And so the answer is -1 / 4', '-1 / 4'],
    ])('extracts the contiguous trailing math expression from prose (%s → %s)', async (input, expected) => {
      // Earlier versions returned only the rightmost token (e.g. "2" for
      // "1 / 2"), turning correct fractional/algebraic answers into
      // failures and even passing the wrong value.
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['Answer 42', '42'],
      ['Therefore 0.5', '0.5'],
      ['Total 14', '14'],
    ])('extracts a numeric final after an unpunctuated answer prefix (%s → %s)', async (input, expected) => {
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['The answer is 10kg', '10'],
      ['Therefore 45°', '45'],
    ])('normalizes units in prose-extracted final answers (%s → %s)', async (input, expected) => {
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it('preserves factorial as a mathematical operator', async () => {
      expect(await extractMathAnswer('5!')).toBe('5!');
      expect(await extractMathAnswer('The answer is 5!')).toBe('5!');
    });

    it.each([
      ['The answer is x+y', 'x+y'],
      ['Therefore the result is 2x+3y', '2x+3y'],
      ['So the value is a-b*c', 'a-b*c'],
      ['The answer is cos 4', 'cos 4'],
      ['The answer is sin x', 'sin x'],
    ])('extracts compact symbolic prose tokens (no spaces around operators) (%s → %s)', async (input, expected) => {
      // Pre-fix: isMathShapedToken treated `x+y` (letters mixed with
      // operators, no digit and not single-letter) as non-math, so the
      // whole sentence was sent to the parser and rejected as prose.
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['The answer is 2 × 3', '2 × 3'],
      ['Therefore 6 ÷ 2', '6 ÷ 2'],
      ['So the result is 5 − 1', '5 − 1'],
      ['Final answer 2 · 3', '2 · 3'],
    ])('includes Unicode math operators (×, ÷, −, ·) when extracting prose answers (%s → %s)', async (input, expected) => {
      // Prior to the fix, isMathShapedToken treated `×` / `÷` / `−` / `·`
      // as non-math tokens, so prose lines containing them stopped early
      // and returned only the rightmost numeric token.
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it('does NOT touch a single-word labelled value (V = 32)', async () => {
      expect(await extractMathAnswer('**V = 32**')).toBe('V = 32');
    });

    it('does NOT touch a step-counter style "Step 1" line (single prose word)', async () => {
      // "Step 1" has only one multi-letter alpha token, below the prose
      // threshold — so we shouldn't strip it down to "1" and falsely match.
      expect(await extractMathAnswer('Step 1')).toBe('Step 1');
    });
  });

  describe('final-answer line beats earlier display blocks', async () => {
    it('prefers "Answer: 3" on the last line over an earlier $$2$$', async () => {
      expect(await extractMathAnswer('$$2$$\nAnswer: 3')).toBe('3');
    });

    it('prefers "Answer: 3" on the last line over an earlier intermediate \\boxed{2}', async () => {
      // Pre-fix: findAllBoxed ran before the final-line check, so an
      // intermediate boxed step (e.g. shown work) silently beat the actual
      // final answer.
      expect(await extractMathAnswer('$$\\boxed{2}$$\nAnswer: 3')).toBe('3');
    });

    it('still uses \\boxed{42} when the last visible line itself is the boxed answer', async () => {
      // The "boxed-on-the-last-line" case must keep working; only
      // intermediate boxed work should be skipped in favor of a later
      // final-answer line.
      expect(await extractMathAnswer('Step 1: foo\nStep 2: bar\n$$\\boxed{42}$$')).toBe('42');
    });

    it('prefers a final-line numeric over an earlier display block', async () => {
      expect(await extractMathAnswer('Calculation: $$2 + 2$$\nFinal answer is 4')).toBe('4');
    });

    it('still uses the display block when the truncated text shares its line', async () => {
      // Display fence on the last raw line keeps the existing "display block
      // wins for truncated prose" behavior.
      expect(
        await extractMathAnswer('Let me compute: $$a = 2$$ and continuing... (truncated'),
      ).toBe('a = 2');
    });

    it.each([
      ['$$2$$ Answer: 3', '3'],
      ['$$5+5$$ Total: 10', '10'],
      ['work $$2$$, final answer: 3', '3'],
    ])('prefers a labelled answer after a same-line display fence (%s → %s)', async (input, expected) => {
      // Pre-fix: fence-on-the-last-line skipped extractFromLastLine and the
      // display-block scanner returned the intermediate fenced value
      // ("2", "5+5"), ignoring the labelled final answer that came
      // after the fence on the same line.
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it('grades $$2$$ Answer: 3 against 3, not the intermediate 2', async () => {
      expect((await isMathEquivalent('$$2$$ Answer: 3', 3)).pass).toBe(true);
      expect((await isMathEquivalent('$$2$$ Answer: 3', 2)).pass).toBe(false);
    });

    it.each([
      ['work \\boxed{2}, final answer: 3', '3'],
      ['intermediate \\boxed{5}, total: 10', '10'],
      // Nested-brace boxed (3 levels of {}) — the previous flat regex
      // missed these because it only tolerated one level of nesting.
      ['work \\boxed{\\frac{1}{\\sqrt{2}}}, final answer: 3', '3'],
      // Uncolonized prose final after a boxed intermediate.
      ['work \\boxed{2}, final answer is 3', '3'],
      ['intermediate \\boxed{5}, total comes to 10', '10'],
    ])('prefers a labelled answer after a same-line \\boxed intermediate (%s → %s)', async (input, expected) => {
      // Pre-fix: \\boxed-on-the-last-line short-circuited extraction to
      // the boxed value, even when a later labelled answer on the same
      // line was the actual final.
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it('grades work \\boxed{2}, final answer: 3 against 3, not 2', async () => {
      expect((await isMathEquivalent('work \\boxed{2}, final answer: 3', 3)).pass).toBe(true);
      expect((await isMathEquivalent('work \\boxed{2}, final answer: 3', 2)).pass).toBe(false);
    });

    it.each([
      ['$$2$$ $$3$$', '3'],
      ['work $$2$$ $$3$$', '3'],
      ['\\[2\\] \\[3\\]', '3'],
      ['$$2$$ \\[3\\]', '3'],
    ])('falls through to the rightmost display block on multi-fence finals (%s → %s)', async (input, expected) => {
      // Pre-fix: cleanMathText stripped the fences so the last line became
      // "2 3" / "work 2 3", and extractFromLastLine pulled the rightmost
      // contiguous math suffix ("2 3") instead of letting the display-block
      // scanner pick the documented latest block ("3").
      expect(await extractMathAnswer(input)).toBe(expected);
    });

    it('prefers prose after multiple display blocks over the earlier fenced work', async () => {
      expect(await extractMathAnswer('$$2$$ $$3$$ final answer is 4')).toBe('4');
    });
  });

  describe('approximation chains (≈, \\approx) split like equality chains', async () => {
    it.each([
      ['1/2 ≈ 0.5', '0.5'],
      ['1/2 \\approx 0.5', '0.5'],
      ['$$1/2 \\approx 0.5$$', '0.5'],
    ])('grades approximate final answer "%s" against %s', async (actual, expected) => {
      // tryParseEachSegment used to only split on literal `=` and missed
      // ≈/\\approx, so a pure-math line using ≈ was rejected as an
      // equality even though the docs say ≈ is treated as `=`.
      expect((await isMathEquivalent(actual, expected)).pass).toBe(true);
    });
  });

  describe('prose-only last lines fall back to earlier answers', async () => {
    it('falls back to the earlier display block when the last line is pure prose', async () => {
      // Pre-fix: returned "This is the final result" and CE then failed
      // to parse, so a correct $$\frac{1}{2}$$ answer was reported as wrong.
      expect(await extractMathAnswer('$$\\frac{1}{2}$$\nThis is the final result.')).toBe(
        '\\frac{1}{2}',
      );
    });

    it('falls back to the earlier display block when the last line is "Done."', async () => {
      expect(await extractMathAnswer('$$42$$\nDone.')).toBe('42');
    });

    it('falls back to an earlier \\[ ... \\] display block when the last line is prose', async () => {
      // \\[ ... \\] is documented as tolerated display math; falling back to
      // it on a prose-only trailer must work the same as $$...$$.
      expect(await extractMathAnswer('\\[\\frac{1}{2}\\]\nThis is the final result.')).toBe(
        '\\frac{1}{2}',
      );
    });

    it('grades \\[\\frac{1}{2}\\] + prose trailer against 0.5', async () => {
      expect(
        (await isMathEquivalent('\\[\\frac{1}{2}\\]\nThis is the final result.', '0.5')).pass,
      ).toBe(true);
    });

    it('still grades $$\\frac{1}{2}$$ + prose trailer against 0.5', async () => {
      expect(
        (await isMathEquivalent('$$\\frac{1}{2}$$\nThis is the final result.', '0.5')).pass,
      ).toBe(true);
    });

    it('keeps an equality-chain display block (e.g. $$x = 2$$) on prose-only trailers', async () => {
      // Pre-fix: when the display-block scanner discarded the equality, the
      // fallback later sliced the combined `cleaned` text on '=' and could
      // return the left segment ('x') instead of the documented rightmost
      // answer.
      expect(await extractMathAnswer('$$x = 2$$\nDone.')).toBe('x = 2');
      expect((await isMathEquivalent('$$x = 2$$\nDone.', 2)).pass).toBe(true);
    });

    it('keeps a numeric equality-chain display block (e.g. $$230/530 = 23/53$$) on prose-only trailers', async () => {
      // Numeric chains have no `var =` prefix to fall back on, so this
      // exercises the segment-fallback path in extractFromDisplayBlocks.
      // The extracted text must be the equality chain ALONE — without the
      // prose trailer — so tryParseEachSegment can split it cleanly
      // instead of seeing '23/53\nDone.' as the right segment.
      expect(await extractMathAnswer('$$230/530 = 23/53$$\nDone.')).toBe('230/530 = 23/53');
      expect((await isMathEquivalent('$$230/530 = 23/53$$\nDone.', '23/53')).pass).toBe(true);
    });

    it.each([
      ['42\nDone.', '42'],
      ['The answer is 42\nDone.', '42'],
    ])('falls back to an earlier plain answer when the last line is prose (%s → %s)', async (actual, expected) => {
      expect(await extractMathAnswer(actual)).toBe(expected);
      expect((await isMathEquivalent(actual, expected)).pass).toBe(true);
    });
  });

  describe('hidden-thinking display blocks must not leak through', async () => {
    it('ignores $$...$$ inside <think> blocks', async () => {
      expect(await extractMathAnswer('<think>$$2$$</think>\nFinal answer: 3')).toBe('3');
    });

    it('ignores $$...$$ inside <think> blocks even when only the display block is "answer-like"', async () => {
      // No labelled final-line answer here — the visible text is just "0.5".
      // The hidden $$2$$ must not bubble up.
      expect(await extractMathAnswer('<think>$$2$$</think>\n0.5')).toBe('0.5');
    });

    it('ignores $$...$$ inside redacted-thinking blocks', async () => {
      expect(await extractMathAnswer('Thinking: \nSignature: AbCd123\n$$99$$\n\nAnswer: 7')).toBe(
        '7',
      );
    });

    it('ignores $$...$$ inside Anthropic redacted-thinking blocks', async () => {
      expect(await extractMathAnswer('Redacted Thinking: $$99$$\n\nAnswer: 7')).toBe('7');
    });

    it('ignores $$...$$ inside thinking blocks with a later signature line', async () => {
      expect(await extractMathAnswer('Thinking: $$2$$\nSignature: sig\n\nFinal answer: 3')).toBe(
        '3',
      );
    });

    it('ignores $$...$$ inside signatureless thinking blocks', async () => {
      expect(await extractMathAnswer('Thinking: $$2$$\n\nFinal answer: 3')).toBe('3');
    });

    it('extracts labelled answer when output follows thinking with later blank lines', async () => {
      expect(await extractMathAnswer('Thinking: hidden\n\nFinal answer: 3\n\nNotes')).toBe('3');
    });

    it('ignores $$...$$ inside multi-paragraph thinking blocks', async () => {
      expect(
        await extractMathAnswer('Thinking: line1\n\n$$2$$\nSignature: sig\n\nFinal answer: 3'),
      ).toBe('3');
    });

    it('ignores $$...$$ inside Bedrock <thinking> blocks', async () => {
      expect(await extractMathAnswer('<thinking>\n$$2$$\n</thinking>\n\nFinal answer: 3')).toBe(
        '3',
      );
    });
  });
});

// =============================================================================
// isMathEquivalent (full pipeline)
// =============================================================================

describe('isMathEquivalent', async () => {
  describe('numeric equivalence', async () => {
    it('matches identical decimals', async () => {
      expect((await isMathEquivalent('0.5', '0.5')).pass).toBe(true);
    });

    it('matches a boxed fraction against a decimal', async () => {
      expect((await isMathEquivalent('\\boxed{\\dfrac{1}{2}}', '0.5')).pass).toBe(true);
    });

    it('matches plain fraction against $\\frac{32}{3}$', async () => {
      expect((await isMathEquivalent('32/3', '$\\frac{32}{3}$')).pass).toBe(true);
    });

    it('matches plain fraction with single-char denominator GT', async () => {
      expect((await isMathEquivalent('work...\n32/3', '$\\frac{32}3$')).pass).toBe(true);
    });

    it('accepts a numeric expected value', async () => {
      expect((await isMathEquivalent('0.5', 0.5)).pass).toBe(true);
    });
  });

  describe('formatting wrappers', async () => {
    it('matches \\dfrac vs \\frac', async () => {
      expect((await isMathEquivalent('\\dfrac{8\\pi}{3}', '$\\frac{8\\pi}{3}$')).pass).toBe(true);
    });

    it('matches with inline-math wrapper on both sides', async () => {
      expect(
        (await isMathEquivalent('\\(\\frac{8\\pi}{3}\\)', '\\(\\frac{8\\pi}{3}\\)')).pass,
      ).toBe(true);
    });

    it('matches a bold integer', async () => {
      expect((await isMathEquivalent('**15**', '15')).pass).toBe(true);
    });

    it('matches a bold last line after prose', async () => {
      expect((await isMathEquivalent('computation...\n**15**', '15')).pass).toBe(true);
    });

    it('matches a negative wrapped fraction', async () => {
      expect((await isMathEquivalent('\\(-\\frac{10}{27}\\)', '\\(-\\frac{10}{27}\\)')).pass).toBe(
        true,
      );
    });
  });

  describe('labels and suffixes', async () => {
    it('matches "Total: 14" against 14', async () => {
      expect((await isMathEquivalent('Total: 14', '14')).pass).toBe(true);
    });

    it('strips comma-suffixed prose before comparison', async () => {
      expect(
        (await isMathEquivalent('7+e^{-4}, attained at $(-2,3)$ and $(2,-1)$', '$e^{-4} + 7$'))
          .pass,
      ).toBe(true);
    });
  });

  describe('trig', async () => {
    it('matches "24+6cos4" with backslash-less digit form', async () => {
      expect((await isMathEquivalent('24+6cos4', '$24+6\\cos(4)$')).pass).toBe(true);
    });

    it('matches "24 + 6cos(4)" with backslash-less paren form', async () => {
      expect((await isMathEquivalent('24 + 6cos(4)', '$24+6\\cos(4)$')).pass).toBe(true);
    });

    it('matches sin(0) against 0', async () => {
      expect((await isMathEquivalent('sin(0)', '0')).pass).toBe(true);
    });

    it('matches cos with space-separated digit', async () => {
      expect((await isMathEquivalent('24 + 6cos 4', '$24+6\\cos(4)$')).pass).toBe(true);
    });

    it.each([
      ['The answer is cos 4', '$\\cos(4)$'],
      ['The answer is sin x', '$\\sin(x)$'],
    ])('matches prose-wrapped bare function shorthand "%s"', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected)).pass).toBe(true);
    });
  });

  describe('nested boxed', async () => {
    it('matches deeply nested \\boxed{\\dfrac{...}}', async () => {
      const raw = '$$S = \\boxed{\\dfrac{8\\pi(2\\sqrt{2}-1)}{3}}$$';
      expect((await isMathEquivalent(raw, '$\\frac{8\\pi(2\\sqrt{2}-1)}{3}$')).pass).toBe(true);
    });
  });

  describe('units', async () => {
    it('matches a boxed value with units against a unitless GT', async () => {
      expect((await isMathEquivalent('\\boxed{10\\ \\text{m}}', '$10$')).pass).toBe(true);
    });

    it('matches a bold value with units against a unitless GT', async () => {
      expect((await isMathEquivalent('**10 m**', '$10$')).pass).toBe(true);
    });
  });

  describe('approx', async () => {
    it('matches "**V ≈ 5.09**" against 5.09', async () => {
      expect((await isMathEquivalent('**V ≈ 5.09**', '$5.09$')).pass).toBe(true);
    });

    it('matches "\\boxed{V \\approx 5.09}" against 5.09', async () => {
      expect((await isMathEquivalent('\\boxed{V \\approx 5.09}', '$5.09$')).pass).toBe(true);
    });

    it('matches "$$\\boxed{V \\approx 5.09}$$" against 5.09', async () => {
      expect((await isMathEquivalent('$$\\boxed{V \\approx 5.09}$$', '$5.09$')).pass).toBe(true);
    });
  });

  describe('truncated responses', async () => {
    it('uses the display block when the line is truncated', async () => {
      const raw = 'Let me compute carefully: $$a = 2$$ and continuing... (truncated';
      expect((await isMathEquivalent(raw, '$2$')).pass).toBe(true);
    });

    it('uses the prose answer on the last line', async () => {
      expect((await isMathEquivalent('After computing:\n0.9124', '0.9124')).pass).toBe(true);
    });
  });

  describe('LLM judge audit patterns', async () => {
    it('matches unicode √ form', async () => {
      expect((await isMathEquivalent('20√57', '$20\\sqrt{57}$')).pass).toBe(true);
    });

    it('matches unicode √ over variables', async () => {
      expect((await isMathEquivalent('√x', '$\\sqrt{x}$')).pass).toBe(true);
    });

    it('matches unicode √ with unicode minus', async () => {
      expect((await isMathEquivalent('−185√23 / 6', '$-\\frac{185\\sqrt{23}}{6}$')).pass).toBe(
        true,
      );
    });

    it('matches unicode minus in plain fraction', async () => {
      expect((await isMathEquivalent('−1/4', '$-\\frac{1}{4}$')).pass).toBe(true);
    });

    it('matches unicode minus against \\frac32 (single-char denom)', async () => {
      expect((await isMathEquivalent('−3/2', '$-\\frac32$')).pass).toBe(true);
    });

    it('matches "a × b = 4 × 1 = 4" via segment parsing', async () => {
      expect((await isMathEquivalent('a × b = 4 × 1 = 4', '4')).pass).toBe(true);
    });

    it('matches "230/530 = 23/53" via segment parsing', async () => {
      expect((await isMathEquivalent('230/530 = 23/53', '$\\frac{23}{53}$')).pass).toBe(true);
    });

    it('strips P(Safe|F) prefix before comparing', async () => {
      expect((await isMathEquivalent('P(Safe|F) \\approx 0.0113', '0.0113')).pass).toBe(true);
    });

    it('handles european decimal comma "2,00625"', async () => {
      expect((await isMathEquivalent('2,00625', '2.00625')).pass).toBe(true);
    });

    it('strips a leading ≈ symbol', async () => {
      expect((await isMathEquivalent('≈ 33167.52', '33167.52')).pass).toBe(true);
    });

    it('strips a "(i.e., ...)" parenthetical', async () => {
      expect((await isMathEquivalent('−1/4 (i.e., −$0.25)', '$-\\frac{1}{4}$')).pass).toBe(true);
    });
  });

  describe('genuine non-equivalence (must stay false)', async () => {
    it('rejects 42 vs 43', async () => {
      expect((await isMathEquivalent('42', '43')).pass).toBe(false);
    });

    it('rejects pure prose with no answer against 42', async () => {
      expect((await isMathEquivalent('some long prose with no answer', '42')).pass).toBe(false);
    });

    it('rejects 1/6 vs 7/6', async () => {
      expect((await isMathEquivalent('\\frac{1}{6}', '\\frac{7}{6}')).pass).toBe(false);
    });

    it('rejects 0.86 vs 0.67', async () => {
      expect((await isMathEquivalent('0.86', '0.67')).pass).toBe(false);
    });

    it('rejects tiny nonzero residuals instead of accepting engine tolerance', async () => {
      expect((await isMathEquivalent('0', '10^{-50}')).pass).toBe(false);
    });

    it('rejects -3 vs -3/2 (judge FP regression)', async () => {
      expect((await isMathEquivalent('-3', '$-\\frac32$')).pass).toBe(false);
    });

    it('rejects 49/106 vs 23/53 (judge FP regression)', async () => {
      expect((await isMathEquivalent('49/106', '$\\frac{23}{53}$')).pass).toBe(false);
    });

    it('rejects extra π factor (judge FP regression)', async () => {
      expect(
        (await isMathEquivalent('\\dfrac{3260416\\,\\pi}{405}', '$\\frac{3260416}{405}$')).pass,
      ).toBe(false);
    });

    it('rejects 5π/3 vs -π/3 (mod-2π collapse FP regression)', async () => {
      expect((await isMathEquivalent('\\dfrac{5\\pi}{3}', '-\\frac{\\pi}{3}')).pass).toBe(false);
    });

    it.each([
      ['The answer is 0.5', '0.5'],
      ['Therefore the result is 42', 42],
      ['So the value is 7', '$7$'],
      ['After simplification we get \\frac{1}{2}', '0.5'],
    ])('matches prose-wrapped answer "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it.each([
      ['2*3*4', '24'],
      ['1*2', 2],
      ['2*3', '6'],
    ])('grades * multiplication ("%s" vs %s) as equivalent', async (actual, expected) => {
      // Without the asterisk-preservation fix, "2*3*4" would clean to "234"
      // and grade as 234 ≠ 24.
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it.each([
      ['\\frac{1}\\pi', '\\frac{1}{\\pi}'],
      ['\\frac{2}\\theta', '\\frac{2}{\\theta}'],
    ])('grades \\frac with backslash-command denom ("%s" vs %s) as equivalent', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected)).pass).toBe(true);
    });

    it.each([
      ['<think>$$2$$</think>\nFinal answer: 3', '3'],
      ['<think>$$2$$</think>\n0.5', '0.5'],
    ])('ignores hidden display math inside <think> ("%s" vs %s)', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected)).pass).toBe(true);
    });

    it.each([
      ['1,000', '1000'],
      ['1,234', 1234],
      ['1,234,567', '1234567'],
      ['12,345', 12345],
    ])('grades thousands-grouped integer "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it('does NOT silently equate 1,000 with 1', async () => {
      // The decimal-comma rewrite previously turned "1,000" into "1.000"=1,
      // making "1,000" spuriously equivalent to 1.
      expect((await isMathEquivalent('1,000', '1')).pass).toBe(false);
    });

    it.each([
      ['The answer is 0.5.', '0.5'],
      ['Therefore the result is 7.', 7],
      ['So the answer comes out to 3.14159.', '3.14159'],
    ])('grades sentence-terminated prose "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it.each([
      ['Answer: 0.5.', '0.5'],
      ['Final answer: 42.', 42],
      ['Total: 14.', '14'],
    ])('grades labelled sentence-terminated answers "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it.each([
      ['10kg', 10],
      ['5m', '5'],
      ['45deg', 45],
      ['100ms', '100'],
    ])('grades unit-attached numeric answers "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it.each([
      ['1/2 m', '0.5'],
      ['\\frac{1}{2} kg', 0.5],
      ['\\frac{1}{2}m', '0.5'],
      ['\\sqrt{2} m', '\\sqrt{2}'],
      ['\\frac{1}{\\sqrt{2}} m', '\\frac{1}{\\sqrt{2}}'],
      ['\\frac{1}{\\sqrt{\\frac{2}{3}}} kg', '\\frac{1}{\\sqrt{\\frac{2}{3}}}'],
    ])('grades fractional / LaTeX answers with trailing units "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it.each([
      ['The answer is 1 / 2', '0.5'],
      ['The answer is 1 / 2', '\\frac{1}{2}'],
      ['The answer is x + 1', 'x + 1'],
      ['Therefore the result is x + y - 3', 'x + y - 3'],
      ['So the value comes out to 1 + 2 + 3', '6'],
      ['And so the answer is -1 / 4', '-0.25'],
      ['The answer is 10kg', '10'],
      ['Therefore 45°', '45'],
    ])('grades prose-wrapped contiguous math expression "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected)).pass).toBe(true);
    });

    it.each([
      ['Answer 42', 42],
      ['Therefore 0.5', '0.5'],
      ['Total 14', 14],
    ])('grades unpunctuated answer-prefix finals "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it('retains factorial rather than treating it as sentence punctuation', async () => {
      expect((await isMathEquivalent('5!', '5!')).pass).toBe(true);
      expect((await isMathEquivalent('5!', 5)).pass).toBe(false);
      expect((await isMathEquivalent('The answer is 5!', 5)).pass).toBe(false);
    });

    it.each([
      ['The answer is 2 × 3', 6],
      ['Therefore 6 ÷ 2', 3],
      ['So the result is 5 − 1', 4],
      ['Final answer 2 · 3', 6],
    ])('grades prose answers with Unicode math operators "%s" against %s', async (actual, expected) => {
      expect((await isMathEquivalent(actual, expected as string | number)).pass).toBe(true);
    });

    it.each([
      ['x + m', 'x + m'],
      ['a - b - g', 'a - b - g'],
      ['p + q * s', 'p*s + q*s'], // mathematically not equal, but parse should NOT corrupt either side
    ])('does not corrupt algebraic expressions ending in a unit-letter (%s)', async (actual, expected) => {
      // Confirm the expression parses both ways without unit-stripping
      // mangling either side. The (%s)/(%s) pair may or may not be
      // equivalent; we just check we don't get a parseFailed reason
      // pointing at a corrupted "x +" candidate.
      const result = await isMathEquivalent(actual, expected);
      expect(result.parseFailed ?? false).toBe(false);
    });

    it('grades hidden-think display math against the WRONG value as false', async () => {
      // Inverse of the above: must NOT match the hidden intermediate.
      expect((await isMathEquivalent('<think>$$2$$</think>\nFinal answer: 3', '2')).pass).toBe(
        false,
      );
      expect((await isMathEquivalent('<think>$$2$$</think>\n0.5', '2')).pass).toBe(false);
    });

    it('grades "$$2$$\\nAnswer: 3" against 3 (not 2)', async () => {
      // Earlier display blocks are intermediate work; the labelled final-line
      // answer should win.
      expect((await isMathEquivalent('$$2$$\nAnswer: 3', '3')).pass).toBe(true);
      expect((await isMathEquivalent('$$2$$\nAnswer: 3', '2')).pass).toBe(false);
    });

    it('rejects identical English-word inputs as a defensive misuse guard', async () => {
      // Without the prose heuristic, both sides would parse to the same
      // Multiply of letter symbols and report pass=true — silently accepting
      // a misconfigured math-equivalent assertion.
      const result = await isMathEquivalent('apple', 'apple');
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Could not parse');
    });
  });

  describe('non-finite numeric inputs', async () => {
    it('rejects NaN expected value with a clear reason', async () => {
      const result = await isMathEquivalent('0', Number.NaN);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('NaN');
    });

    it.each([
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ])('rejects %s expected value with a clear reason', async (val) => {
      const result = await isMathEquivalent('0', val);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('finite');
    });
  });

  describe('CortexJS fault tolerance (catch fences)', async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns undefined when ce.parse throws (parseMathExpression catch)', async () => {
      // Force the engine's parse to throw. The fence inside parseMathExpression
      // must swallow the error and return undefined rather than propagating.
      vi.spyOn(ComputeEngine.prototype, 'parse').mockImplementation(() => {
        throw new Error('simulated CortexJS parse failure');
      });
      expect(await parseMathExpression('42')).toBeUndefined();
    });

    it('reports a comparison failure when ce.box throws on Subtract (isMathEquivalent catch)', async () => {
      // Let the two parse calls and any internal box() calls succeed, then
      // throw only on the explicit ce.box(['Subtract', ...]) we issue. This
      // exercises the catch fence around the simplify/isEqual pipeline.
      const originalBox = ComputeEngine.prototype.box;
      vi.spyOn(ComputeEngine.prototype, 'box').mockImplementation(function (
        this: ComputeEngine,
        ...args: Parameters<typeof originalBox>
      ) {
        if (Array.isArray(args[0]) && args[0][0] === 'Subtract') {
          throw new Error('simulated CortexJS box failure');
        }
        return originalBox.apply(this, args);
      });
      const result = await isMathEquivalent('1', '1');
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Math equivalence comparison failed');
      expect(result.reason).toContain('simulated CortexJS box failure');
      // Comparison errors must mark parseFailed so handlers do NOT invert them
      // for not-math-equivalent (otherwise an engine glitch silently passes).
      expect(result.parseFailed).toBe(true);
    });
  });

  describe('parse-failure flag for downstream handlers', async () => {
    it('marks parse failure on the actual side', async () => {
      const result = await isMathEquivalent('no answer here', '42');
      expect(result.pass).toBe(false);
      expect(result.parseFailed).toBe(true);
    });

    it('marks parse failure on the expected side', async () => {
      const result = await isMathEquivalent('42', 'apple');
      expect(result.pass).toBe(false);
      expect(result.parseFailed).toBe(true);
    });

    it('does not set parseFailed when comparison succeeds', async () => {
      const result = await isMathEquivalent('1', '1');
      expect(result.pass).toBe(true);
      expect(result.parseFailed).toBeFalsy();
    });

    it('does not set parseFailed when comparison runs and reports false', async () => {
      const result = await isMathEquivalent('1', '2');
      expect(result.pass).toBe(false);
      expect(result.parseFailed).toBeFalsy();
    });
  });
});

// =============================================================================
// handleMathEquivalent (assertion handler)
// =============================================================================

function makeParams(overrides: {
  renderedValue: AssertionParams['renderedValue'];
  outputString: string;
  inverse?: boolean;
  type?: string;
}): AssertionParams {
  const { renderedValue, outputString, inverse = false, type = 'math-equivalent' } = overrides;
  return {
    assertion: { type: type as AssertionParams['assertion']['type'] },
    baseType: 'math-equivalent' as AssertionParams['baseType'],
    inverse,
    output: outputString,
    outputString,
    renderedValue,
    test: {},
    providerResponse: { output: outputString, tokenUsage: {} },
    assertionValueContext: {
      prompt: '',
      vars: {},
      test: {},
      logProbs: undefined,
      provider: {} as AssertionParams['assertionValueContext']['provider'],
      providerResponse: { output: outputString, tokenUsage: {} },
    },
  };
}

describe('handleMathEquivalent', async () => {
  it('passes when output matches the string expected value', async () => {
    const result = await handleMathEquivalent(
      makeParams({ renderedValue: '0.5', outputString: '\\boxed{\\frac{1}{2}}' }),
    );
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('Math equivalence assertion passed');
  });

  it('passes when output matches a numeric expected value', async () => {
    const result = await handleMathEquivalent(
      makeParams({ renderedValue: 0.5, outputString: '\\frac{1}{2}' }),
    );
    expect(result.pass).toBe(true);
  });

  it('fails when output does not match the expected value', async () => {
    const result = await handleMathEquivalent(
      makeParams({ renderedValue: '0.5', outputString: '0.6' }),
    );
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('not equivalent');
  });

  it('fails with a parse-failure reason when output is pure prose', async () => {
    const result = await handleMathEquivalent(
      makeParams({ renderedValue: '42', outputString: 'no answer here' }),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Could not parse actual answer');
  });

  it('respects the inverse flag (not-math-equivalent)', async () => {
    const matched = await handleMathEquivalent(
      makeParams({
        renderedValue: '0.5',
        outputString: '0.6',
        inverse: true,
      }),
    );
    expect(matched.pass).toBe(true);

    const failed = await handleMathEquivalent(
      makeParams({
        renderedValue: '0.5',
        outputString: '0.5',
        inverse: true,
      }),
    );
    expect(failed.pass).toBe(false);
  });

  it('does not let not-math-equivalent silently pass when comparison errors mid-flight', async () => {
    // ce.box throwing during Subtract means we did not actually establish
    // (non-)equivalence. handleMathEquivalent must NOT flip the false to a
    // pass for not-math-equivalent.
    const originalBox = ComputeEngine.prototype.box;
    const spy = vi.spyOn(ComputeEngine.prototype, 'box').mockImplementation(function (
      this: ComputeEngine,
      ...args: Parameters<typeof originalBox>
    ) {
      if (Array.isArray(args[0]) && args[0][0] === 'Subtract') {
        throw new Error('synthetic comparison failure');
      }
      return originalBox.apply(this, args);
    });
    try {
      const result = await handleMathEquivalent(
        makeParams({
          renderedValue: '1',
          outputString: '1',
          inverse: true,
          type: 'not-math-equivalent',
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Math equivalence comparison failed');
      expect(result.reason).not.toContain('not equivalent, as expected');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not let not-math-equivalent silently pass on unparseable output', async () => {
    // Without short-circuiting parse failure, "not-math-equivalent: 42" would
    // accept any unparseable garbage (empty string, prose, etc.) since the
    // unparseable→pass=false flips to true under inverse. That hides
    // provider regressions; treat parse failure as a hard failure regardless
    // of inverse.
    for (const garbage of ['', 'no answer here', 'the model refused', 'apple']) {
      const result = await handleMathEquivalent(
        makeParams({
          renderedValue: '42',
          outputString: garbage,
          inverse: true,
        }),
      );
      expect(result.pass, `garbage="${garbage}"`).toBe(false);
      expect(result.reason).toContain('Could not parse');
    }
  });

  it('throws when renderedValue is neither string nor number', async () => {
    await expect(
      handleMathEquivalent(
        makeParams({
          renderedValue: { foo: 'bar' } as unknown as AssertionParams['renderedValue'],
          outputString: '0.5',
        }),
      ),
    ).rejects.toThrow('"math-equivalent" assertion type must have a string or number value');
  });
});
