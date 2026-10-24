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
 * `(1,234)` or `-3.5`. A token must not start in the middle of a word, so `FY2025` and `Q3`
 * are ignored. Spelled-out scale words may follow a space; abbreviations (K/M/B/T) must be
 * attached to the number, and `bn`/`mn` may follow a space.
 */
const NUMBER_TOKEN_REGEX =
  /(?<![\p{L}\p{N}_.])(\()?([-−])?\s?([$€£¥])?([-−])?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:(?:\s?(thousand|million|billion|trillion|bn|mn)s?\b)|([kmbt])(?![\p{L}\p{N}_]))?(\))?/giu;

const FINAL_ANSWER_REGEX = /final answer\s*[:\-–—]\s*([^\n]*)/gi;

/**
 * Extracts numbers from text, normalizing currency symbols, thousands separators, scale
 * words/suffixes and accounting-style negatives.
 */
export function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN_REGEX)) {
    const [, openParen, signBefore, , signAfter, digits, scaleWord, scaleSuffix, closeParen] =
      match;
    let value = Number.parseFloat(digits.replace(/,/g, ''));
    if (!Number.isFinite(value)) {
      continue;
    }
    const scale = (scaleWord ?? scaleSuffix)?.toLowerCase();
    if (scale) {
      value *= SCALE_MULTIPLIERS[scale];
    }
    const isAccountingNegative = Boolean(openParen && closeParen);
    if (signBefore || signAfter || isAccountingNegative) {
      value = -value;
    }
    numbers.push(value);
  }
  return numbers;
}

/**
 * Returns the text that holds the stated answer: the content of the last `Final answer:` line
 * when the output has one, otherwise the whole output.
 */
export function getStatedAnswerText(text: string): string {
  const finalAnswers = [...text.matchAll(FINAL_ANSWER_REGEX)];
  return finalAnswers.length > 0 ? finalAnswers[finalAnswers.length - 1][1] : text;
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
  const numbers = extractNumbers(value);
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
  candidates: number[],
  expected: number,
  mode: NumericMatchMode,
): number | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  if (mode === 'first') {
    return candidates[0];
  }
  if (mode === 'last') {
    return candidates[candidates.length - 1];
  }
  return candidates.reduce((best, candidate) =>
    relativeError(candidate, expected) < relativeError(best, expected) ? candidate : best,
  );
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
  const mode: NumericMatchMode = assertion.config?.mode ?? 'first';
  invariant(
    NUMERIC_MATCH_MODES.includes(mode),
    `"numeric-match" assertion config.mode must be one of: ${NUMERIC_MATCH_MODES.join(', ')}`,
  );

  const actual = selectCandidate(extractNumbers(getStatedAnswerText(outputString)), expected, mode);
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
