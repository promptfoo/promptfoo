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

describe('normalizeLatex', () => {
  describe('approximation symbols', () => {
    it('strips ≈ and the variable assignment around it', () => {
      const result = normalizeLatex('V ≈ 5.09');
      expect(result.includes('≈')).toBe(false);
      expect(result.includes('5.09')).toBe(true);
    });

    it('strips \\approx and the variable assignment around it', () => {
      const result = normalizeLatex('V \\approx 5.09');
      expect(result.includes('\\approx')).toBe(false);
      expect(result.includes('5.09')).toBe(true);
    });
  });

  describe('variable-assignment prefix', () => {
    it('strips "V = " prefix', () => {
      expect(normalizeLatex('V = 5.09')).toBe('5.09');
    });

    it('strips "V ≈ " prefix', () => {
      expect(normalizeLatex('V ≈ 5.09')).toBe('5.09');
    });

    it('strips "x_0 = " prefix', () => {
      expect(normalizeLatex('x_0 = 3')).toBe('3');
    });

    it('does not strip pure expressions', () => {
      expect(normalizeLatex('5.09')).toBe('5.09');
    });
  });

  describe('\\frac normalization', () => {
    it('adds braces around single-char denominator', () => {
      expect(normalizeLatex('\\frac{32}3')).toBe('\\frac{32}{3}');
    });

    it('does not corrupt nested \\frac with braced numerator', () => {
      const expr = '\\frac{8\\pi(2\\sqrt{2}-1)}{3}';
      expect(normalizeLatex(expr)).toBe(expr);
    });

    it('leaves a fully-braced \\frac alone', () => {
      expect(normalizeLatex('\\frac{1}{2}')).toBe('\\frac{1}{2}');
    });

    it('expands \\fracAB (two bare single chars) to \\frac{A}{B}', () => {
      expect(normalizeLatex('\\frac32')).toBe('\\frac{3}{2}');
    });

    it('does not corrupt "\\frac{32} + 2" by capturing whitespace as a denominator', () => {
      // Earlier versions captured the trailing space as the new denominator,
      // producing "\\frac{32}{ }+ 2" which CortexJS could not parse.
      expect(normalizeLatex('\\frac{32} + 2')).toBe('\\frac{32} + 2');
    });

    it('does not auto-brace a non-letter/digit/backslash denominator', () => {
      expect(normalizeLatex('\\frac{32}+2')).toBe('\\frac{32}+2');
    });

    it('braces a backslash-command denominator (\\frac{1}\\pi → \\frac{1}{\\pi})', () => {
      // Earlier versions captured only the leading backslash and produced
      // "\\frac{1}{\\}pi" which CortexJS could not parse; the regex must
      // grab the entire LaTeX command token as the denominator.
      expect(normalizeLatex('\\frac{1}\\pi')).toBe('\\frac{1}{\\pi}');
    });

    it('braces a multi-letter command denominator (\\frac{2}\\theta)', () => {
      expect(normalizeLatex('\\frac{2}\\theta')).toBe('\\frac{2}{\\theta}');
    });
  });

  describe('trig backslash insertion', () => {
    it('escapes cos(', () => {
      expect(normalizeLatex('cos(4)')).toContain('\\cos(');
    });

    it('escapes sin(', () => {
      expect(normalizeLatex('sin(x)')).toContain('\\sin(');
    });

    it('escapes cos<digit> as \\cos(<digit>)', () => {
      expect(normalizeLatex('6cos4')).toContain('\\cos');
    });

    it('escapes sin<digit> as \\sin(<digit>)', () => {
      expect(normalizeLatex('sin2')).toContain('\\sin');
    });

    it('escapes ln(', () => {
      expect(normalizeLatex('ln(x)')).toContain('\\ln(');
    });

    it('escapes sqrt(', () => {
      expect(normalizeLatex('sqrt(x)')).toContain('\\sqrt(');
    });

    it('does not double-escape \\cos(', () => {
      const result = normalizeLatex('\\cos(4)');
      expect(result.split('\\cos').length - 1).toBe(1);
    });

    it('escapes arctan as \\arctan, not arc\\tan', () => {
      const result = normalizeLatex('arctan(x)');
      expect(result).toContain('\\arctan');
      expect(result).not.toContain('arc\\tan');
    });

    it.each([
      ['sqrt2var', 'sqrt2var'],
      ['sqrt2_x', 'sqrt2_x'],
      ['cos4abc', 'cos4abc'],
      ['log10base', 'log10base'],
    ])('does not split identifier-like trailing tokens (%s)', (input, expected) => {
      // Adding a trailing-word-boundary guard ((?!\w)) prevents the trig
      // regexes from rewriting identifiers like `sqrt2var` to `\sqrt(2)var`.
      expect(normalizeLatex(input)).toBe(expected);
    });

    it.each([
      ['sqrt2', '\\sqrt(2)'],
      ['cos4', '\\cos(4)'],
      ['cos 4', '\\cos(4)'],
      ['sqrt 23', '\\sqrt(23)'],
    ])('still rewrites the legitimate digit-suffixed shorthand (%s → %s)', (input, expected) => {
      expect(normalizeLatex(input)).toBe(expected);
    });
  });

  describe('Unicode characters', () => {
    it('converts unicode minus (−) to ASCII -', () => {
      expect(normalizeLatex('−1/4')).toBe('-1/4');
    });

    it('converts √N to \\sqrt{N}', () => {
      expect(normalizeLatex('20√57')).toBe('20\\sqrt{57}');
    });

    it('converts √{...} to \\sqrt{...}', () => {
      expect(normalizeLatex('√{2}')).toBe('\\sqrt{2}');
    });

    it('converts × to *', () => {
      // a × b = 2 → a * b = 2 → after assignment strip: not applied (lhs is "a * b")
      // but the unicode replacement itself should fire.
      expect(normalizeLatex('a × b')).toContain('*');
    });
  });

  describe('thousands separators vs european decimal commas', () => {
    it.each([
      ['1,000', '1000'],
      ['1,234', '1234'],
      ['1,234,567', '1234567'],
      ['12,345', '12345'],
      ['100,000,000', '100000000'],
    ])('strips US thousands separators ("%s" → "%s")', (input, expected) => {
      expect(normalizeLatex(input)).toBe(expected);
    });

    it.each([
      ['2,00625', '2.00625'],
      ['3,14159', '3.14159'],
    ])('still rewrites European decimal commas ("%s" → "%s")', (input, expected) => {
      expect(normalizeLatex(input)).toBe(expected);
    });

    it('leaves coordinate-style "(2,3)" alone', () => {
      expect(normalizeLatex('(2,3)')).toBe('(2,3)');
    });
  });

  describe('european decimal comma', () => {
    it('converts "2,00625" to "2.00625"', () => {
      expect(normalizeLatex('2,00625')).toBe('2.00625');
    });

    it('does not mangle short comma-separated pairs (2,3)', () => {
      // Single-digit on the right of the comma should be left as-is.
      expect(normalizeLatex('2,3')).toBe('2,3');
    });
  });

  describe('parenthetical suffixes', () => {
    it('strips trailing "(i.e., ...)"', () => {
      const result = normalizeLatex('-1/4 (i.e., -$0.25)');
      expect(result).toBe('-1/4');
    });

    it('strips leading = symbol', () => {
      expect(normalizeLatex('= 33167.52')).toBe('33167.52');
    });

    it('strips leading ≈ symbol after conversion', () => {
      expect(normalizeLatex('≈ 33167.52')).toBe('33167.52');
    });
  });
});

