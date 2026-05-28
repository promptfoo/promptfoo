import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleTokensUsed } from '../../src/assertions/tokensUsed';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AtomicTestCase } from '../../src/types/index';
import type { TraceData } from '../../src/types/tracing';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

afterEach(() => {
  vi.resetAllMocks();
});

const traceWithTokens: TraceData = {
  traceId: 't',
  evaluationId: 'e',
  testCaseId: 'tc',
  metadata: {},
  spans: [
    {
      spanId: 's1',
      name: 'llm.completion',
      startTime: 0,
      endTime: 100,
      attributes: {
        'gen_ai.usage.input_tokens': 200,
        'gen_ai.usage.output_tokens': 50,
      },
    },
    {
      spanId: 's2',
      name: 'llm.completion',
      startTime: 200,
      endTime: 250,
      attributes: {
        'gen_ai.usage.input_tokens': 80,
        'gen_ai.usage.output_tokens': 20,
      },
    },
  ],
};

const baseParams: AssertionParams = {
  baseType: 'tokens-used',
  assertion: { type: 'tokens-used', value: { max: 1000 } },
  renderedValue: { max: 1000 },
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'p',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'o' },
  },
  output: 'o',
  outputString: 'o',
  providerResponse: {
    output: 'o',
    tokenUsage: { total: 350, prompt: 280, completion: 70 },
  },
  test: {} as AtomicTestCase,
  inverse: false,
};

