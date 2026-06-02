import { describe, expect, it } from 'vitest';
import {
  isNunjucksOutputExpression,
  notTrajectoryToolUsedBoundsError,
  tokensUsedConfigError,
  traceErrorSpansConfigError,
  traceSpanCountBoundsError,
  traceSpanDurationConfigError,
  trajectoryCountBoundsError,
  trajectoryGoalSuccessTimeoutError,
  trajectoryRedactArgsError,
  trajectoryToolSequenceModeError,
  trajectoryToolSetConfigError,
} from '../../src/util/traceAssertionConfig';

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

  describe('tokensUsedConfigError', () => {
    it('requires valid bounds', () => {
      expect(tokensUsedConfigError({})).toBe('tokens-used assertion must include min or max');
      expect(tokensUsedConfigError({ min: -1 })).toBe(
        'tokens-used min must be a finite non-negative number',
      );
      expect(tokensUsedConfigError({ max: '100' })).toBe(
        'tokens-used max must be a finite non-negative number',
      );
      expect(tokensUsedConfigError({ max: '{{ token_budget }}' })).toBe(
        'tokens-used max must be a finite non-negative number',
      );
      expect(tokensUsedConfigError({ min: 5, max: 2 })).toBe(
        'tokens-used min must be less than or equal to max',
      );
      expect(tokensUsedConfigError({ min: 1, max: 2 })).toBeUndefined();
    });

    it('validates source and pattern', () => {
      expect(tokensUsedConfigError({ max: 10, source: 'cache' })).toBe(
        'tokens-used source must be "trace", "response", or "auto"',
      );
      expect(tokensUsedConfigError({ max: 10, pattern: '  ' })).toBe(
        'tokens-used pattern must be a non-empty string',
      );
      expect(tokensUsedConfigError({ max: 10, source: 'trace', pattern: 'llm.*' })).toBeUndefined();
    });
  });

  describe('isNunjucksOutputExpression', () => {
    it('accepts one full output expression and rejects partial or block templates', () => {
      expect(isNunjucksOutputExpression('{{ token_budget }}')).toBe(true);
      expect(isNunjucksOutputExpression('  {{ token_budget | int }}  ')).toBe(true);
      expect(isNunjucksOutputExpression('100')).toBe(false);
      expect(isNunjucksOutputExpression('100{{ "" }}')).toBe(false);
      expect(isNunjucksOutputExpression('{{ token_budget }} tokens')).toBe(false);
      expect(isNunjucksOutputExpression('{{ a }}{{ b }}')).toBe(false);
      expect(isNunjucksOutputExpression('{% set budget = 100 %}{{ budget }}')).toBe(false);
    });
  });

  describe('trajectoryCountBoundsError', () => {
    it('interpolates the assertion type into the message', () => {
      expect(trajectoryCountBoundsError({ min: -1 }, 'trajectory:tool-used')).toBe(
        'trajectory:tool-used assertion min must be a finite non-negative integer',
      );
      expect(trajectoryCountBoundsError({ min: 5, max: 2 }, 'trajectory:step-count')).toBe(
        'trajectory:step-count assertion max must be greater than or equal to min',
      );
      expect(
        trajectoryCountBoundsError({ min: 1, max: 2 }, 'trajectory:tool-used'),
      ).toBeUndefined();
    });
  });

  describe('notTrajectoryToolUsedBoundsError', () => {
    it('accepts forbidden-use object forms', () => {
      expect(notTrajectoryToolUsedBoundsError({})).toBeUndefined();
      expect(notTrajectoryToolUsedBoundsError({ max: 0 })).toBeUndefined();
    });

    it('rejects ambiguous inverse count ranges', () => {
      expect(notTrajectoryToolUsedBoundsError({ min: 1 })).toBe(
        'not-trajectory:tool-used object assertions only support name/pattern with no count bounds, or max: 0',
      );
      expect(notTrajectoryToolUsedBoundsError({ max: 1 })).toBe(
        'not-trajectory:tool-used object assertions only support name/pattern with no count bounds, or max: 0',
      );
    });
  });

  describe('trajectoryGoalSuccessTimeoutError', () => {
    it('only validates timeoutMs when present and requires a positive number', () => {
      expect(trajectoryGoalSuccessTimeoutError({})).toBeUndefined();
      expect(trajectoryGoalSuccessTimeoutError({ timeoutMs: 0 })).toBe(
        'trajectory:goal-success timeoutMs must be a finite positive number',
      );
      expect(trajectoryGoalSuccessTimeoutError({ timeoutMs: -5 })).toBe(
        'trajectory:goal-success timeoutMs must be a finite positive number',
      );
      expect(trajectoryGoalSuccessTimeoutError({ timeoutMs: 5000 })).toBeUndefined();
    });
  });

  describe('trajectoryRedactArgsError', () => {
    it('fails loud on a non-boolean toggle', () => {
      expect(trajectoryRedactArgsError({ redactArgsInFailures: 'true' })).toBe(
        'trajectory:tool-args-match assertion redactArgsInFailures must be a boolean',
      );
      expect(trajectoryRedactArgsError({})).toBeUndefined();
      expect(trajectoryRedactArgsError({ redactArgsInFailures: true })).toBeUndefined();
    });
  });

  describe('trajectoryToolSequenceModeError', () => {
    it('only allows in_order or exact when a mode is present', () => {
      expect(trajectoryToolSequenceModeError({})).toBeUndefined();
      expect(trajectoryToolSequenceModeError({ mode: 'in_order' })).toBeUndefined();
      expect(trajectoryToolSequenceModeError({ mode: 'exact' })).toBeUndefined();
      expect(trajectoryToolSequenceModeError({ mode: 'adjacent' })).toBe(
        'trajectory:tool-sequence assertion mode must be "in_order" or "exact"',
      );
    });
  });

  describe('trajectoryToolSetConfigError', () => {
    it('requires a non-empty tools array', () => {
      expect(trajectoryToolSetConfigError('search')).toBe(
        'trajectory:tool-set assertion must have an array value or an object with a tools array',
      );
      expect(trajectoryToolSetConfigError([])).toBe(
        'trajectory:tool-set assertion requires at least one expected tool',
      );
      expect(trajectoryToolSetConfigError({ tools: ['search'] })).toBeUndefined();
    });

    it('only allows subset or exact mode', () => {
      expect(trajectoryToolSetConfigError({ tools: ['search'], mode: 'ordered' })).toBe(
        'trajectory:tool-set assertion mode must be "subset" or "exact"',
      );
      expect(trajectoryToolSetConfigError({ tools: ['search'], mode: 'exact' })).toBeUndefined();
    });
  });
});
