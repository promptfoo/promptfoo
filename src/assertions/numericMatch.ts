import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/** Default relative tolerance: 0.5% of the expected value. */
export const DEFAULT_NUMERIC_MATCH_TOLERANCE = 0.005;

export type NumericMatchMode = 'first' | 'last' | 'closest';

const NUMERIC_MATCH_MODES: readonly NumericMatchMode[] = ['first', 'last', 'closest'];

const SCALE_MULTIPLIERS: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  mn: 1e6,
  m: 1e6,
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  trillion: 1e12,
  t: 1e12,
};

/**
 * Matches one number token, for example `$416.2 billion`, `416,161 million`, `$416.16B`,
 * `(1,234)`, `-3.5` or `4.16161e11`. A token must not start in the middle of a word, so `FY2025`
 * and `Q3` are ignored. Spelled-out scale words may follow a space; abbreviations (K/M/B/T) must
 * be attached to the number, and `bn`/`mn` may follow a space.
 */
const NUMBER_TOKEN_REGEX =
  /(?<![\p{L}\p{N}_.])(\()?([-−])?([$€£¥])?([-−])?((?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?)(?:(?:\s?(thousand|million|billion|trillion|bn|mn)s?\b)|([kmbt])(?![\p{L}\p{N}_]))?(\))?/giu;

/**
 * A `Final answer` heading line: `Final answer: 42`, `**Final answer:** 42`, `Final answer - 42`
 * or `Final answer -42`. It must start its line (after optional Markdown markers) and end at a
 * word boundary, so prose such as "to get the final answer, apply the formula" does not count. A
 * dash only counts as a delimiter when whitespace follows it, so a minus sign attached to the
 * number is kept.
 */
const FINAL_ANSWER_REGEX =
  /^[ \t>#*_]*final answer\b[*_]*[ \t]*(?::|[-–—](?=\s))?[*_]*[ \t]*([^\n]*)/gim;

/** SEC form names such as `10-K`, `10-Q`, `8-K`, `20-F` and `6-K`. */
const SEC_FORM_SUFFIX_REGEX = /^-(?:K|Q|F)(?:T|\/A)?(?![\p{L}\p{N}_])/iu;
const PERCENT_SUFFIX_REGEX = /^\s?(?:%|percent\b|per cent\b)/i;

export interface NumberToken {
  value: number;
  /** True for tokens that are rarely the stated answer: SEC form names, bare years and percentages. */
  isIncidental: boolean;
}

/**
 * Extracts number tokens from text, normalizing currency symbols, thousands separators,
 * scientific notation, scale words/suffixes and accounting-style negatives. Values that overflow
 * when scaled are returned as non-finite so callers can reject them.
 */
export function extractNumberTokens(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN_REGEX)) {
    const [
      token,
      openParen,
      signBefore,
      currency,
      signAfter,
      digits,
      scaleWord,
      scaleSuffix,
      closeParen,
    ] = match;
    let value = Number.parseFloat(digits.replace(/,/g, ''));
    const scale = (scaleWord ?? scaleSuffix)?.toLowerCase();
    if (scale) {
      value *= SCALE_MULTIPLIERS[scale];
    }
    const isAccountingNegative = Boolean(openParen && closeParen);
    const isNegative = Boolean(signBefore || signAfter || isAccountingNegative);
    if (isNegative) {
      value = -value;
    }
    const rest = text.slice((match.index ?? 0) + token.length);
    const isSecFormName = !scale && !closeParen && SEC_FORM_SUFFIX_REGEX.test(rest);
    const isPercentage = !scale && !closeParen && PERCENT_SUFFIX_REGEX.test(rest);
    const isBareYear =
      /^\d{4}$/.test(digits) &&
      !currency &&
      !scale &&
      !isNegative &&
      value >= 1900 &&
      value <= 2099;
    tokens.push({ value, isIncidental: isSecFormName || isPercentage || isBareYear });
  }
  return tokens;
}

/** Extracts the finite numbers from text, in order. See {@link extractNumberTokens}. */
export function extractNumbers(text: string): number[] {
  return extractNumberTokens(text)
    .map((token) => token.value)
    .filter((value) => Number.isFinite(value));
}

