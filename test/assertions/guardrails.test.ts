import { handleGuardrails } from '../../src/assertions/guardrails';
import type { AssertionParams, AtomicTestCase } from '../../src/types';

describe('handleGuardrail', () => {
  const baseAssertion = {
    type: 'guardrails' as const,
  };

  const defaultContext = {
    prompt: undefined,
    vars: {},
    test: {} as AtomicTestCase,
    logProbs: undefined,
    providerResponse: undefined,
    provider: undefined,
  };

  const defaultParams: AssertionParams = {
    assertion: baseAssertion,
    baseType: 'guardrails',
    context: defaultContext,
    inverse: false,
    output: '',
    outputString: '',
    test: {} as AtomicTestCase,
    providerResponse: {
      output: '',
    },
  };

  it('should pass when guardrails are not flagged', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        guardrails: {
          flagged: false,
        },
        output: 'test output',
      },
    };

    const result = await handleGuardrails(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Content passed safety checks',
      assertion: baseAssertion,
    });
  });

  it('should fail when content is flagged', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        guardrails: {
          flagged: true,
        },
        output: 'test output',
      },
    };

    const result = await handleGuardrails(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Content failed safety checks',
      assertion: baseAssertion,
    });
  });

  it('should fail with specific reason when input is flagged', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        guardrails: {
          flagged: true,
          flaggedInput: true,
        },
        output: 'test output',
      },
    };

    const result = await handleGuardrails(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Prompt failed safety checks',
      assertion: baseAssertion,
    });
  });

  it('should fail with specific reason when output is flagged', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        guardrails: {
          flagged: true,
          flaggedOutput: true,
        },
        output: 'test output',
      },
    };

    const result = await handleGuardrails(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Output failed safety checks',
      assertion: baseAssertion,
    });
  });

  it('should handle case when guardrails are in redteam history', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        metadata: {
          redteamHistory: [
            {
              guardrails: {
                flagged: true,
              },
            },
          ],
        },
        output: 'test output',
      },
    };

    const result = await handleGuardrails(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Content failed safety checks',
      assertion: baseAssertion,
    });
  });

  it('should pass with score 0 when no guardrails are present', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        output: 'test output',
      },
    };

    const result = await handleGuardrails(params);
    expect(result).toEqual({
      pass: true,
      score: 0,
      reason: 'Guardrail was not applied',
      assertion: baseAssertion,
    });
  });
});