// =============================================================================
// cleanMathText
// =============================================================================

describe('cleanMathText', () => {
  it('strips <think> blocks', () => {
    expect(cleanMathText('<think>\nwork\n</think>\n0.5')).toBe('0.5');
  });

  it('strips multi-line <think> blocks', () => {
    expect(cleanMathText('<think>\nlong\nwork\n</think>\n\n42')).toBe('42');
  });

  it('strips redacted thinking blocks', () => {
    const raw = 'Thinking: \nSignature: AbCd123\n\n0.5';
    expect(cleanMathText(raw)).toBe('0.5');
  });

  it('strips \\text{...} units', () => {
    expect(cleanMathText('10 \\text{m}')).toBe('10');
  });

  it('strips \\text{...} with backslash-space prefix', () => {
    expect(cleanMathText('10\\ \\text{km}')).toBe('10');
  });

  it.each([
    ['10 m', '10'],
    ['5.2 kg', '5.2'],
    ['45 deg', '45'],
    ['45°', '45'],
    ['3.14 s', '3.14'],
  ])('strips trailing unit "%s" → "%s"', (input, expected) => {
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
  ])('strips trailing unit attached to the number "%s" → "%s"', (input, expected) => {
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['Vm', 'Vm'],
    ['5kgsmth', '5kgsmth'],
    ['50sec', '50sec'],
  ])('does not strip an identifier whose suffix happens to contain a unit (%s)', (input, expected) => {
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['x + m', 'x + m'],
    ['x + y * m', 'x + y * m'],
    ['a - b - g', 'a - b - g'],
    ['p + q * s', 'p + q * s'],
    ['2*m + 3*s', '2*m + 3*s'],
  ])('does not strip single-letter unit when used as a variable in an algebraic expression (%s)', (input, expected) => {
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
  ])('strips trailing unit after a fractional/LaTeX answer (%s → %s)', (input, expected) => {
    // The unit cleanup previously only matched a plain integer/decimal as
    // the left context, so "1/2 m" or "\\frac{1}{2} kg" left the unit in
    // place and CE then parsed it as a symbolic factor (e.g. `m`).
    expect(cleanMathText(input)).toBe(expected);
  });

  it('strips display math $$...$$', () => {
    expect(cleanMathText('$$\\frac{1}{2}$$')).toBe('\\frac{1}{2}');
  });

  it('strips display math \\[ ... \\]', () => {
    expect(cleanMathText('\\[\\frac{1}{2}\\]')).toBe('\\frac{1}{2}');
  });

  it('strips inline math \\( ... \\)', () => {
    expect(cleanMathText('\\(\\frac{1}{2}\\)')).toBe('\\frac{1}{2}');
  });

  it('strips inline math $...$', () => {
    expect(cleanMathText('$\\frac{1}{2}$')).toBe('\\frac{1}{2}');
  });

  it('strips bold markdown', () => {
    expect(cleanMathText('**42**')).toBe('42');
  });

  it('strips italic markdown', () => {
    expect(cleanMathText('*42*')).toBe('42');
  });

  it('preserves V = 32 inside bold markers', () => {
    expect(cleanMathText('**V = 32**')).toBe('V = 32');
  });

  it.each([
    ['2*3*4', '2*3*4'],
    ['1*2', '1*2'],
    ['x*y*z', 'x*y*z'],
    ['2*x*3', '2*x*3'],
  ])('preserves * multiplication operators (%s)', (input, expected) => {
    // The italic regex must NOT match asterisks adjacent to digits/letters,
    // otherwise "2*3*4" silently collapses to "234" before parsing.
    expect(cleanMathText(input)).toBe(expected);
  });

  it.each([
    ['2**3**4', '2**3**4'],
    ['x**y**z', 'x**y**z'],
  ])('preserves ** exponent / multiplication operators (%s)', (input, expected) => {
    expect(cleanMathText(input)).toBe(expected);
  });

  it('returns empty string unchanged', () => {
    expect(cleanMathText('')).toBe('');
  });

  it('leaves a plain number alone', () => {
    expect(cleanMathText('0.5')).toBe('0.5');
  });
});

