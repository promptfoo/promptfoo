import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import { evaluate } from '../../src/node/evaluate';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

import type {
  Assertion,
  AssertionOrSet,
  RateLimitRegistryRef,
  RunEvalOptions,
} from '../../src/types/index';

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const apiBaseUrl = 'https://perplexity-fixture.example/v1';
const mockFetch = vi.fn<typeof fetch>();
const assertionCases: Assertion[] = [
  { type: 'perplexity', threshold: 1.5 },
  { type: 'perplexity-score', threshold: 0.4 },
  { type: 'not-perplexity', threshold: 1 },
  { type: 'not-perplexity-score', threshold: 0.5 },
];

function createProvider(passthrough?: Record<string, unknown>) {
  return new OpenAiChatCompletionProvider('gpt-4o', {
    config: { apiBaseUrl, apiKey: 'fixture-key', maxRetries: 0, passthrough },
  });
}

function getRequestBody() {
  expect(mockFetch).toHaveBeenCalledOnce();
  return JSON.parse(String(mockFetch.mock.calls[0][1]?.body));
}

async function runSingle(
  assertions: AssertionOrSet[] = [],
  options: Partial<RunEvalOptions> = {},
  provider = createProvider(),
) {
  const results = await withCacheEnabled(false, () =>
    runEval({
      provider,
      prompt: { raw: 'Say hello', label: 'Say hello' },
      test: { assert: assertions },
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      ...options,
    }),
  );
  return results[0];
}

describe('perplexity provider request options', () => {
  beforeEach(() => {
    mockFetch.mockReset().mockImplementation(async (url, options) => {
      expect(url).toBe(`${apiBaseUrl}/chat/completions`);
      const body = JSON.parse(String(options?.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
              logprobs:
                body.logprobs === true ? { content: [{ token: 'Hello', logprob: -0.1 }] } : null,
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining-requests': '99',
          },
        },
      );
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe.each([false, true])('public evaluation with nested assertions: %s', (nested) => {
    it.each(assertionCases)(
      'requests and grades log probabilities for $type',
      async (assertion) => {
        const assertions: AssertionOrSet[] = nested
          ? [{ type: 'assert-set', assert: [assertion] }]
          : [assertion];
        const evaluation = await evaluate(
          {
            prompts: ['Say hello'],
            providers: [
              {
                id: 'openai:chat:gpt-4o',
                config: { apiBaseUrl, apiKey: 'fixture-key', maxRetries: 0 },
              },
            ],
            tests: [{ assert: assertions }],
            writeLatestResults: false,
            sharing: false,
          },
          { cache: false, maxConcurrency: 1 },
        );
        const summary = await evaluation.toEvaluateSummary();

        expect(getRequestBody().logprobs).toBe(true);
        expect(summary.results).toHaveLength(1);
        expect(summary.results[0]).toMatchObject({
          success: true,
          response: { output: 'Hello', logProbs: [-0.1] },
        });
      },
    );
  });

  it.each<{ assertions: AssertionOrSet[] }>([
    { assertions: [] },
    { assertions: [{ type: 'contains', value: 'Hello' }] },
    { assertions: [{ type: 'assert-set', assert: [{ type: 'contains', value: 'Hello' }] }] },
  ])(
    'leaves options absent when unrelated assertions need no options: $assertions',
    async ({ assertions }) => {
      const provider = createProvider();
      const callApi = vi.spyOn(provider, 'callApi');
      const result = await runSingle(assertions, {}, provider);

      expect(result.success).toBe(true);
      expect(getRequestBody()).not.toHaveProperty('logprobs');
      expect(callApi.mock.calls[0][2]).toBeUndefined();
    },
  );

  it('preserves cancellation and response-header callbacks when requesting log probabilities', async () => {
    const controller = new AbortController();
    const onResponseHeaders = vi.fn();
    const registry: RateLimitRegistryRef = {
      execute: async (_provider, call) => call(onResponseHeaders),
      dispose: vi.fn(),
    };
    const provider = createProvider();
    const callApi = vi.spyOn(provider, 'callApi');
    const result = await runSingle(
      [assertionCases[0]],
      { abortSignal: controller.signal, rateLimitRegistry: registry },
      provider,
    );

    expect(result.success).toBe(true);
    expect(getRequestBody().logprobs).toBe(true);
    expect(callApi.mock.calls[0][2]).toEqual({
      includeLogProbs: true,
      abortSignal: controller.signal,
      onResponseHeaders,
    });
    expect(onResponseHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ 'x-ratelimit-remaining-requests': '99' }),
    );
    expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });

  it('preserves an explicit passthrough override', async () => {
    const result = await runSingle([assertionCases[0]], {}, createProvider({ logprobs: false }));

    expect(getRequestBody().logprobs).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('do not return logProbs');
  });
});