/**
 * Returns the text that holds the stated answer: the content of the last `Final answer` heading
 * line (or the block under a bare heading) when the output has one, otherwise the whole output.
 */
export function getStatedAnswerText(text: string): string {
  const finalAnswers = [...text.matchAll(FINAL_ANSWER_REGEX)];
  if (finalAnswers.length === 0) {
    return text;
  }
  const last = finalAnswers[finalAnswers.length - 1];
  if (last[1].trim() !== '') {
    return last[1];
  }
  // A bare heading: the answer is the block (for example a bullet list) up to the next blank line.
  const afterHeading = text.slice((last.index ?? 0) + last[0].length);
  return afterHeading.split(/\n[ \t]*\n/)[0];
}

function parseExpectedValue(value: unknown): number {
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), '"numeric-match" assertion value must be a finite number');
    return value;
  }
  invariant(
    typeof value === 'string',
    '"numeric-match" assertion must have a number or numeric string value',
  );
  const tokens = extractNumberTokens(value);
  invariant(
    tokens.every((token) => Number.isFinite(token.value)),
    `"numeric-match" assertion value overflows when scaled. Received: ${value}`,
  );
  const numbers = tokens.map((token) => token.value);
  invariant(
    numbers.length === 1,
    `"numeric-match" assertion value must contain exactly one number. Received: ${value}`,
  );
  return numbers[0];
}

function relativeError(actual: number, expected: number): number {
  // With an expected value of 0, fall back to the absolute error.
  return expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected);
}

function selectCandidate(
  tokens: NumberToken[],
  expected: number,
  mode: NumericMatchMode,
): number | undefined {
  const finiteTokens = tokens.filter((token) => Number.isFinite(token.value));
  if (finiteTokens.length === 0) {
    return undefined;
  }
  if (mode === 'closest') {
    return finiteTokens
      .map((token) => token.value)
      .reduce((best, candidate) =>
        relativeError(candidate, expected) < relativeError(best, expected) ? candidate : best,
      );
  }
  // Skip SEC form names, bare years and percentages, unless nothing else is left.
  const answerTokens = finiteTokens.filter((token) => !token.isIncidental);
  const candidates = answerTokens.length > 0 ? answerTokens : finiteTokens;
  return mode === 'first' ? candidates[0].value : candidates[candidates.length - 1].value;
}

/**
 * Deterministic numeric comparison. Extracts the stated number from the output and passes when it
 * is within a relative tolerance (`threshold`, default 0.5%) of the expected value.
 *
 * Score is `1 - error / tolerance`, clamped to [0, 1], so near misses rank above wild misses.
 */
export function handleNumericMatch({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult {
  const expected = parseExpectedValue(renderedValue);
  const tolerance = assertion.threshold ?? DEFAULT_NUMERIC_MATCH_TOLERANCE;
  invariant(
    Number.isFinite(tolerance) && tolerance >= 0,
    '"numeric-match" assertion threshold must be a non-negative number',
  );
  const mode: NumericMatchMode = assertion.config?.mode ?? 'closest';
  invariant(
    NUMERIC_MATCH_MODES.includes(mode),
    `"numeric-match" assertion config.mode must be one of: ${NUMERIC_MATCH_MODES.join(', ')}`,
  );

  const actual = selectCandidate(
    extractNumberTokens(getStatedAnswerText(outputString)),
    expected,
    mode,
  );
  if (actual === undefined) {
    return {
      pass: inverse,
      score: inverse ? 1 : 0,
      reason: inverse
        ? 'Assertion passed'
        : `Expected output to contain a number close to ${expected}, but no number was found`,
      assertion,
    };
  }

  const error = relativeError(actual, expected);
  const withinTolerance = error <= tolerance;
  const closeness =
    tolerance === 0 ? (withinTolerance ? 1 : 0) : Math.max(0, Math.min(1, 1 - error / tolerance));
  const pass = withinTolerance !== inverse;
  const errorDescription = expected === 0 ? `absolute error ${error}` : `relative error ${error}`;

  return {
    pass,
    score: inverse ? 1 - closeness : closeness,
    reason: pass
      ? 'Assertion passed'
      : `Expected ${actual} ${inverse ? 'not ' : ''}to be within ${tolerance} of ${expected} (${errorDescription})`,
    assertion,
  };
}
