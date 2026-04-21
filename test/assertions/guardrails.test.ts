import { describe, expect, it } from 'vitest';
import { handleGuardrails } from '../../src/assertions/guardrails';

import type { AssertionParams, AtomicTestCase } from '../../src/types/index';

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
    assertionValueContext: defaultContext,
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

  it('should default flagged to false when undefined', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        guardrails: {
          // flagged is intentionally undefined
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

  it('should pass with score 1 when no guardrails are present (defaults to flagged: false)', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
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

  it('should use custom reason when provided in guardrails', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      providerResponse: {
        guardrails: {
          flagged: true,
          reason: 'Custom safety violation reason',
        },
        output: 'test output',
      },
    };

    const result = await handleGuardrails(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Custom safety violation reason',
      assertion: baseAssertion,
    });
  });

  describe('inverse mode (not-guardrails)', () => {
    const inverseAssertion = {
      type: 'not-guardrails' as const,
    };

    it('should pass when content is flagged and inverse=true', async () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: inverseAssertion,
        inverse: true,
        providerResponse: {
          guardrails: {
            flagged: true,
            reason: 'Prompt injection detected',
          },
          output: 'test output',
        },
      };

      const result = await handleGuardrails(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Guardrail correctly blocked: Prompt injection detected',
        assertion: inverseAssertion,
      });
    });

    it('should fail when content is not flagged and inverse=true', async () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: inverseAssertion,
        inverse: true,
        providerResponse: {
          guardrails: {
            flagged: false,
          },
          output: 'test output',
        },
      };

      const result = await handleGuardrails(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Content was not blocked by guardrails (expected to be blocked)',
        assertion: inverseAssertion,
      });
    });

    it('should fail when no guardrails are present and inverse=true (defaults to flagged: false)', async () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: inverseAssertion,
        inverse: true,
        providerResponse: {
          output: 'test output',
        },
      };

      const result = await handleGuardrails(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Content was not blocked by guardrails (expected to be blocked)',
        assertion: inverseAssertion,
      });
    });

    it('should pass with specific message when input is flagged and inverse=true', async () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: inverseAssertion,
        inverse: true,
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
        pass: true,
        score: 1,
        reason: 'Guardrail correctly blocked: Prompt failed safety checks',
        assertion: inverseAssertion,
      });
    });
  });
});
