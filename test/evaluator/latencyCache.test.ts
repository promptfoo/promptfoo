import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, enableCache, fetchWithCache, withCacheEnabled } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import { HuggingfaceTextGenerationProvider } from '../../src/providers/huggingface';
import { LocalAiChatProvider, LocalAiCompletionProvider } from '../../src/providers/localai';
import { OllamaChatProvider, OllamaCompletionProvider } from '../../src/providers/ollama';
import { OpenAiResponsesProvider } from '../../src/providers/openai/responses';
import { OpenAiTtsProvider } from '../../src/providers/openai/tts';
import { ReplicateImageProvider, ReplicateProvider } from '../../src/providers/replicate';
import * as evaluatorTracing from '../../src/tracing/evaluatorTracing';
import { extractProviderResponseAttributes } from '../../src/tracing/genaiTracer';
import * as targetTracer from '../../src/tracing/targetTracer';
import { ResultFailureReason } from '../../src/types/index';
import { fetchWithRetries } from '../../src/util/fetch/index';
import { createDeferred } from '../util/utils';

import type { ApiProvider, AssertionType } from '../../src/types/index';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/fetch/index')>()),
  fetchWithRetries: vi.fn(),
}));

beforeEach(async () => {
  vi.mocked(fetchWithRetries).mockReset();
  enableCache();
  await clearCache();
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await clearCache();
});

function evaluateLatency(provider: ApiProvider, prompt = 'hello', type: AssertionType = 'latency') {
  return runEval({
    provider,
    prompt: { raw: prompt, label: prompt },
    test: { assert: [{ type, threshold: 10 }] },
    delay: 0,
    testIdx: 0,
    promptIdx: 0,
    repeatIndex: 0,
    conversations: {},
    registers: {},
    isRedteam: false,
  });
}

const output = 'fixture output';
const providers = [
  {
    name: 'LocalAI completion',
    create: () => new LocalAiCompletionProvider('fixture'),
    response: { choices: [{ text: output }] },
  },
  {
    name: 'LocalAI chat',
    create: () => new LocalAiChatProvider('fixture'),
    response: { choices: [{ message: { content: output } }] },
  },
  {
    name: 'Hugging Face text generation',
    create: () => new HuggingfaceTextGenerationProvider('fixture'),
    response: [{ generated_text: output }],
  },
  {
    name: 'Ollama completion',
    create: () => new OllamaCompletionProvider('fixture'),
    response: { response: output, done: true },
  },
  {
    name: 'Ollama chat',
    create: () => new OllamaChatProvider('fixture'),
    response: { message: { content: output }, done: true },
  },
];

