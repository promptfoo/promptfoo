import { describe, expect, it } from 'vitest';
import { normalizeScriptAssertionResult } from '../../src/assertions/scriptResultNormalization';

import type { Assertion } from '../../src/types/index';

const pythonAssertion: Assertion = { type: 'not-python', value: 'return True' };
const labels = { code: 'Python code', language: 'Python' };

describe('normalizeScriptAssertionResult', () => {
  it('preserves custom GradingResult reason when inverse turns a pass into a fail', () => {
    const result = normalizeScriptAssertionResult(
      pythonAssertion,
      {
        pass: true,
        score: 1,
        reason: 'Expected output not to contain "foo", but it did.',
      },
      true,
      labels,
    );

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('Expected output not to contain "foo", but it did.');
  });

  it('falls back to a generic outcome when an inverted GradingResult has no reason', () => {
    const result = normalizeScriptAssertionResult(
      pythonAssertion,
      {
        pass: true,
        score: 1,
        reason: undefined as unknown as string,
      },
      true,
      labels,
    );

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('Python code returned true');
  });
});