// =============================================================================
// parseMathExpression / tryParseEachSegment
// =============================================================================

describe('parseMathExpression', () => {
  it('parses an integer', () => {
    const result = parseMathExpression('42');
    expect(result).toBeDefined();
  });

  it('parses a decimal', () => {
    const result = parseMathExpression('0.5');
    expect(result).toBeDefined();
  });

  it('parses a LaTeX \\frac', () => {
    const result = parseMathExpression('\\frac{1}{2}');
    expect(result).toBeDefined();
  });

  it('parses plain division 32/3', () => {
    const result = parseMathExpression('32/3');
    expect(result).toBeDefined();
  });

  it('parses cos(\\pi)', () => {
    const result = parseMathExpression('\\cos(\\pi)');
    expect(result).toBeDefined();
  });

  it('parses cos(4) (no backslash) after normalization', () => {
    const result = parseMathExpression('cos(4)');
    expect(result).toBeDefined();
  });

  it('strips "V ≈ " before parsing 5.09', () => {
    const result = parseMathExpression('V ≈ 5.09');
    expect(result).toBeDefined();
  });

  it('strips "a = " and parses 2', () => {
    const result = parseMathExpression('a = 2');
    expect(result).toBeDefined();
  });

  it('returns undefined for an empty string', () => {
    expect(parseMathExpression('')).toBeUndefined();
  });

  it('rejects bare equality "1 = 2" as not a value', () => {
    // The variable-assignment prefix-strip regex only fires when the LHS is an
    // identifier. "1 = 2" survives normalization unchanged and parses as an
    // Equal expression, which we treat as not-a-value.
    expect(parseMathExpression('1 = 2')).toBeUndefined();
  });

  describe('rejects pure prose to prevent letter-multiplication false positives', () => {
    it.each([
      ['apple'],
      ['hello'],
      ['no answer here'],
      ['some long prose with no answer'],
      ['the quick brown fox'],
    ])('rejects %s', (input) => {
      expect(parseMathExpression(input)).toBeUndefined();
    });

    it.each([
      ['42'],
      ['a+b'],
      ['x^2'],
      ['\\pi'],
      ['xy'], // 2-letter implicit product is intentionally still allowed
      ['\\frac{1}{2}'],
    ])('still parses %s as math', (input) => {
      expect(parseMathExpression(input)).toBeDefined();
    });
  });
});

describe('tryParseEachSegment', () => {
  it('returns the rightmost parseable segment of an equality chain', () => {
    const result = tryParseEachSegment('a × b = 4 × 1 = 4');
    expect(result).toBeDefined();
  });

  it('returns undefined for an empty string', () => {
    expect(tryParseEachSegment('')).toBeUndefined();
  });
});

// =============================================================================
// extractMathAnswer
// =============================================================================

