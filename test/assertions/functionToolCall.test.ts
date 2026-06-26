import { describe, expect, it } from 'vitest';
import { handleIsValidFunctionCall } from '../../src/assertions/functionToolCall';
import { runAssertion, runAssertions } from '../../src/assertions/index';
import { FunctionToolCallValidationSetupError } from '../../src/contracts';

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
const setupErrorProvider = {
  id: () => 'test',
  callApi: async () => ({}),
  validateFunctionToolCall: () => {
    throw new FunctionToolCallValidationSetupError('validator schema unavailable');
  },
};
const asyncValidProvider = {
  ...validProvider,
  validateFunctionToolCall: async () => {
    await Promise.resolve();
  },
};
const asyncInvalidProvider = {
  ...validProvider,
  validateFunctionToolCall: async () => {
    await Promise.resolve();
    throw new Error('async invalid call');
  },
};
const asyncSetupErrorProvider = {
  ...validProvider,
  validateFunctionToolCall: async () => {
    await Promise.resolve();
    throw new FunctionToolCallValidationSetupError('async schema unavailable');
  },
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
  it('passes for a valid function call', async () => {
    const r = await handleIsValidFunctionCall(params({ provider: validProvider as never }));
    expect(r.pass).toBe(true);
    expect(r.reason).toBe('Assertion passed');
  });

  it('fails for an invalid function call with the validation error', async () => {
    const r = await handleIsValidFunctionCall(params({ provider: invalidProvider as never }));
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('must have required property "location"');
  });

  it('fails when the provider cannot validate function calls', async () => {
    const r = await handleIsValidFunctionCall(params({ provider: noValidatorProvider as never }));
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('Provider does not have functionality for checking function call.');
  });

  it('awaits asynchronous custom validators through the dispatcher', async () => {
    const [valid, invalid, inverseInvalid] = await Promise.all([
      runAssertion({
        assertion: { type: 'is-valid-function-call' },
        provider: asyncValidProvider as ApiProvider,
        prompt: 'test prompt',
        providerResponse: { output: '{}' },
        test: { vars: {} },
      }),
      runAssertion({
        assertion: { type: 'is-valid-function-call' },
        provider: asyncInvalidProvider as ApiProvider,
        prompt: 'test prompt',
        providerResponse: { output: '{}' },
        test: { vars: {} },
      }),
      runAssertion({
        assertion: { type: 'not-is-valid-function-call' },
        provider: asyncInvalidProvider as ApiProvider,
        prompt: 'test prompt',
        providerResponse: { output: '{}' },
        test: { vars: {} },
      }),
    ]);

    expect(valid).toMatchObject({ pass: true, score: 1 });
    expect(invalid).toMatchObject({ pass: false, score: 0, reason: 'async invalid call' });
    expect(inverseInvalid).toMatchObject({ pass: true, score: 1 });
  });

  it.each([
    'is-valid-function-call',
    'not-is-valid-function-call',
  ] as const)('%s does not invert an asynchronous setup error', async (type) => {
    const result = await runAssertion({
      assertion: { type },
      provider: asyncSetupErrorProvider as ApiProvider,
      prompt: 'test prompt',
      providerResponse: { output: '{}' },
      test: { vars: {} },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'async schema unavailable',
    });
  });

  it.each([
    ['a string rejection', () => Promise.reject('invalid call'), 'invalid call'],
    [
      'an empty Error',
      () => Promise.reject(Object.assign(new Error('placeholder'), { message: '' })),
      'Function call validation failed',
    ],
    [
      'an error-like object',
      () => Promise.reject({ message: 'object invalid call' }),
      'object invalid call',
    ],
    [
      'an uncoercible object',
      () => Promise.reject(Object.create(null)),
      'Function call validation failed',
    ],
  ])('keeps %s as a failed aggregate', async (_name, validateFunctionToolCall, reason) => {
    const provider = {
      ...validProvider,
      validateFunctionToolCall,
    } as ApiProvider;
    const result = await runAssertions({
      prompt: 'test prompt',
      provider,
      providerResponse: { output: '{}' },
      test: {
        vars: {},
        assert: [{ type: 'is-valid-function-call' }],
      },
    });

    expect(result).toMatchObject({ pass: false, score: 0, reason });
    expect(result.componentResults?.[0]).toMatchObject({ pass: false, score: 0, reason });
  });

  it.each([
    ['is-valid-function-call', false],
    ['not-is-valid-function-call', true],
  ] as const)('handles hostile validator errors for %s', async (type, expectedPass) => {
    const provider = {
      ...validProvider,
      validateFunctionToolCall: () => {
        throw {
          name: 'ValidationError',
          message: 'ordinary invalid call',
          get code() {
            throw new Error('code getter exploded');
          },
        };
      },
    } as ApiProvider;

    const result = await runAssertions({
      prompt: 'test prompt',
      provider,
      providerResponse: { output: '{}' },
      test: { vars: {}, assert: [{ type }] },
    });

    expect(result).toMatchObject({
      pass: expectedPass,
      score: expectedPass ? 1 : 0,
    });
    expect(result.componentResults?.[0]).toMatchObject({
      pass: expectedPass,
      score: expectedPass ? 1 : 0,
      reason: expectedPass ? 'Assertion passed' : 'ordinary invalid call',
    });
  });

  it.each([
    'is-valid-function-call',
    'is-valid-openai-function-call',
    'not-is-valid-function-call',
    'not-is-valid-openai-function-call',
  ] as const)('%s does not invert an empty-message setup error', async (type) => {
    const provider = {
      ...validProvider,
      validateFunctionToolCall: async () => {
        return Promise.reject({
          code: 'FUNCTION_TOOL_CALL_VALIDATION_SETUP_ERROR',
          name: 'FunctionToolCallValidationSetupError',
          message: '',
        });
      },
    } as ApiProvider;
    const result = await runAssertions({
      prompt: 'test prompt',
      provider,
      providerResponse: { output: '{}' },
      test: { vars: {}, assert: [{ type }] },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'Function call validation failed',
    });
    expect(result.componentResults?.[0]).toMatchObject({ pass: false, score: 0 });
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

    it.each([
      'not-is-valid-function-call',
      'not-is-valid-openai-function-call',
    ] as const)('%s does not invert a validator setup error', async (type) => {
      const r = await runInverse(type, setupErrorProvider as ApiProvider);

      expect(r).toMatchObject({
        pass: false,
        score: 0,
        reason: 'validator schema unavailable',
      });
    });
  });
});
