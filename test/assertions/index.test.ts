import { describe, expect, it } from 'vitest';
import { getAssertionBaseType, isAssertionInverse, runAssertion } from '../../src/assertions/index';
import { mockProcessEnv } from '../util/utils';

describe('isAssertionInverse', () => {
  it('returns true if the assertion is inverse', () => {
    const assertion = {
      type: 'not-equals' as const,
    };
    expect(isAssertionInverse(assertion)).toBe(true);
  });

  it('returns false if the assertion is not inverse', () => {
    const assertion = {
      type: 'equals' as const,
    };
    expect(isAssertionInverse(assertion)).toBe(false);
  });
});

describe('getAssertionBaseType', () => {
  it('returns the base type of the non-inverse assertion', () => {
    const assertion = {
      type: 'equals' as const,
    };
    expect(getAssertionBaseType(assertion)).toBe('equals');
  });

  it('returns the base type of the inverse assertion', () => {
    const assertion = {
      type: 'not-equals' as const,
    };
    expect(getAssertionBaseType(assertion)).toBe('equals');
  });
});

describe('locked template interpretation', () => {
  it('forces enabled templating even when the ambient environment disables it', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
    try {
      const result = await runAssertion({
        assertion: { type: 'equals', value: '{{expected}}' },
        disableTemplating: false,
        providerResponse: { output: 'Paris' },
        test: { vars: { expected: 'Paris' } },
      });

      expect(result.pass).toBe(true);
    } finally {
      restoreEnv();
    }
  });

  it('forces disabled templating even when the ambient environment enables it', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
    try {
      const result = await runAssertion({
        assertion: { type: 'equals', value: '{{expected}}' },
        disableTemplating: true,
        providerResponse: { output: '{{expected}}' },
        test: { vars: { expected: 'Paris' } },
      });

      expect(result.pass).toBe(true);
    } finally {
      restoreEnv();
    }
  });
});
