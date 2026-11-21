import {
  Agent,
  OpenAIProvider,
  setDefaultModelProvider,
  setTracingDisabled,
  Usage,
} from '@openai/agents';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiAgentsProvider } from '../../../src/providers/openai/agents';
import { createDeferred } from '../../util/utils';
import type { Model, ModelRequest, ModelResponse, StreamEvent } from '@openai/agents';

function scriptedModel(response: (request: ModelRequest) => Promise<ModelResponse>) {
  return {
    getResponse: vi.fn(response),
    async *getStreamedResponse(): AsyncIterable<StreamEvent> {
      throw new Error('This fixture uses non-streamed model responses');
    },
  } satisfies Model;
}

function reply(text: string): ModelResponse {
  return {
    usage: new Usage({
      requests: 1,
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
      inputTokensDetails: [{ cached_tokens: 2, nested: { ignored_tokens: 99 } }],
      outputTokensDetails: [{ reasoning_tokens: 1 }],
    }),
    output: [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text }],
      },
    ],
  };
}

describe('OpenAiAgentsProvider with the installed SDK', () => {
  beforeEach(() => {
    setTracingDisabled(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setTracingDisabled(false);
  });

  it.each(['gpt-6.2-astra', 'gpt-6.2-sol'])(
    'sends the %s override through the SDK Responses transport',
    async (model) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({
          id: 'resp_1',
          object: 'response',
          model,
          status: 'completed',
          output: [
            {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'Ready.', annotations: [] }],
            },
          ],
        }),
      );
      const client = new OpenAI({ apiKey: 'fixture', fetch });
      setDefaultModelProvider(new OpenAIProvider({ openAIClient: client }));
      try {
        const provider = new OpenAiAgentsProvider('fixture', {
          config: { agent: new Agent({ name: 'Fixture', model: 'gpt-5.6-luna' }), model },
        });
        expect((await provider.callApi('Say ready.')).output).toBe('Ready.');
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0];
        expect(String(url)).toMatch(/\/v1\/responses$/);
        const body = JSON.parse(init!.body as string);
        expect(body.model).toBe(model);
        expect([undefined, 'low', 'medium', 'high', 'xhigh', 'max']).toContain(
          body.reasoning?.effort,
        );
        expect(body.temperature).toBeUndefined();
      } finally {
        setDefaultModelProvider(new OpenAIProvider({ cacheResponsesWebSocketModels: false }));
      }
    },
  );

  it('preserves conversation history and numeric usage through the real runner and session', async () => {
    const model = scriptedModel(async () => reply('Remembered.'));
    const provider = new OpenAiAgentsProvider('session-fixture', {
      config: {
        agent: new Agent({ name: 'Session fixture', model }),
        session: { type: 'memory', sessionId: 'sdk-session' },
      },
    });

    const first = await provider.callApi('Remember the word cedar.');
    const second = await provider.callApi('What did I ask you to remember?');

    expect(first).toMatchObject({
      output: 'Remembered.',
      tokenUsage: {
        total: 10,
        prompt: 7,
        completion: 3,
        cached: 2,
        numRequests: 1,
        completionDetails: { reasoning: 1, cacheReadInputTokens: 2 },
      },
    });
    expect(second.output).toBe('Remembered.');
    expect(model.getResponse).toHaveBeenCalledTimes(2);
    const resumedInput = JSON.stringify(model.getResponse.mock.calls[1][0].input);
    expect(resumedInput).toContain('Remember the word cedar.');
    expect(resumedInput).toContain('Remembered.');
    expect(resumedInput).toContain('What did I ask you to remember?');
  });

  it('surfaces model failures instead of returning an output to score', async () => {
    const model = scriptedModel(async () => {
      throw new Error('Scripted model failure');
    });
    const provider = new OpenAiAgentsProvider('failure-fixture', {
      config: { agent: new Agent({ name: 'Failure fixture', model }) },
    });

    await expect(provider.callApi('Fail this request.')).rejects.toThrow('Scripted model failure');
    expect(model.getResponse).toHaveBeenCalledTimes(1);
  });

  it('propagates cancellation to an active real SDK model call', async () => {
    const started = createDeferred<void>();
    const model = scriptedModel(async ({ signal }) => {
      expect(signal).toBeDefined();
      started.resolve();
      return new Promise((_resolve, reject) => {
        signal!.addEventListener(
          'abort',
          () => reject(new DOMException('Model call aborted', 'AbortError')),
          { once: true },
        );
      });
    });
    const provider = new OpenAiAgentsProvider('abort-fixture', {
      config: { agent: new Agent({ name: 'Abort fixture', model }) },
    });
    const controller = new AbortController();
    const outcome = expect(
      provider.callApi('Wait until cancelled.', undefined, { abortSignal: controller.signal }),
    ).rejects.toThrow(/abort/i);
    await started.promise;
    controller.abort();
    await outcome;
    expect(model.getResponse).toHaveBeenCalledTimes(1);
  });
});