describe('handleTokensUsed', () => {
  it('passes when total tokens from trace are within max budget', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 1000 } },
      renderedValue: { max: 1000 },
      assertionValueContext: { ...baseParams.assertionValueContext, trace: traceWithTokens },
    };
    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    // 200+50+80+20 = 350 from trace
    expect(result.reason).toContain('Tokens used: 350');
    expect(result.reason).toContain('source=trace');
  });

  it('fails when total tokens exceed the max budget', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 100 } },
      renderedValue: { max: 100 },
      assertionValueContext: { ...baseParams.assertionValueContext, trace: traceWithTokens },
    };
    const result = handleTokensUsed(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Tokens used: 350');
    expect(result.reason).toContain('expected at most 100');
  });

  it('prefers aggregate totals instead of double counting component token attributes', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 400 } },
      renderedValue: { max: 400 },
      assertionValueContext: {
        ...baseParams.assertionValueContext,
        trace: {
          ...traceWithTokens,
          spans: [
            {
              spanId: 's1',
              name: 'llm.completion',
              startTime: 0,
              endTime: 100,
              attributes: {
                'gen_ai.usage.input_tokens': 200,
                'gen_ai.usage.output_tokens': 50,
                'gen_ai.usage.total_tokens': 250,
              },
            },
          ],
        },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 250');
  });

  it('avoids double counting nested trace spans that repeat token totals', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 250, source: 'trace' } },
      renderedValue: { max: 250, source: 'trace' },
      assertionValueContext: {
        ...baseParams.assertionValueContext,
        trace: {
          ...traceWithTokens,
          spans: [
            {
              spanId: 'parent',
              name: 'llm.completion',
              startTime: 0,
              endTime: 100,
              attributes: { 'gen_ai.usage.total_tokens': 250 },
            },
            {
              spanId: 'child',
              parentSpanId: 'parent',
              name: 'llm.completion',
              startTime: 10,
              endTime: 90,
              attributes: { 'gen_ai.usage.total_tokens': 250 },
            },
          ],
        },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 250');
  });

  it('keeps a matched aggregate parent when its token total exceeds descendants', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 299, source: 'trace' } },
      renderedValue: { max: 299, source: 'trace' },
      assertionValueContext: {
        ...baseParams.assertionValueContext,
        trace: {
          ...traceWithTokens,
          spans: [
            {
              spanId: 'parent',
              name: 'agent.run',
              startTime: 0,
              endTime: 100,
              attributes: { 'gen_ai.usage.total_tokens': 300 },
            },
            {
              spanId: 'child',
              parentSpanId: 'parent',
              name: 'llm.completion',
              startTime: 10,
              endTime: 90,
              attributes: { 'gen_ai.usage.total_tokens': 100 },
            },
          ],
        },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Tokens used: 300');
  });

  it('falls back to providerResponse.tokenUsage when no trace is present', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 500 } },
      renderedValue: { max: 500 },
    };
    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 350');
    expect(result.reason).toContain('source=response');
  });

  it('throws when source: response has no provider token usage', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 500, source: 'response' } },
      renderedValue: { max: 500, source: 'response' },
      providerResponse: { output: 'o' },
    };

    expect(() => handleTokensUsed(params)).toThrow(
      /No token usage data available for tokens-used assertion from provider response/,
    );
  });

  it('throws when source: auto has neither trace spans nor provider token usage', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 500 } },
      renderedValue: { max: 500 },
      providerResponse: { output: 'o' },
    };

    expect(() => handleTokensUsed(params)).toThrow(
      /No token usage data available for tokens-used assertion from provider response/,
    );
  });

  it('treats explicit zero provider usage as zero tokens', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 0, source: 'response' } },
      renderedValue: { max: 0, source: 'response' },
      providerResponse: {
        output: 'o',
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 0');
    expect(result.reason).toContain('source=response');
  });

  it('falls back to provider token components when response total is zero', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 49, source: 'response' } },
      renderedValue: { max: 49, source: 'response' },
      providerResponse: {
        output: 'o',
        tokenUsage: { total: 0, prompt: 30, completion: 20 },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Tokens used: 50');
  });

  it('uses provider token components when a positive response total is incomplete', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 150, source: 'response' } },
      renderedValue: { max: 150, source: 'response' },
      providerResponse: {
        output: 'o',
        tokenUsage: { total: 100, prompt: 100, completion: 100 },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Tokens used: 200');
  });

  it('falls back to providerResponse.tokenUsage when trace data has no spans', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 100 } },
      renderedValue: { max: 100 },
      assertionValueContext: {
        ...baseParams.assertionValueContext,
        trace: {
          ...traceWithTokens,
          spans: [],
        },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Tokens used: 350');
    expect(result.reason).toContain('source=response');
  });

  it('falls back to response usage when an unfiltered automatic trace has no token attributes', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 100 } },
      renderedValue: { max: 100 },
      assertionValueContext: {
        ...baseParams.assertionValueContext,
        trace: {
          ...traceWithTokens,
          spans: [
            {
              spanId: 'non-token-span',
              name: 'provider.call',
              startTime: 0,
              endTime: 100,
              attributes: { 'gen_ai.usage.total_tokens': null, 'provider.name': 'mock' },
            },
          ],
        },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Tokens used: 350');
    expect(result.reason).toContain('source=response');
  });

  it('honors explicit zero token attributes in an automatic trace', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 0 } },
      renderedValue: { max: 0 },
      assertionValueContext: {
        ...baseParams.assertionValueContext,
        trace: {
          ...traceWithTokens,
          spans: [
            {
              spanId: 'zero-token-span',
              name: 'llm.completion',
              startTime: 0,
              endTime: 100,
              attributes: { 'gen_ai.usage.total_tokens': 0 },
            },
          ],
        },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 0');
    expect(result.reason).toContain('source=trace');
  });

  it('throws when source: trace and no trace is available', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 1000, source: 'trace' } },
      renderedValue: { max: 1000, source: 'trace' },
    };
    expect(() => handleTokensUsed(params)).toThrow(/No trace data available/);
  });

  it('treats source: trace with an empty trace as zero tokens', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 0, source: 'trace' } },
      renderedValue: { max: 0, source: 'trace' },
      assertionValueContext: {
        ...baseParams.assertionValueContext,
        trace: {
          ...traceWithTokens,
          spans: [],
        },
      },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 0');
    expect(result.reason).toContain('source=trace');
  });

  it('inverts the result for not-tokens-used (over budget passes)', () => {
    const params: AssertionParams = {
      ...baseParams,
      inverse: true,
      assertion: { type: 'not-tokens-used', value: { max: 100 } },
      renderedValue: { max: 100 },
      assertionValueContext: { ...baseParams.assertionValueContext, trace: traceWithTokens },
    };
    const result = handleTokensUsed(params);
    // Base assertion fails (350 > 100), inverse passes.
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('inverse assertion passes');
  });

  it('rejects values without min or max', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { pattern: '*' } as unknown as { max: number } },
      renderedValue: { pattern: '*' } as unknown as { max: number },
    };
    expect(() => handleTokensUsed(params)).toThrow(/must include min or max/);
  });

  it.each([
    ['a negative maximum', { max: -1 }, 'tokens-used max must be a finite non-negative number'],
    [
      'a non-numeric maximum',
      { max: '100' },
      'tokens-used max must be a finite non-negative number',
    ],
    [
      'an infinite minimum',
      { min: Number.POSITIVE_INFINITY },
      'tokens-used min must be a finite non-negative number',
    ],
    [
      'an inverted range',
      { min: 101, max: 100 },
      'tokens-used min must be less than or equal to max',
    ],
  ])('rejects %s budget configuration', (_description, renderedValue, expectedMessage) => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: {
        type: 'tokens-used',
        value: renderedValue as unknown as { max: number },
      },
      renderedValue: renderedValue as unknown as { max: number },
    };

    expect(() => handleTokensUsed(params)).toThrow(expectedMessage);
  });

  it('rejects invalid source and pattern configuration instead of defaulting behavior', () => {
    const invalidSourceParams: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 1000 } },
      renderedValue: { max: 1000, source: '' } as unknown as { max: number },
    };
    const invalidPatternParams: AssertionParams = {
      ...baseParams,
      assertion: { type: 'tokens-used', value: { max: 1000 } },
      renderedValue: { max: 1000, pattern: 123 } as unknown as { max: number },
    };

    expect(() => handleTokensUsed(invalidSourceParams)).toThrow(
      'tokens-used source must be "trace", "response", or "auto"',
    );
    expect(() => handleTokensUsed(invalidPatternParams)).toThrow(
      'tokens-used pattern must be a string',
    );
  });

  it('respects the pattern filter when computing tokens from trace', () => {
    const filteredTrace: TraceData = {
      ...traceWithTokens,
      spans: [
        ...traceWithTokens.spans,
        {
          spanId: 's3',
          name: 'embeddings',
          startTime: 300,
          endTime: 320,
          attributes: { 'gen_ai.usage.input_tokens': 9999 },
        },
      ],
    };
    const params: AssertionParams = {
      ...baseParams,
      assertion: {
        type: 'tokens-used',
        value: { pattern: 'llm.*', max: 1000, source: 'trace' },
      },
      renderedValue: { pattern: 'llm.*', max: 1000, source: 'trace' },
      assertionValueContext: { ...baseParams.assertionValueContext, trace: filteredTrace },
    };
    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 350');
  });

  it('keeps source:auto on trace when a filtered trace contributes zero tokens', () => {
    const params: AssertionParams = {
      ...baseParams,
      assertion: {
        type: 'tokens-used',
        value: { pattern: 'embeddings', max: 0 },
      },
      renderedValue: { pattern: 'embeddings', max: 0 },
      assertionValueContext: { ...baseParams.assertionValueContext, trace: traceWithTokens },
    };

    const result = handleTokensUsed(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Tokens used: 0');
    expect(result.reason).toContain('source=trace');
  });
});