describe('extractMathAnswer', () => {
  it('returns a plain number unchanged', () => {
    expect(extractMathAnswer('0.5')).toBe('0.5');
  });

  it('returns the last non-trivial line', () => {
    expect(extractMathAnswer('blah\nblah\n0.5')).toBe('0.5');
  });

  it('extracts a simple \\boxed{}', () => {
    expect(extractMathAnswer('answer is $\\boxed{42}$')).toBe('42');
  });

  it('extracts a \\boxed{\\frac{...}}', () => {
    expect(extractMathAnswer('\\boxed{\\frac{1}{2}}')).toBe('\\frac{1}{2}');
  });

  it('extracts a \\boxed{\\dfrac{...}} inside a $$ block', () => {
    expect(extractMathAnswer('$$\\boxed{\\dfrac{1}{2}}$$')).toBe('\\dfrac{1}{2}');
  });

  it('extracts deeply nested \\boxed{\\dfrac{8\\pi(2\\sqrt{2}-1)}{3}}', () => {
    const raw = '$$S(1) = \\boxed{\\dfrac{8\\pi(2\\sqrt{2}-1)}{3}}$$';
    const result = extractMathAnswer(raw);
    expect(result).toContain('\\dfrac');
    expect(result).toContain('\\sqrt');
  });

  it('strips <think> blocks before extracting', () => {
    expect(extractMathAnswer('<think>\nsteps\n</think>\n\n0.5')).toBe('0.5');
  });

  it('strips redacted thinking blocks before extracting', () => {
    expect(extractMathAnswer('Thinking: \nSignature: ErEeClkIDRgCK...\n\n0.5')).toBe('0.5');
  });

  it('strips inline-math wrappers from a fraction', () => {
    expect(extractMathAnswer('\\(\\frac{1}{6}\\)')).toBe('\\frac{1}{6}');
  });

  it('preserves negative sign on a fraction', () => {
    expect(extractMathAnswer('\\(-\\frac{10}{27}\\)')).toBe('-\\frac{10}{27}');
  });

  it('strips bold markers around 15', () => {
    expect(extractMathAnswer('**15**')).toBe('15');
  });

  it('returns the bold last line', () => {
    expect(extractMathAnswer('some work\n**32**')).toBe('32');
  });

  it('keeps assignment "V = 32" inside bold markers', () => {
    expect(extractMathAnswer('**V = 32**')).toBe('V = 32');
  });

  it('strips "Total: " label prefix', () => {
    expect(extractMathAnswer('Total: 14')).toBe('14');
  });

  it('strips "Answer: " label prefix', () => {
    expect(extractMathAnswer('Answer: 42')).toBe('42');
  });

  it('strips trailing prose after a comma', () => {
    const result = extractMathAnswer('7+e^{-4}, attained at $(-2,3)$');
    expect(result).toContain('e^{-4}');
    expect(result).not.toContain('attained');
  });

  it('skips a trailing \\] line that follows a $$...$$ block', () => {
    const raw = '$$\\frac{8\\pi}{3}$$\n\\]';
    const result = extractMathAnswer(raw);
    expect(result).not.toBe('\\]');
  });

  it('uses the display block when the surrounding line is truncated', () => {
    const raw = 'Let me compute: $$a = 2$$ and continuing... (truncated';
    expect(extractMathAnswer(raw)).toBe('a = 2');
  });

  it('strips units from inside \\boxed{}', () => {
    expect(extractMathAnswer('\\boxed{10\\ \\text{m}}')).toBe('10');
  });

  it('returns 5.09 from "**V ≈ 5.09**"', () => {
    expect(extractMathAnswer('**V ≈ 5.09**')).toContain('5.09');
  });

  it('returns empty string on empty input', () => {
    expect(extractMathAnswer('')).toBe('');
  });

  describe('prose-line answer extraction (rightmost numeric/LaTeX)', () => {
    it.each([
      ['The answer is 0.5', '0.5'],
      ['Therefore the result is 42', '42'],
      ['So the value is 7', '7'],
      ['After simplification we get \\frac{1}{2}', '\\frac{1}{2}'],
      ['the final value comes out to be 3.14159', '3.14159'],
    ])('extracts %s → %s', (input, expected) => {
      expect(extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['The answer is 0.5.', '0.5'],
      ['The answer is 42.', '42'],
      ['Therefore the result is 7!', '7'],
      ['So the value comes out to 3.14159.', '3.14159'],
      ['After simplification we get \\frac{1}{2}.', '\\frac{1}{2}'],
    ])('strips terminal sentence punctuation (%s → %s)', (input, expected) => {
      expect(extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['Answer: 0.5.', '0.5'],
      ['Final answer: 42.', '42'],
      ['Total: 14!', '14'],
      ['Result: 3.14159.', '3.14159'],
    ])('strips terminal sentence punctuation from labelled (non-prose) answers (%s → %s)', (input, expected) => {
      expect(extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['The answer is 1 / 2', '1 / 2'],
      ['The answer is x + 1', 'x + 1'],
      ['Therefore the result is x + y - 3', 'x + y - 3'],
      ['So the value comes out to 1 + 2 + 3', '1 + 2 + 3'],
      ['And so the answer is -1 / 4', '-1 / 4'],
    ])('extracts the contiguous trailing math expression from prose (%s → %s)', (input, expected) => {
      // Earlier versions returned only the rightmost token (e.g. "2" for
      // "1 / 2"), turning correct fractional/algebraic answers into
      // failures and even passing the wrong value.
      expect(extractMathAnswer(input)).toBe(expected);
    });

    it.each([
      ['The answer is 2 × 3', '2 × 3'],
      ['Therefore 6 ÷ 2', '6 ÷ 2'],
      ['So the result is 5 − 1', '5 − 1'],
      ['Final answer 2 · 3', '2 · 3'],
    ])('includes Unicode math operators (×, ÷, −, ·) when extracting prose answers (%s → %s)', (input, expected) => {
      // Prior to the fix, isMathShapedToken treated `×` / `÷` / `−` / `·`
      // as non-math tokens, so prose lines containing them stopped early
      // and returned only the rightmost numeric token.
      expect(extractMathAnswer(input)).toBe(expected);
    });

    it('does NOT touch a single-word labelled value (V = 32)', () => {
      expect(extractMathAnswer('**V = 32**')).toBe('V = 32');
    });

    it('does NOT touch a step-counter style "Step 1" line (single prose word)', () => {
      // "Step 1" has only one multi-letter alpha token, below the prose
      // threshold — so we shouldn't strip it down to "1" and falsely match.
      expect(extractMathAnswer('Step 1')).toBe('Step 1');
    });
  });

  describe('final-answer line beats earlier display blocks', () => {
    it('prefers "Answer: 3" on the last line over an earlier $$2$$', () => {
      expect(extractMathAnswer('$$2$$\nAnswer: 3')).toBe('3');
    });

    it('prefers "Answer: 3" on the last line over an earlier intermediate \\boxed{2}', () => {
      // Pre-fix: findAllBoxed ran before the final-line check, so an
      // intermediate boxed step (e.g. shown work) silently beat the actual
      // final answer.
      expect(extractMathAnswer('$$\\boxed{2}$$\nAnswer: 3')).toBe('3');
    });

    it('still uses \\boxed{42} when the last visible line itself is the boxed answer', () => {
      // The "boxed-on-the-last-line" case must keep working; only
      // intermediate boxed work should be skipped in favor of a later
      // final-answer line.
      expect(extractMathAnswer('Step 1: foo\nStep 2: bar\n$$\\boxed{42}$$')).toBe('42');
    });

    it('prefers a final-line numeric over an earlier display block', () => {
      expect(extractMathAnswer('Calculation: $$2 + 2$$\nFinal answer is 4')).toBe('4');
    });

    it('still uses the display block when the truncated text shares its line', () => {
      // Display fence on the last raw line keeps the existing "display block
      // wins for truncated prose" behavior.
      expect(extractMathAnswer('Let me compute: $$a = 2$$ and continuing... (truncated')).toBe(
        'a = 2',
      );
    });

    it.each([
      ['$$2$$ Answer: 3', '3'],
      ['$$5+5$$ Total: 10', '10'],
      ['work $$2$$, final answer: 3', '3'],
    ])('prefers a labelled answer after a same-line display fence (%s → %s)', (input, expected) => {
      // Pre-fix: fence-on-the-last-line skipped extractFromLastLine and the
      // display-block scanner returned the intermediate fenced value
      // ("2", "5+5"), ignoring the labelled final answer that came
      // after the fence on the same line.
      expect(extractMathAnswer(input)).toBe(expected);
    });

    it('grades $$2$$ Answer: 3 against 3, not the intermediate 2', () => {
      expect(isMathEquivalent('$$2$$ Answer: 3', 3).pass).toBe(true);
      expect(isMathEquivalent('$$2$$ Answer: 3', 2).pass).toBe(false);
    });
  });

  describe('approximation chains (≈, \\approx) split like equality chains', () => {
    it.each([
      ['1/2 ≈ 0.5', '0.5'],
      ['1/2 \\approx 0.5', '0.5'],
      ['$$1/2 \\approx 0.5$$', '0.5'],
    ])('grades approximate final answer "%s" against %s', (actual, expected) => {
      // tryParseEachSegment used to only split on literal `=` and missed
      // ≈/\\approx, so a pure-math line using ≈ was rejected as an
      // equality even though the docs say ≈ is treated as `=`.
      expect(isMathEquivalent(actual, expected).pass).toBe(true);
    });
  });

  describe('prose-only last lines fall back to earlier answers', () => {
    it('falls back to the earlier display block when the last line is pure prose', () => {
      // Pre-fix: returned "This is the final result" and CE then failed
      // to parse, so a correct $$\frac{1}{2}$$ answer was reported as wrong.
      expect(extractMathAnswer('$$\\frac{1}{2}$$\nThis is the final result.')).toBe('\\frac{1}{2}');
    });

    it('falls back to the earlier display block when the last line is "Done."', () => {
      expect(extractMathAnswer('$$42$$\nDone.')).toBe('42');
    });

    it('falls back to an earlier \\[ ... \\] display block when the last line is prose', () => {
      // \\[ ... \\] is documented as tolerated display math; falling back to
      // it on a prose-only trailer must work the same as $$...$$.
      expect(extractMathAnswer('\\[\\frac{1}{2}\\]\nThis is the final result.')).toBe(
        '\\frac{1}{2}',
      );
    });

    it('grades \\[\\frac{1}{2}\\] + prose trailer against 0.5', () => {
      expect(isMathEquivalent('\\[\\frac{1}{2}\\]\nThis is the final result.', '0.5').pass).toBe(
        true,
      );
    });

    it('still grades $$\\frac{1}{2}$$ + prose trailer against 0.5', () => {
      expect(isMathEquivalent('$$\\frac{1}{2}$$\nThis is the final result.', '0.5').pass).toBe(
        true,
      );
    });

    it('keeps an equality-chain display block (e.g. $$x = 2$$) on prose-only trailers', () => {
      // Pre-fix: when the display-block scanner discarded the equality, the
      // fallback later sliced the combined `cleaned` text on '=' and could
      // return the left segment ('x') instead of the documented rightmost
      // answer.
      expect(extractMathAnswer('$$x = 2$$\nDone.')).toBe('x = 2');
      expect(isMathEquivalent('$$x = 2$$\nDone.', 2).pass).toBe(true);
    });

    it('keeps a numeric equality-chain display block (e.g. $$230/530 = 23/53$$) on prose-only trailers', () => {
      // Numeric chains have no `var =` prefix to fall back on, so this
      // exercises the segment-fallback path in extractFromDisplayBlocks.
      // The extracted text must be the equality chain ALONE — without the
      // prose trailer — so tryParseEachSegment can split it cleanly
      // instead of seeing '23/53\nDone.' as the right segment.
      expect(extractMathAnswer('$$230/530 = 23/53$$\nDone.')).toBe('230/530 = 23/53');
      expect(isMathEquivalent('$$230/530 = 23/53$$\nDone.', '23/53').pass).toBe(true);
    });
  });

  describe('hidden-thinking display blocks must not leak through', () => {
    it('ignores $$...$$ inside <think> blocks', () => {
      expect(extractMathAnswer('<think>$$2$$</think>\nFinal answer: 3')).toBe('3');
    });

    it('ignores $$...$$ inside <think> blocks even when only the display block is "answer-like"', () => {
      // No labelled final-line answer here — the visible text is just "0.5".
      // The hidden $$2$$ must not bubble up.
      expect(extractMathAnswer('<think>$$2$$</think>\n0.5')).toBe('0.5');
    });

    it('ignores $$...$$ inside redacted-thinking blocks', () => {
      expect(extractMathAnswer('Thinking: \nSignature: AbCd123\n$$99$$\n\nAnswer: 7')).toBe('7');
    });
  });
});

// =============================================================================
// isMathEquivalent (full pipeline)
// =============================================================================

describe('isMathEquivalent', () => {
  describe('numeric equivalence', () => {
    it('matches identical decimals', () => {
      expect(isMathEquivalent('0.5', '0.5').pass).toBe(true);
    });

    it('matches a boxed fraction against a decimal', () => {
      expect(isMathEquivalent('\\boxed{\\dfrac{1}{2}}', '0.5').pass).toBe(true);
    });

    it('matches plain fraction against $\\frac{32}{3}$', () => {
      expect(isMathEquivalent('32/3', '$\\frac{32}{3}$').pass).toBe(true);
    });

    it('matches plain fraction with single-char denominator GT', () => {
      expect(isMathEquivalent('work...\n32/3', '$\\frac{32}3$').pass).toBe(true);
    });

    it('accepts a numeric expected value', () => {
      expect(isMathEquivalent('0.5', 0.5).pass).toBe(true);
    });
  });

  describe('formatting wrappers', () => {
    it('matches \\dfrac vs \\frac', () => {
      expect(isMathEquivalent('\\dfrac{8\\pi}{3}', '$\\frac{8\\pi}{3}$').pass).toBe(true);
    });

    it('matches with inline-math wrapper on both sides', () => {
      expect(isMathEquivalent('\\(\\frac{8\\pi}{3}\\)', '\\(\\frac{8\\pi}{3}\\)').pass).toBe(true);
    });

    it('matches a bold integer', () => {
      expect(isMathEquivalent('**15**', '15').pass).toBe(true);
    });

    it('matches a bold last line after prose', () => {
      expect(isMathEquivalent('computation...\n**15**', '15').pass).toBe(true);
    });

    it('matches a negative wrapped fraction', () => {
      expect(isMathEquivalent('\\(-\\frac{10}{27}\\)', '\\(-\\frac{10}{27}\\)').pass).toBe(true);
    });
  });

  describe('labels and suffixes', () => {
    it('matches "Total: 14" against 14', () => {
      expect(isMathEquivalent('Total: 14', '14').pass).toBe(true);
    });

    it('strips comma-suffixed prose before comparison', () => {
      expect(
        isMathEquivalent('7+e^{-4}, attained at $(-2,3)$ and $(2,-1)$', '$e^{-4} + 7$').pass,
      ).toBe(true);
    });
  });

  describe('trig', () => {
    it('matches "24+6cos4" with backslash-less digit form', () => {
      expect(isMathEquivalent('24+6cos4', '$24+6\\cos(4)$').pass).toBe(true);
    });

    it('matches "24 + 6cos(4)" with backslash-less paren form', () => {
      expect(isMathEquivalent('24 + 6cos(4)', '$24+6\\cos(4)$').pass).toBe(true);
    });

    it('matches sin(0) against 0', () => {
      expect(isMathEquivalent('sin(0)', '0').pass).toBe(true);
    });

    it('matches cos with space-separated digit', () => {
      expect(isMathEquivalent('24 + 6cos 4', '$24+6\\cos(4)$').pass).toBe(true);
    });
  });

  describe('nested boxed', () => {
    it('matches deeply nested \\boxed{\\dfrac{...}}', () => {
      const raw = '$$S = \\boxed{\\dfrac{8\\pi(2\\sqrt{2}-1)}{3}}$$';
      expect(isMathEquivalent(raw, '$\\frac{8\\pi(2\\sqrt{2}-1)}{3}$').pass).toBe(true);
    });
  });

  describe('units', () => {
    it('matches a boxed value with units against a unitless GT', () => {
      expect(isMathEquivalent('\\boxed{10\\ \\text{m}}', '$10$').pass).toBe(true);
    });

    it('matches a bold value with units against a unitless GT', () => {
      expect(isMathEquivalent('**10 m**', '$10$').pass).toBe(true);
    });
  });

  describe('approx', () => {
    it('matches "**V ≈ 5.09**" against 5.09', () => {
      expect(isMathEquivalent('**V ≈ 5.09**', '$5.09$').pass).toBe(true);
    });

    it('matches "\\boxed{V \\approx 5.09}" against 5.09', () => {
      expect(isMathEquivalent('\\boxed{V \\approx 5.09}', '$5.09$').pass).toBe(true);
    });

    it('matches "$$\\boxed{V \\approx 5.09}$$" against 5.09', () => {
      expect(isMathEquivalent('$$\\boxed{V \\approx 5.09}$$', '$5.09$').pass).toBe(true);
    });
  });

  describe('truncated responses', () => {
    it('uses the display block when the line is truncated', () => {
      const raw = 'Let me compute carefully: $$a = 2$$ and continuing... (truncated';
      expect(isMathEquivalent(raw, '$2$').pass).toBe(true);
    });

    it('uses the prose answer on the last line', () => {
      expect(isMathEquivalent('After computing:\n0.9124', '0.9124').pass).toBe(true);
    });
  });

  describe('LLM judge audit patterns', () => {
    it('matches unicode √ form', () => {
      expect(isMathEquivalent('20√57', '$20\\sqrt{57}$').pass).toBe(true);
    });

    it('matches unicode √ with unicode minus', () => {
      expect(isMathEquivalent('−185√23 / 6', '$-\\frac{185\\sqrt{23}}{6}$').pass).toBe(true);
    });

    it('matches unicode minus in plain fraction', () => {
      expect(isMathEquivalent('−1/4', '$-\\frac{1}{4}$').pass).toBe(true);
    });

    it('matches unicode minus against \\frac32 (single-char denom)', () => {
      expect(isMathEquivalent('−3/2', '$-\\frac32$').pass).toBe(true);
    });

    it('matches "a × b = 4 × 1 = 4" via segment parsing', () => {
      expect(isMathEquivalent('a × b = 4 × 1 = 4', '4').pass).toBe(true);
    });

    it('matches "230/530 = 23/53" via segment parsing', () => {
      expect(isMathEquivalent('230/530 = 23/53', '$\\frac{23}{53}$').pass).toBe(true);
    });

    it('strips P(Safe|F) prefix before comparing', () => {
      expect(isMathEquivalent('P(Safe|F) \\approx 0.0113', '0.0113').pass).toBe(true);
    });

    it('handles european decimal comma "2,00625"', () => {
      expect(isMathEquivalent('2,00625', '2.00625').pass).toBe(true);
    });

    it('strips a leading ≈ symbol', () => {
      expect(isMathEquivalent('≈ 33167.52', '33167.52').pass).toBe(true);
    });

    it('strips a "(i.e., ...)" parenthetical', () => {
      expect(isMathEquivalent('−1/4 (i.e., −$0.25)', '$-\\frac{1}{4}$').pass).toBe(true);
    });
  });

  describe('genuine non-equivalence (must stay false)', () => {
    it('rejects 42 vs 43', () => {
      expect(isMathEquivalent('42', '43').pass).toBe(false);
    });

    it('rejects pure prose with no answer against 42', () => {
      expect(isMathEquivalent('some long prose with no answer', '42').pass).toBe(false);
    });

    it('rejects 1/6 vs 7/6', () => {
      expect(isMathEquivalent('\\frac{1}{6}', '\\frac{7}{6}').pass).toBe(false);
    });

    it('rejects 0.86 vs 0.67', () => {
      expect(isMathEquivalent('0.86', '0.67').pass).toBe(false);
    });

    it('rejects -3 vs -3/2 (judge FP regression)', () => {
      expect(isMathEquivalent('-3', '$-\\frac32$').pass).toBe(false);
    });

    it('rejects 49/106 vs 23/53 (judge FP regression)', () => {
      expect(isMathEquivalent('49/106', '$\\frac{23}{53}$').pass).toBe(false);
    });

    it('rejects extra π factor (judge FP regression)', () => {
      expect(isMathEquivalent('\\dfrac{3260416\\,\\pi}{405}', '$\\frac{3260416}{405}$').pass).toBe(
        false,
      );
    });

    it('rejects 5π/3 vs -π/3 (mod-2π collapse FP regression)', () => {
      expect(isMathEquivalent('\\dfrac{5\\pi}{3}', '-\\frac{\\pi}{3}').pass).toBe(false);
    });

    it.each([
      ['The answer is 0.5', '0.5'],
      ['Therefore the result is 42', 42],
      ['So the value is 7', '$7$'],
      ['After simplification we get \\frac{1}{2}', '0.5'],
    ])('matches prose-wrapped answer "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it.each([
      ['2*3*4', '24'],
      ['1*2', 2],
      ['2*3', '6'],
    ])('grades * multiplication ("%s" vs %s) as equivalent', (actual, expected) => {
      // Without the asterisk-preservation fix, "2*3*4" would clean to "234"
      // and grade as 234 ≠ 24.
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it.each([
      ['\\frac{1}\\pi', '\\frac{1}{\\pi}'],
      ['\\frac{2}\\theta', '\\frac{2}{\\theta}'],
    ])('grades \\frac with backslash-command denom ("%s" vs %s) as equivalent', (actual, expected) => {
      expect(isMathEquivalent(actual, expected).pass).toBe(true);
    });

    it.each([
      ['<think>$$2$$</think>\nFinal answer: 3', '3'],
      ['<think>$$2$$</think>\n0.5', '0.5'],
    ])('ignores hidden display math inside <think> ("%s" vs %s)', (actual, expected) => {
      expect(isMathEquivalent(actual, expected).pass).toBe(true);
    });

    it.each([
      ['1,000', '1000'],
      ['1,234', 1234],
      ['1,234,567', '1234567'],
      ['12,345', 12345],
    ])('grades thousands-grouped integer "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it('does NOT silently equate 1,000 with 1', () => {
      // The decimal-comma rewrite previously turned "1,000" into "1.000"=1,
      // making "1,000" spuriously equivalent to 1.
      expect(isMathEquivalent('1,000', '1').pass).toBe(false);
    });

    it.each([
      ['The answer is 0.5.', '0.5'],
      ['Therefore the result is 7!', 7],
      ['So the answer comes out to 3.14159.', '3.14159'],
    ])('grades sentence-terminated prose "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it.each([
      ['Answer: 0.5.', '0.5'],
      ['Final answer: 42.', 42],
      ['Total: 14.', '14'],
    ])('grades labelled sentence-terminated answers "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it.each([
      ['10kg', 10],
      ['5m', '5'],
      ['45deg', 45],
      ['100ms', '100'],
    ])('grades unit-attached numeric answers "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it.each([
      ['1/2 m', '0.5'],
      ['\\frac{1}{2} kg', 0.5],
      ['\\frac{1}{2}m', '0.5'],
      ['\\sqrt{2} m', '\\sqrt{2}'],
    ])('grades fractional / LaTeX answers with trailing units "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it.each([
      ['The answer is 1 / 2', '0.5'],
      ['The answer is 1 / 2', '\\frac{1}{2}'],
      ['The answer is x + 1', 'x + 1'],
      ['Therefore the result is x + y - 3', 'x + y - 3'],
      ['So the value comes out to 1 + 2 + 3', '6'],
      ['And so the answer is -1 / 4', '-0.25'],
    ])('grades prose-wrapped contiguous math expression "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected).pass).toBe(true);
    });

    it.each([
      ['The answer is 2 × 3', 6],
      ['Therefore 6 ÷ 2', 3],
      ['So the result is 5 − 1', 4],
      ['Final answer 2 · 3', 6],
    ])('grades prose answers with Unicode math operators "%s" against %s', (actual, expected) => {
      expect(isMathEquivalent(actual, expected as string | number).pass).toBe(true);
    });

    it.each([
      ['x + m', 'x + m'],
      ['a - b - g', 'a - b - g'],
      ['p + q * s', 'p*s + q*s'], // mathematically not equal, but parse should NOT corrupt either side
    ])('does not corrupt algebraic expressions ending in a unit-letter (%s)', (actual, expected) => {
      // Confirm the expression parses both ways without unit-stripping
      // mangling either side. The (%s)/(%s) pair may or may not be
      // equivalent; we just check we don't get a parseFailed reason
      // pointing at a corrupted "x +" candidate.
      const result = isMathEquivalent(actual, expected);
      expect(result.parseFailed ?? false).toBe(false);
    });

    it('grades hidden-think display math against the WRONG value as false', () => {
      // Inverse of the above: must NOT match the hidden intermediate.
      expect(isMathEquivalent('<think>$$2$$</think>\nFinal answer: 3', '2').pass).toBe(false);
      expect(isMathEquivalent('<think>$$2$$</think>\n0.5', '2').pass).toBe(false);
    });

    it('grades "$$2$$\\nAnswer: 3" against 3 (not 2)', () => {
      // Earlier display blocks are intermediate work; the labelled final-line
      // answer should win.
      expect(isMathEquivalent('$$2$$\nAnswer: 3', '3').pass).toBe(true);
      expect(isMathEquivalent('$$2$$\nAnswer: 3', '2').pass).toBe(false);
    });

    it('rejects identical English-word inputs as a defensive misuse guard', () => {
      // Without the prose heuristic, both sides would parse to the same
      // Multiply of letter symbols and report pass=true — silently accepting
      // a misconfigured math-equivalent assertion.
      const result = isMathEquivalent('apple', 'apple');
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Could not parse');
    });
  });

  describe('non-finite numeric inputs', () => {
    it('rejects NaN expected value with a clear reason', () => {
      const result = isMathEquivalent('0', Number.NaN);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('NaN');
    });

    it.each([
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ])('rejects %s expected value with a clear reason', (val) => {
      const result = isMathEquivalent('0', val);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('finite');
    });
  });

  describe('CortexJS fault tolerance (catch fences)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns undefined when ce.parse throws (parseMathExpression catch)', () => {
      // Force the engine's parse to throw. The fence inside parseMathExpression
      // must swallow the error and return undefined rather than propagating.
      vi.spyOn(ComputeEngine.prototype, 'parse').mockImplementation(() => {
        throw new Error('simulated CortexJS parse failure');
      });
      expect(parseMathExpression('42')).toBeUndefined();
    });

    it('reports a comparison failure when ce.box throws on Subtract (isMathEquivalent catch)', () => {
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
      const result = isMathEquivalent('1', '1');
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Math equivalence comparison failed');
      expect(result.reason).toContain('simulated CortexJS box failure');
      // Comparison errors must mark parseFailed so handlers do NOT invert them
      // for not-math-equivalent (otherwise an engine glitch silently passes).
      expect(result.parseFailed).toBe(true);
    });
  });

  describe('parse-failure flag for downstream handlers', () => {
    it('marks parse failure on the actual side', () => {
      const result = isMathEquivalent('no answer here', '42');
      expect(result.pass).toBe(false);
      expect(result.parseFailed).toBe(true);
    });

    it('marks parse failure on the expected side', () => {
      const result = isMathEquivalent('42', 'apple');
      expect(result.pass).toBe(false);
      expect(result.parseFailed).toBe(true);
    });

    it('does not set parseFailed when comparison succeeds', () => {
      const result = isMathEquivalent('1', '1');
      expect(result.pass).toBe(true);
      expect(result.parseFailed).toBeFalsy();
    });

    it('does not set parseFailed when comparison runs and reports false', () => {
      const result = isMathEquivalent('1', '2');
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

describe('handleMathEquivalent', () => {
  it('passes when output matches the string expected value', () => {
    const result = handleMathEquivalent(
      makeParams({ renderedValue: '0.5', outputString: '\\boxed{\\frac{1}{2}}' }),
    );
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('Math equivalence assertion passed');
  });

  it('passes when output matches a numeric expected value', () => {
    const result = handleMathEquivalent(
      makeParams({ renderedValue: 0.5, outputString: '\\frac{1}{2}' }),
    );
    expect(result.pass).toBe(true);
  });

  it('fails when output does not match the expected value', () => {
    const result = handleMathEquivalent(makeParams({ renderedValue: '0.5', outputString: '0.6' }));
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('not equivalent');
  });

  it('fails with a parse-failure reason when output is pure prose', () => {
    const result = handleMathEquivalent(
      makeParams({ renderedValue: '42', outputString: 'no answer here' }),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Could not parse actual answer');
  });

  it('respects the inverse flag (not-math-equivalent)', () => {
    const matched = handleMathEquivalent(
      makeParams({
        renderedValue: '0.5',
        outputString: '0.6',
        inverse: true,
      }),
    );
    expect(matched.pass).toBe(true);

    const failed = handleMathEquivalent(
      makeParams({
        renderedValue: '0.5',
        outputString: '0.5',
        inverse: true,
      }),
    );
    expect(failed.pass).toBe(false);
  });

  it('does not let not-math-equivalent silently pass when comparison errors mid-flight', () => {
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
      const result = handleMathEquivalent(
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

  it('does not let not-math-equivalent silently pass on unparseable output', () => {
    // Without short-circuiting parse failure, "not-math-equivalent: 42" would
    // accept any unparseable garbage (empty string, prose, etc.) since the
    // unparseable→pass=false flips to true under inverse. That hides
    // provider regressions; treat parse failure as a hard failure regardless
    // of inverse.
    for (const garbage of ['', 'no answer here', 'the model refused', 'apple']) {
      const result = handleMathEquivalent(
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

  it('throws when renderedValue is neither string nor number', () => {
    expect(() =>
      handleMathEquivalent(
        makeParams({
          renderedValue: { foo: 'bar' } as unknown as AssertionParams['renderedValue'],
          outputString: '0.5',
        }),
      ),
    ).toThrow('"math-equivalent" assertion type must have a string or number value');
  });
});
