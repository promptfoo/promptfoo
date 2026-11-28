import { z } from 'zod';

import type { AssertionParams, GradingResult } from '../types/index';

const numericValueSchema = z.union([
  z.number().finite(),
  z
    .object({ min: z.number().finite().optional(), max: z.number().finite().optional() })
    .strict()
    .refine(({ min, max }) => min !== undefined || max !== undefined)
    .refine(({ min, max }) => min === undefined || max === undefined || min <= max),
]);

/** Parse numeric text without coercing null, booleans, arrays, or empty strings to numbers. */
function parseNumber(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export const handleNumeric = ({
  assertion,
  renderedValue,
  output,
  inverse,
}: Pick<AssertionParams, 'assertion' | 'renderedValue' | 'output' | 'inverse'>): GradingResult => {
  const expected = numericValueSchema.safeParse(
    typeof renderedValue === 'string' ? parseNumber(renderedValue) : renderedValue,
  );
  if (!expected.success) {
    throw new Error(
      '"numeric" assertion value must be a finite number or an object with finite min and/or max bounds (min <= max)',
    );
  }

  const actual = parseNumber(output);
  // Missing or invalid measurements cannot pass a negated range check either.
  if (typeof actual !== 'number' || !Number.isFinite(actual)) {
    return { pass: false, score: 0, reason: 'Expected a finite numeric output', assertion };
  }
  const value = expected.data;
  const matches =
    typeof value === 'number'
      ? actual === value
      : (value.min === undefined || actual >= value.min) &&
        (value.max === undefined || actual <= value.max);
  const pass = inverse ? !matches : matches;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected ${actual} to ${inverse ? 'not ' : ''}match numeric constraint ${JSON.stringify(value)}`,
    assertion,
  };
};
