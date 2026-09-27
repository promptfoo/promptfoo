import fs from 'fs/promises';

import { streamText } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheEnabled } from '../../src/cache';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { HeliconeGatewayProvider } from '../../src/providers/helicone';
import { HttpProvider } from '../../src/providers/http';
import { N8nProvider } from '../../src/providers/n8n';
import { OpenAiAssistantProvider } from '../../src/providers/openai/assistant';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiImageProvider } from '../../src/providers/openai/image';
import { OpenAiResponsesProvider } from '../../src/providers/openai/responses';
import { OpenAiTranscriptionProvider } from '../../src/providers/openai/transcription';
import { OpenAiTtsProvider } from '../../src/providers/openai/tts';
import { TrueFoundryProvider } from '../../src/providers/truefoundry';
import { VercelAiProvider } from '../../src/providers/vercel';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: vi.fn(),
}));

const failed = { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } };
const chatSuccess = { choices: [{ finish_reason: 'stop', message: { content: 'recovered' } }] };
const responseSuccess = {
  id: 'resp_fixture',
  status: 'completed',
  output: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'recovered' }] },
  ],
};

describe('scheduler recovery outside provider transport retries', () => {
  let registry: RateLimitRegistry;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(streamText).mockReset();
    registry = new RateLimitRegistry({ maxConcurrency: 4 });
  });
  afterEach(() => {
    registry.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function invoke(provider: ApiProvider, prompt = 'hello', cached = false) {
    const pending = withCacheEnabled(cached, () =>
      wrapProviderWithRateLimiting(provider, registry).callApi(prompt, {
        vars: {},
        prompt: { raw: prompt, label: 'fixture' },
      }),
    ).catch((error: Error): ProviderResponse => ({ error: error.message }));
    await vi.dynamicImportSettled();
    await vi.runAllTimersAsync();
    return pending;
  }

  const parsedProviders = [
    [
      'native chat',
      (config: any) => new OpenAiChatCompletionProvider('gpt-4o-mini', { config }),
      chatSuccess,
    ],
    [
      'completion',
      (config: any) => new OpenAiCompletionProvider('gpt-3.5-turbo-instruct', { config }),
      { choices: [{ text: 'recovered' }] },
    ],
    [
      'image',
      (config: any) => new OpenAiImageProvider('dall-e-3', { config }),
      { data: [{ url: 'https://image.fixture.test/recovered.png' }] },
    ],
    [
      'Responses',
      (config: any) => new OpenAiResponsesProvider('gpt-4o-mini', { config }),
      responseSuccess,
    ],
    [
      'Helicone',
      (config: any) => new HeliconeGatewayProvider('gpt-4o-mini', { config }),
      chatSuccess,
    ],
    [
      'TrueFoundry',
      (config: any) => new TrueFoundryProvider('gpt-4o-mini', { config }),
      chatSuccess,
    ],
  ] as const;
  describe.each(parsedProviders)('%s successful-HTTP error bodies', (_name, create, success) => {
    it.each([0, 1, 3])('preserves maxRetries=%i after an embedded throttle', async (maxRetries) => {
      const fetch = vi
        .fn()
        .mockImplementation(async () =>
          Response.json(fetch.mock.calls.length <= maxRetries ? failed : success),
        );
      vi.stubGlobal('fetch', fetch);
      const result = await invoke(create({ apiKey: 'fixture', maxRetries }));
      expect(result.error).toBeUndefined();
      expect(result.output).toContain('recovered');
      expect(fetch).toHaveBeenCalledTimes(maxRetries + 1);
    });
  });

  it('recovers transcription after an embedded throttle', async () => {
    const audioPath = '/fixture/input.wav';
    vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('fixture'));
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        Response.json(fetch.mock.calls.length === 1 ? failed : { text: 'recovered' }),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new OpenAiTranscriptionProvider('whisper-1', {
        config: { apiKey: 'fixture', maxRetries: 1 },
      }),
      audioPath,
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('recovers native Responses SSE errors after headers succeeded', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            fetch.mock.calls.length === 1
              ? `event: error\ndata: ${JSON.stringify({ type: 'error', message: 'Rate limit exceeded' })}\n\n`
              : `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: responseSuccess })}\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new OpenAiResponsesProvider('gpt-4o-mini', {
        config: { apiKey: 'fixture', stream: true, maxRetries: 1 },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('recovers a terminal failed Responses envelope', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        Response.json(
          fetch.mock.calls.length === 1
            ? { id: 'resp_fixture', status: 'failed', output: [], ...failed }
            : responseSuccess,
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new OpenAiResponsesProvider('gpt-4o-mini', { config: { apiKey: 'fixture', maxRetries: 1 } }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('recovers a failed Assistant run after successful polling', async () => {
    let runs = 0;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith('/threads/runs')) {
        runs++;
      }
      if (url.pathname.endsWith('/steps')) {
        return Response.json({ data: [] });
      }
      return Response.json({
        id: 'run_fixture',
        thread_id: 'thread_fixture',
        status: runs === 1 ? 'failed' : 'completed',
        last_error: failed.error,
      });
    });
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new OpenAiAssistantProvider('asst_fixture', { config: { apiKey: 'fixture', maxRetries: 1 } }),
    );
    expect(result.error).toBeUndefined();
    expect(runs).toBe(2);
  });

  it('recovers Anthropic finalMessage failures after stream creation', async () => {
    const config = { apiKey: 'fixture', stream: true, maxRetries: 1 };
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', { config });
    const stream = vi.spyOn(provider.anthropic.messages, 'stream').mockImplementation(
      () =>
        ({
          finalMessage: async () => {
            if (stream.mock.calls.length === 1) {
              throw new Error('Rate limit exceeded');
            }
            return {
              content: [{ type: 'text', text: 'recovered' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
            };
          },
        }) as any,
    );
    const result = await invoke(provider);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it('recovers Vercel errors emitted by an established stream', async () => {
    let calls = 0;
    vi.mocked(streamText).mockImplementation(() => {
      const current = ++calls;
      return {
        fullStream: (async function* () {
          if (current === 1) {
            yield { type: 'error', error: new Error('Rate limit exceeded') };
          } else {
            yield { type: 'text-delta', text: 'recovered' };
          }
        })(),
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
        finishReason: Promise.resolve('stop'),
      } as any;
    });
    const result = await invoke(
      new VercelAiProvider('openai/gpt-4o', {
        config: { apiKey: 'fixture', streaming: true, maxRetries: 1 },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('recovers Bedrock Agent event-stream failures after a trace event', async () => {
    const config = {
      agentId: 'agent-fixture',
      agentAliasId: 'alias-fixture',
      region: 'us-east-1',
      maxRetries: 1,
    };
    const provider = new AwsBedrockAgentsProvider('agent-fixture', { config });
    const send = vi.fn().mockImplementation(async () => {
      const current = send.mock.calls.length;
      return {
        completion: (async function* () {
          yield { trace: { trace: {} } };
          if (current === 1) {
            throw Object.assign(new Error('Rate limit exceeded'), { name: 'ThrottlingException' });
          }
          yield { chunk: { bytes: Buffer.from('recovered') } };
        })(),
      };
    });
    vi.spyOn(provider as any, 'getAgentRuntimeClient').mockResolvedValue({ send });
    const result = await invoke(provider);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each(['GET', 'PUT', 'get'])('does not replay n8n %s embedded errors', async (method) => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        Response.json(fetch.mock.calls.length === 1 ? failed : { output: 'recovered' }),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new N8nProvider('https://retry.fixture.test/n8n', { config: { method, maxRetries: 1 } }),
    );
    expect(result.error).toContain('Rate limit exceeded');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(['GET', 'PUT', 'POST', 'PATCH', 'get'])(
    'does not replay n8n %s after a response body stream failure',
    async (method) => {
      const fetch = vi.fn().mockImplementation(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error('ECONNRESET during body read'));
              },
            }),
            { status: 200 },
          ),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await invoke(
        new N8nProvider('https://retry.fixture.test/n8n', { config: { method, maxRetries: 3 } }),
      );
      expect(result.error).toContain('ECONNRESET during body read');
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('preserves a TTS throttle reported in a non-429 error body', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        fetch.mock.calls.length === 1
          ? Response.json(failed, { status: 400 })
          : new Response('audio'),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new OpenAiTtsProvider('tts-1', { config: { apiKey: 'fixture', maxRetries: 1 } }),
    );
    expect(result.error).toBeUndefined();
    expect(result.audio?.data).toBe(Buffer.from('audio').toString('base64'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves HTTP cache-read recovery before the transport is entered', async () => {
    const cache = getCache();
    const read = vi
      .spyOn(cache, 'get')
      .mockRejectedValueOnce(new Error('cache network unavailable'))
      .mockResolvedValue(undefined);
    vi.spyOn(cache, 'set').mockResolvedValue(true);
    const fetch = vi.fn().mockImplementation(async () => Response.json({ output: 'recovered' }));
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new HttpProvider('https://retry.fixture.test/cache', {
        config: { method: 'GET', maxRetries: 1 },
      }),
      'hello',
      true,
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ output: 'recovered' });
    expect(read).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps default HTTP error-shaped bodies as successful output', async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json(failed));
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new HttpProvider('https://retry.fixture.test/body', {
        config: { method: 'GET', maxRetries: 3 },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual(failed);
    expect(result.tokenUsage?.numRequests).toBe(1);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([0, 1, 3])(
    'preserves truncated HTTP 503 body recovery with maxRetries=%i',
    async (maxRetries) => {
      vi.stubEnv('PROMPTFOO_RETRY_5XX', 'false');
      const fetch = vi.fn().mockImplementation(async () => {
        if (fetch.mock.calls.length <= Math.max(1, maxRetries)) {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new TypeError('terminated'));
              },
            }),
            { status: 503, statusText: 'Service Unavailable' },
          );
        }
        return Response.json({ output: 'recovered' });
      });
      vi.stubGlobal('fetch', fetch);
      const result = await invoke(
        new HttpProvider('https://retry.fixture.test/body-read', {
          config: { method: 'GET', maxRetries },
        }),
      );
      if (maxRetries === 0) {
        expect(result.error).toContain('terminated. HTTP 503 Service Unavailable');
      } else {
        expect(result.error).toBeUndefined();
        expect(result.output).toEqual({ output: 'recovered' });
      }
      expect(fetch).toHaveBeenCalledTimes(maxRetries + 1);
    },
  );

  it('keeps n8n webhook retry ownership for every HTTP method', async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json(failed));
    vi.stubGlobal('fetch', fetch);
    const provider = new N8nProvider('https://retry.fixture.test/n8n', {
      config: { maxRetries: 3 },
    });
    expect(provider.handlesOwnRetries).toBe(true);
    Object.assign(provider.config, { method: 'get' });
    expect(provider.handlesOwnRetries).toBe(true);
    Object.assign(provider.config, { method: 'patch' });
    const result = await invoke(provider);
    expect(result.error).toContain('Rate limit exceeded');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