describe('latency assertions with real provider caching', () => {
  it('preserves the provider replay flag before the traced call finishes', async () => {
    vi.spyOn(evaluatorTracing, 'generateTraceContextIfNeeded').mockResolvedValue({
      traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
      evaluationId: 'trace-fixture',
      testCaseId: 'case-fixture',
    });
    const tracedResponses: unknown[] = [];
    vi.spyOn(targetTracer, 'withTracedProviderCall').mockImplementation(
      async ({ callContext }, invoke) => {
        const response = await invoke(callContext);
        tracedResponses.push(response);
        return response;
      },
    );
    vi.mocked(fetchWithRetries).mockImplementation(async () =>
      Response.json({ choices: [{ text: output }] }),
    );
    const provider = new LocalAiCompletionProvider('fixture');
    const callApi = vi.spyOn(provider, 'callApi');

    await evaluateLatency(provider);
    await evaluateLatency(provider);

    expect(tracedResponses).toHaveLength(2);
    expect(await callApi.mock.results[1].value).toMatchObject({ output, cacheHit: true });
    expect(tracedResponses[1]).toMatchObject({ output, cacheHit: true });
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  });

  it('does not infer final replay state from a cached auxiliary fetch', async () => {
    vi.mocked(fetchWithRetries).mockImplementation(async () =>
      Response.json({ label: 'Greeting' }),
    );
    const provider: ApiProvider = {
      id: () => 'auxiliary-context-fixture',
      async callApi() {
        await fetchWithCache('https://fixture.example/context', {}, 1000);
        return { output };
      },
    };
    await evaluateLatency(provider);
    const [fresh] = await evaluateLatency(provider);
    expect(fresh.success).toBe(true);
    expect(fresh.response?.cacheHit).toBeUndefined();
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'keeps live policy responses eligible for latency grading (polling: %s)',
    async (polling) => {
      const creation = createDeferred<Response>();
      const refusal = {
        id: 'resp_policy_fixture',
        status: 'incomplete',
        error: {
          code: 'content_filter',
          message: 'Fixture policy response',
          metadata: { error_type: 'content_policy_violation' },
        },
      };
      vi.mocked(fetchWithRetries)
        .mockImplementationOnce(() => creation.promise)
        .mockImplementation(async () => Response.json(refusal));
      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'fixture-key',
          apiBaseUrl: 'https://gateway.example/v1',
          background: true,
          headers: { 'OpenAI-Project': 'fixture-project', Authorization: '' },
        },
      });

      const calls = [evaluateLatency(provider), evaluateLatency(provider)];
      await vi.advanceTimersByTimeAsync(25);
      creation.resolve(
        Response.json(polling ? { id: refusal.id, status: 'queued', output: [] } : refusal),
      );
      await vi.advanceTimersByTimeAsync(0);

      const results = (await Promise.all(calls)).flat();
      expect(results.map((result) => result.response?.cached).sort()).toEqual([false, true]);
      for (const result of results) {
        expect(result.response).toMatchObject({ isRefusal: true, cacheHit: false });
        expect(result.failureReason).not.toBe(ResultFailureReason.ERROR);
      }
      expect(fetchWithRetries).toHaveBeenCalledTimes(polling ? 2 : 1);
    },
  );

  it.each(providers)('rejects stored $name responses', async (fixture) => {
    vi.mocked(fetchWithRetries).mockImplementation(async () => Response.json(fixture.response));
    const provider = fixture.create();

    const [fresh] = await evaluateLatency(provider);
    expect(fresh.success).toBe(true);
    expect(fresh.response?.output).toBe(output);

    const rawReplay = await provider.callApi('hello');
    expect(rawReplay.output).toBe(output);
    expect(rawReplay.cacheHit).toBe(true);
    const [replay] = await evaluateLatency(provider);
    expect(replay.success).toBe(false);
    expect(replay.failureReason).toBe(ResultFailureReason.ERROR);
    expect(replay.error).toContain('does not support cached results');
    expect(replay.error).toContain('--no-cache');
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);

    const [uncached] = await withCacheEnabled(false, () => evaluateLatency(provider));
    expect(uncached.success).toBe(true);
    expect(fetchWithRetries).toHaveBeenCalledTimes(2);
  });

  it('isolates cached and fresh concurrent evaluations and rejects inverse cache assertions', async () => {
    vi.mocked(fetchWithRetries).mockImplementation(async () =>
      Response.json({ choices: [{ text: output }] }),
    );
    const provider = new LocalAiCompletionProvider('fixture');
    await evaluateLatency(provider, 'cached prompt');

    const [[cached], [fresh]] = await Promise.all([
      evaluateLatency(provider, 'cached prompt', 'not-latency'),
      evaluateLatency(provider, 'fresh prompt'),
    ]);
    expect(cached.failureReason).toBe(ResultFailureReason.ERROR);
    expect(cached.error).toContain('does not support cached results');
    expect(fresh.success).toBe(true);
    expect(fresh.response?.cacheHit).toBeUndefined();
    expect(fetchWithRetries).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'text',
      create: () => new ReplicateProvider('fixture/model', { config: { apiKey: 'fixture-key' } }),
    },
    {
      name: 'image',
      create: () =>
        new ReplicateImageProvider('fixture/model', { config: { apiKey: 'fixture-key' } }),
    },
  ])(
    'grades a live Replicate $name poll after replaying an intermediate job',
    async ({ create }) => {
      vi.mocked(fetchWithRetries)
        .mockResolvedValueOnce(Response.json({ id: 'prediction', status: 'processing' }))
        .mockResolvedValueOnce(
          Response.json({ id: 'prediction', status: 'failed', error: 'Unavailable' }),
        )
        .mockResolvedValueOnce(
          Response.json({
            id: 'prediction',
            status: 'succeeded',
            output: ['https://example.com/output'],
          }),
        );
      const provider = create();
      expect((await provider.callApi('hello')).error).toContain('Unavailable');

      const [fresh] = await evaluateLatency(provider);
      expect(fresh.success).toBe(true);
      expect(fresh.response?.cacheHit).toBe(false);
      expect(fresh.response?.output).toContain('https://example.com/output');
      expect(fetchWithRetries).toHaveBeenCalledTimes(3);

      const [replay] = await evaluateLatency(provider);
      expect(replay.failureReason).toBe(ResultFailureReason.ERROR);
      expect(replay.error).toContain('does not support cached results');
      expect(fetchWithRetries).toHaveBeenCalledTimes(3);
    },
  );

  it.each([false, true])(
    'keeps failed shared Replicate responses marked live (polling: %s)',
    async (polling) => {
      const creation = createDeferred<Response>();
      const failed = { id: 'prediction', status: 'failed', error: 'Fixture unavailable' };
      vi.mocked(fetchWithRetries)
        .mockImplementationOnce(() => creation.promise)
        .mockImplementation(async () => Response.json(failed));
      const provider = new ReplicateProvider('fixture/model', {
        config: { apiKey: 'fixture-key' },
      });
      const calls = [provider.callApi('hello'), provider.callApi('hello')];
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchWithRetries).toHaveBeenCalledOnce();
      creation.resolve(Response.json(polling ? { id: failed.id, status: 'processing' } : failed));
      const results = await Promise.all(calls);

      expect(results.filter((result) => result.cached)).toHaveLength(1);
      for (const result of results) {
        expect(result.error).toContain('Fixture unavailable');
        expect(result.cacheHit).toBe(false);
        expect(extractProviderResponseAttributes(result).cacheHit).toBe(false);
      }
      expect(fetchWithRetries).toHaveBeenCalledTimes(polling ? 3 : 1);
    },
  );

  it('grades a live poll after replaying an unfinished background job', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(Response.json({ id: 'resp_pending', status: 'queued', output: [] }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'Unavailable' } }, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'resp_pending',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: output }],
            },
          ],
        }),
      );
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: {
        apiKey: 'fixture-key',
        background: true,
        headers: { 'OpenAI-Project': 'fixture-project' },
      },
    });
    expect((await provider.callApi('hello')).error).toContain('Unavailable');

    const [fresh] = await evaluateLatency(provider);
    expect(fresh.success).toBe(true);
    expect(fresh.response).toMatchObject({ output, cacheHit: false });
    expect(fetchWithRetries).toHaveBeenCalledTimes(3);

    const [replay] = await evaluateLatency(provider);
    expect(replay.failureReason).toBe(ResultFailureReason.ERROR);
    expect(replay.error).toContain('does not support cached results');
    expect(fetchWithRetries).toHaveBeenCalledTimes(3);
  });

  it('grades a live HTTP policy refusal after replaying a queued background job', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(Response.json({ id: 'resp_policy', status: 'queued', output: [] }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'Unavailable' } }, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 'content_filter',
              message: 'Fixture policy response',
              metadata: { error_type: 'content_policy_violation' },
            },
          },
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ id: 'resp_policy', status: 'cancelled' }));
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: {
        apiKey: 'fixture-key',
        apiBaseUrl: 'https://gateway.example/v1',
        background: true,
        headers: { 'OpenAI-Project': 'fixture-project', Authorization: '' },
      },
    });
    expect((await provider.callApi('hello')).error).toContain('Unavailable');
    const [fresh] = await evaluateLatency(provider);
    expect(fresh.success).toBe(true);
    expect(fresh.response).toMatchObject({ isRefusal: true, cacheHit: false });
    expect(fetchWithRetries).toHaveBeenCalledTimes(4);
  });

  it('grades live speech subscribers and rejects a later stored replay', async () => {
    const audio = createDeferred<Response>();
    vi.mocked(fetchWithRetries).mockImplementation(() => audio.promise);
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'fixture-key' } });
    const calls = [evaluateLatency(provider), evaluateLatency(provider)];
    await vi.advanceTimersByTimeAsync(25);
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
    audio.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const results = (await Promise.all(calls)).flat();

    expect(results.map((result) => result.response?.cached).sort()).toEqual([false, true]);
    for (const result of results) {
      expect(result.failureReason).not.toBe(ResultFailureReason.ERROR);
      expect(result.error).toContain('threshold 10ms');
    }
    const [replay] = await evaluateLatency(provider);
    expect(replay.failureReason).toBe(ResultFailureReason.ERROR);
    expect(replay.error).toContain('does not support cached results');
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  });

  it('grades a fresh replacement after discarding an expired cached background job', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(Response.json({ id: 'resp_expired', status: 'queued', output: [] }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'Unavailable' } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'Expired' } }, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'resp_replacement',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: output }],
            },
          ],
        }),
      );
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: {
        apiKey: 'fixture-key',
        background: true,
        headers: { 'OpenAI-Project': 'fixture-project' },
      },
    });
    // The failed first poll leaves a queued cache entry that expires upstream.
    expect((await provider.callApi('hello')).error).toContain('Unavailable');

    const [fresh] = await evaluateLatency(provider);
    expect(fresh.success).toBe(true);
    expect(fresh.response).toMatchObject({ output, cacheHit: false });
    expect(fetchWithRetries).toHaveBeenCalledTimes(4);

    const [replay] = await evaluateLatency(provider);
    expect(replay.failureReason).toBe(ResultFailureReason.ERROR);
    expect(replay.error).toContain('does not support cached results');
    expect(fetchWithRetries).toHaveBeenCalledTimes(4);
  });

  it.each([false, true])(
    'grades both live background subscribers (polling: %s)',
    async (polling) => {
      const creation = createDeferred<Response>();
      const completed = {
        id: 'resp_latency_fixture',
        status: 'completed',
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: output }] },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
      vi.mocked(fetchWithRetries)
        .mockImplementationOnce(() => creation.promise)
        .mockImplementation(async () => Response.json(completed));
      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'fixture-key',
          background: true,
          headers: { 'OpenAI-Project': 'fixture-project' },
        },
      });

      const calls = [evaluateLatency(provider), evaluateLatency(provider)];
      await vi.advanceTimersByTimeAsync(25);
      expect(fetchWithRetries).toHaveBeenCalledTimes(1);
      creation.resolve(
        Response.json(
          polling ? { ...completed, status: 'queued', output: [], usage: null } : completed,
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      const results = (await Promise.all(calls)).flat();

      expect(results.map((result) => result.response?.cached).sort()).toEqual([false, true]);
      for (const result of results) {
        expect(result.response?.output).toBe(output);
        expect(result.response?.cacheHit).toBe(false);
        expect(result.success).toBe(false);
        expect(result.failureReason).not.toBe(ResultFailureReason.ERROR);
        expect(result.error).toContain('threshold 10ms');
      }

      const [replay] = await evaluateLatency(provider);
      expect(replay.failureReason).toBe(ResultFailureReason.ERROR);
      expect(replay.error).toContain('does not support cached results');
      expect(fetchWithRetries).toHaveBeenCalledTimes(polling ? 2 : 1);
    },
  );
});
