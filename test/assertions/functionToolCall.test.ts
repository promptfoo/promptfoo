import { describe, expect, it } from 'vitest';
import { handleIsValidFunctionCall } from '../../src/assertions/functionToolCall';

import type { AssertionParams } from '../../src/types/index';

const validProvider = {
  id: () => 'test',
  callApi: async () => ({}),
  validateFunctionToolCall: () => {},
};
const invalidProvider = {
  id: () => 'test',
  callApi: async () => ({}),
  validateFunctionToolCall: () => {
    throw new Error('must have required property "location"');
  },
};
const noValidatorProvider = {
  id: () => 'test',
  callApi: async () => ({}),
};

function params(overrides: Partial<AssertionParams>): AssertionParams {
  return {
    assertion: { type: 'is-valid-function-call' },
    output: '{"name":"get_weather","arguments":"{}"}',
    provider: validProvider,
    test: { vars: {} },
    inverse: false,
    ...overrides,
  } as AssertionParams;
}

describe('handleIsValidFunctionCall', () => {
  it('passes for a valid function call', () => {
    const r = handleIsValidFunctionCall(params({ provider: validProvider as never }));
    expect(r.pass).toBe(true);
    expect(r.reason).toBe('Assertion passed');
  });

  it('fails for an invalid function call with the validation error', () => {
    const r = handleIsValidFunctionCall(params({ provider: invalidProvider as never }));
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('must have required property "location"');
  });

  it('fails when the provider cannot validate function calls', () => {
    const r = handleIsValidFunctionCall(params({ provider: noValidatorProvider as never }));
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('Provider does not have functionality for checking function call.');
  });

  describe('inverse (not-is-valid-function-call)', () => {
    it('fails when the output IS a valid function call', () => {
      const r = handleIsValidFunctionCall(
        params({
          provider: validProvider as never,
          assertion: { type: 'not-is-valid-function-call' },
          inverse: true,
        }),
      );
      expect(r.pass).toBe(false);
      expect(r.reason).toBe('Expected output to not be a valid function call, but it was');
    });

    it('passes when the output is NOT a valid function call', () => {
      const r = handleIsValidFunctionCall(
        params({
          provider: invalidProvider as never,
          assertion: { type: 'not-is-valid-function-call' },
          inverse: true,
        }),
      );
      expect(r.pass).toBe(true);
      expect(r.reason).toBe('Assertion passed');
    });
  });
});
