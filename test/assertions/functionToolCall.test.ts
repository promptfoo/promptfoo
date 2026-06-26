import { describe, expect, it } from 'vitest';
import { handleIsValidFunctionCall } from '../../src/assertions/functionToolCall';
import { runAssertion } from '../../src/assertions/index';

import type { ApiProvider, AssertionParams, AssertionType } from '../../src/types/index';

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

async function runInverse(type: AssertionType, provider: ApiProvider) {
  return runAssertion({
    assertion: { type },
    provider,
    prompt: 'test prompt',
    providerResponse: { output: '{"name":"get_weather","arguments":"{}"}' },
    test: { vars: {} },
  });
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
    it.each([
      'not-is-valid-function-call',
      'not-is-valid-openai-function-call',
    ] as const)('%s fails when the output IS a valid function call', async (type) => {
      const r = await runInverse(type, validProvider as ApiProvider);

      expect(r.pass).toBe(false);
      expect(r.score).toBe(0);
      expect(r.reason).toBe('Expected output to not be a valid function call, but it was');
    });

    it.each([
      'not-is-valid-function-call',
      'not-is-valid-openai-function-call',
    ] as const)('%s passes when the output is NOT a valid function call', async (type) => {
      const r = await runInverse(type, invalidProvider as ApiProvider);

      expect(r.pass).toBe(true);
      expect(r.score).toBe(1);
      expect(r.reason).toBe('Assertion passed');
    });

    it.each([
      'not-is-valid-function-call',
      'not-is-valid-openai-function-call',
    ] as const)('%s fails when the provider cannot validate function calls', async (type) => {
      const r = await runInverse(type, noValidatorProvider as ApiProvider);

      expect(r.pass).toBe(false);
      expect(r.score).toBe(0);
      expect(r.reason).toBe('Provider does not have functionality for checking function call.');
    });
  });
});
