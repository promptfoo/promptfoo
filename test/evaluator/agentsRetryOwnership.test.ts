import { Agent, setTracingDisabled, tool } from '@openai/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runEval } from '../../src/evaluator';
import { callProviderWithContext } from '../../src/matchers/providers';
import { OpenAiAgentsProvider } from '../../src/providers/openai/agents';
import { PromptfooSimulatedUserProvider } from '../../src/providers/promptfoo';
import { SequenceProvider } from '../../src/providers/sequence';
import { SimulatedUser } from '../../src/providers/simulatedUser';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider } from '../../src/types/providers';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithProxy: vi.fn(),
}));

const response = {
  id: 'resp_fixture',
  object: 'response',
  created_at: 0,
  status: 'completed',
  model: 'gpt-4.1-mini',
  output: [
    {
      type: 'message',
      id: 'msg_fixture',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'recorded', annotations: [] }],
    },
  ],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
};

let restoreEnv: () => void;
let registry: RateLimitRegistry;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchWithProxy).mockReset();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected external request')));
  setTracingDisabled(true);
  restoreEnv = mockProcessEnv({
    PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: undefined,
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_CACHE_TYPE: 'memory',
    PROMPTFOO_CACHE_ENABLED: 'false',
  });
});

afterEach(() => {
  registry?.dispose();
  restoreEnv();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

function evaluateWithReplacement(provider: ApiProvider, replacement: ApiProvider) {
  registry = new RateLimitRegistry({ maxConcurrency: 1 });
  return runEval({
    provider,
    prompt: { raw: 'fixture', label: 'fixture' },
    test: { provider: replacement },
    delay: 0,
    promptIdx: 0,
    testIdx: 0,
    repeatIndex: 0,
    isRedteam: false,
    rateLimitRegistry: registry,
  });
}

// Stop when this call settles instead of draining the SDK's recurring tracing timers.
async function settleWithTimers<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await vi.waitFor(() => expect(settled).toBe(true));
  return promise;
}

describe('retry ownership through test-level providers', () => {
  it.each(
    [
      { schedulerDisabled: false, maxRetries: 1 },
      { schedulerDisabled: true, maxRetries: 1 },
      { schedulerDisabled: false, maxRetries: 0 },
    ].flatMap((settings) => ['sequence', 'simulated-user'].map((kind) => ({ ...settings, kind }))),
  )(
    'does not replay completed $kind tools ($schedulerDisabled, $maxRetries)',
    async ({ schedulerDisabled, maxRetries, kind }) => {
      mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: String(schedulerDisabled) });
      const execute = vi.fn(async () => 'recorded');
      const target = new OpenAiAgentsProvider('fixture', {
        config: {
          apiKey: 'synthetic-key',
          maxRetries,
          agent: new Agent({
            name: 'fixture',
            model: 'gpt-4.1-mini',
            tools: [
              tool({
                name: 'record',
                description: 'Increment a synthetic counter',
                parameters: z.object({}),
                execute,
              }),
            ],
          }),
        },
      });
      const replacement =
        kind === 'sequence'
          ? new SequenceProvider({ config: { inputs: ['record-first', 'fail-second'] } })
          : new SimulatedUser({
              config: { maxTurns: 1, initialMessages: [{ role: 'user', content: 'record-first' }] },
            });
      vi.spyOn(PromptfooSimulatedUserProvider.prototype, 'callApi').mockResolvedValue({
        output: 'fail-second',
      });
      vi.mocked(fetchWithProxy).mockImplementation(async (_url, options) => {
        const body = JSON.parse(options?.body as string);
        if (JSON.stringify(body.input).includes('fail-second')) {
          return Response.json(
            { error: { message: 'fixture too many requests; retry after 0' } },
            { status: 429, headers: { 'retry-after-ms': '1' } },
          );
        }
        return Response.json(
          body.input.some((item: { type: string }) => item.type === 'function_call_output')
            ? response
            : {
                ...response,
                output: [
                  {
                    type: 'function_call',
                    id: 'fc_fixture',
                    call_id: 'call_fixture',
                    name: 'record',
                    arguments: '{}',
                    status: 'completed',
                  },
                ],
              },
        );
      });
      const result = evaluateWithReplacement(target, replacement);
      await vi.waitFor(() => expect(fetchWithProxy).toHaveBeenCalled());
      await settleWithTimers(result);
      expect((await result)[0]).toMatchObject({
        success: false,
        error: expect.stringContaining('fixture too many requests'),
      });
      expect(execute).toHaveBeenCalledOnce();
      expect(fetchWithProxy).toHaveBeenCalledTimes(3 + maxRetries);
    },
  );

  it('keeps retries for an independent replacement of an unused Agents target', async () => {
    const target = new OpenAiAgentsProvider('fixture', { config: { apiKey: 'synthetic-key' } });
    const targetCall = vi.spyOn(target, 'callApi');
    const callApi = vi
      .fn<ApiProvider['callApi']>()
      .mockResolvedValueOnce({
        error: '429 retry after 0',
        metadata: {
          http: {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'retry-after-ms': '0' },
          },
        },
      })
      .mockResolvedValueOnce({ output: 'replacement succeeded' });
    const result = evaluateWithReplacement(target, { id: () => 'independent', callApi });
    await settleWithTimers(result);
    expect((await result)[0]).toMatchObject({
      success: true,
      response: { output: 'replacement succeeded' },
    });
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(targetCall).not.toHaveBeenCalled();
  });

  it.each(['sequence', 'simulated-user'])(
    'keeps scheduler retries for %s targets without internal retry ownership',
    async (kind) => {
      // Throw to retain the immediate retry hint through either wrapper's response shape.
      const callApi = vi
        .fn<ApiProvider['callApi']>()
        .mockRejectedValueOnce(new Error('429 retry after 0'))
        .mockResolvedValueOnce({ output: 'target succeeded' });
      const wrapper =
        kind === 'sequence'
          ? new SequenceProvider({ config: { inputs: ['fixture'] } })
          : new SimulatedUser({
              config: { maxTurns: 0, initialMessages: [{ role: 'user', content: 'fixture' }] },
            });
      const result = evaluateWithReplacement({ id: () => 'ordinary', callApi }, wrapper);
      await settleWithTimers(result);
      expect((await result)[0]).toMatchObject({
        success: true,
        response: { output: expect.stringContaining('target succeeded') },
      });
      expect(callApi).toHaveBeenCalledTimes(2);
    },
  );

  it.each(
    ['rate-limit', 'grading'].flatMap((path) =>
      [false, true].map((delegates) => ({ path, delegates })),
    ),
  )('the $path helper honors declared delegation ($delegates)', async ({ path, delegates }) => {
    const error = new Error('429 retry after 0');
    const target: ApiProvider = {
      id: () => 'internally-retried',
      handlesOwnRetries: true,
      callApi: vi.fn<ApiProvider['callApi']>().mockRejectedValue(error),
    };
    const replacement: ApiProvider = {
      id: () => 'independent',
      callApi: vi
        .fn<ApiProvider['callApi']>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ output: 'replacement succeeded' }),
    };
    registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const provider = delegates
      ? new SequenceProvider({ config: { inputs: ['fixture'] } })
      : replacement;
    const context = {
      originalProvider: target,
      vars: {},
      prompt: { raw: 'fixture', label: 'fixture' },
    };
    const result = (
      path === 'grading'
        ? withProviderCallExecutionContext({ rateLimitRegistry: registry }, () =>
            callProviderWithContext(provider, 'fixture', 'fixture', {}, context),
          )
        : wrapProviderWithRateLimiting(provider, registry).callApi('fixture', context)
    ).then(
      (value) => ({ value }),
      (failure: Error) => ({ error: failure }),
    );
    await settleWithTimers(result);
    if (delegates) {
      expect(await result).toEqual({ error });
      expect(target.callApi).toHaveBeenCalledOnce();
      expect(replacement.callApi).not.toHaveBeenCalled();
    } else {
      expect(await result).toEqual({ value: { output: 'replacement succeeded' } });
      expect(target.callApi).not.toHaveBeenCalled();
      expect(replacement.callApi).toHaveBeenCalledTimes(2);
    }
  });
});
