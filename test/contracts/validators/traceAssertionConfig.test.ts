import { describe, expect, it } from 'vitest';
import {
  traceErrorSpansConfigError,
  traceSpanCountBoundsError,
  traceSpanDurationConfigError,
} from '../../../src/contracts/index';

describe('traceAssertionConfig shared validators', () => {
  describe('traceSpanCountBoundsError', () => {
    it('requires at least one bound', () => {
      expect(traceSpanCountBoundsError({})).toBe(
        'trace-span-count assertion must include a min or max property',
      );
    });

    it('rejects negative, fractional, and inverted bounds', () => {
      expect(traceSpanCountBoundsError({ min: -1 })).toBe(
        'trace-span-count assertion min must be a finite non-negative integer',
      );
      expect(traceSpanCountBoundsError({ max: 1.5 })).toBe(
        'trace-span-count assertion max must be a finite non-negative integer',
      );
      expect(traceSpanCountBoundsError({ min: 5, max: 2 })).toBe(
        'trace-span-count assertion max must be greater than or equal to min',
      );
    });

    it('accepts valid bounds', () => {
      expect(traceSpanCountBoundsError({ min: 1, max: 3 })).toBeUndefined();
    });
  });

  describe('traceSpanDurationConfigError', () => {
    it('rejects a negative max', () => {
      expect(traceSpanDurationConfigError({ max: -1 })).toBe(
        'trace-span-duration assertion max must be a finite non-negative number',
      );
    });

    it('rejects an empty pattern and a non-boolean requirePresence', () => {
      expect(traceSpanDurationConfigError({ max: 10, pattern: '' })).toBe(
        'trace-span-duration assertion pattern must be a non-empty string',
      );
      expect(traceSpanDurationConfigError({ max: 10, pattern: '   ' })).toBe(
        'trace-span-duration assertion pattern must be a non-empty string',
      );
      expect(traceSpanDurationConfigError({ max: 10, requirePresence: 'yes' })).toBe(
        'trace-span-duration assertion requirePresence must be a boolean',
      );
    });

    it('only enforces percentile/method when a percentile is requested', () => {
      expect(traceSpanDurationConfigError({ max: 10, method: 'median' })).toBeUndefined();
      expect(traceSpanDurationConfigError({ max: 10, percentile: 150 })).toBe(
        'trace-span-duration assertion percentile must be between 0 and 100',
      );
      expect(traceSpanDurationConfigError({ max: 10, percentile: 95, method: 'median' })).toBe(
        'trace-span-duration assertion method must be "nearest" or "linear"',
      );
      expect(traceSpanDurationConfigError({ max: 10, percentile: 95 })).toBeUndefined();
    });
  });

  describe('traceErrorSpansConfigError', () => {
    it('validates the number shorthand', () => {
      expect(traceErrorSpansConfigError(0)).toBeUndefined();
      expect(traceErrorSpansConfigError(-1)).toBe(
        'trace-error-spans assertion max_count must be a finite non-negative integer',
      );
    });

    it('validates object fields', () => {
      expect(traceErrorSpansConfigError({ pattern: '' })).toBe(
        'trace-error-spans assertion pattern must be a non-empty string',
      );
      expect(traceErrorSpansConfigError({ pattern: '   ' })).toBe(
        'trace-error-spans assertion pattern must be a non-empty string',
      );
      expect(traceErrorSpansConfigError({ requirePresence: 'no' })).toBe(
        'trace-error-spans assertion requirePresence must be a boolean',
      );
      expect(traceErrorSpansConfigError({ max_percentage: 150 })).toBe(
        'trace-error-spans assertion max_percentage must be between 0 and 100',
      );
      expect(traceErrorSpansConfigError({ max_count: 2, max_percentage: 50 })).toBeUndefined();
    });

    it('accepts values that resolve to defaults at runtime', () => {
      expect(traceErrorSpansConfigError({})).toBeUndefined();
      expect(traceErrorSpansConfigError('anything')).toBeUndefined();
    });
  });
});
