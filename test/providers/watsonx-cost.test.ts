import { getEventListeners } from 'node:events';

import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, isCacheEnabled } from '../../src/cache';
import {
  clearModelSpecsCache,
  WatsonXChatProvider,
  WatsonXProvider,
} from '../../src/providers/watsonx';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';

vi.mock('@ibm-cloud/watsonx-ai', () => ({ WatsonXAI: { newInstance: vi.fn() } }));
vi.mock('../../src/envars', async (importOriginal) => ({
  ...(await importOriginal()),
  getEnvString: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
  fetchWithCache: vi.fn(),
}));

const modelId = 'account/custom-model';
const textResult = {
  result: {
    model_id: modelId,
    model_version: '1',
    created_at: '2026-09-08T00:00:00Z',
    results: [{ generated_text: 'Hello', input_token_count: 10, generated_token_count: 20 }],
  },
};
const chatResult = {
  result: {
    choices: [{ message: { content: 'Hello' } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  },
};
function metadata(
  inputTier: unknown = 'class_c1',
  outputTier: unknown = 'class_9',
  effectiveModelId = modelId,
) {
  return {
    result: {
      resources: [{ model_id: effectiveModelId, input_tier: inputTier, output_tier: outputTier }],
    },
  };
}
function client(inputTier: unknown = 'class_c1', outputTier: unknown = 'class_9') {
  return {
    generateText: vi.fn().mockResolvedValue(textResult),
    textChat: vi.fn().mockResolvedValue(chatResult),
    listFoundationModelSpecs: vi.fn().mockResolvedValue(metadata(inputTier, outputTier)),
  };
}
function provider(chat = false, config: Record<string, unknown> = {}) {
  const Provider = chat ? WatsonXChatProvider : WatsonXProvider;
  return new Provider('route-label', {
    config: {
      apiBearerToken: 'fixture-account-token',
      projectId: 'fixture-project',
      modelId,
      serviceUrl: 'https://eu-de.ml.cloud.ibm.com',
      version: '2024-05-01',
      ...config,
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function expectCallerAbort(observed: Promise<unknown>) {
  const onSettled = vi.fn();
  void observed.then(onSettled);
  await vi.advanceTimersByTimeAsync(0);
  expect(onSettled).toHaveBeenCalledTimes(1);
  const error = onSettled.mock.calls[0][0];
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ name: 'AbortError', message: expect.stringMatching(/abort/i) });
  expect(error).not.toHaveProperty('message', expect.stringMatching(/timeout|network/i));
}

function setTokenCounts(
  regionalClient: ReturnType<typeof client>,
  input: number | undefined,
  output: number | undefined,
) {
  regionalClient.generateText.mockResolvedValue({
    result: {
      ...textResult.result,
      results: [
        { generated_text: 'Hello', input_token_count: input, generated_token_count: output },
      ],
    },
  });
  regionalClient.textChat.mockResolvedValue({
    result: {
      ...chatResult.result,
      usage: {
        prompt_tokens: input,
        completion_tokens: output,
        total_tokens: (input ?? 0) + (output ?? 0),
      },
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  clearModelSpecsCache();
  vi.mocked(isCacheEnabled).mockReturnValue(false);
  vi.mocked(fetchWithCache).mockRejectedValue(new Error('Metadata must use the SDK client'));
  vi.mocked(getCache).mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
});
afterEach(() => {
  expect(fetchWithCache).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  clearModelSpecsCache();
});

describe.each([false, true])('WatsonX regional cost (chat=%s)', (chat) => {
  it('shares one client and metadata request across a cold concurrent batch', async () => {
    vi.useFakeTimers();
    const regionalClient = client();
    const lookup = deferred<ReturnType<typeof metadata>>();
    const started = deferred<void>();
    regionalClient.listFoundationModelSpecs.mockImplementation(() => {
      started.resolve();
      return lookup.promise;
    });
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    const pending = Promise.all(
      ['First', 'Second', 'Third', 'Fourth'].map((prompt) => instance.callApi(prompt)),
    );
    await started.promise;
    await vi.advanceTimersByTimeAsync(0);
    lookup.resolve(metadata());
    const results = await pending;

    expect(WatsonXAI.newInstance).toHaveBeenCalledTimes(1);
    expect(chat ? regionalClient.textChat : regionalClient.generateText).toHaveBeenCalledTimes(4);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.output).toBe('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries client initialization after a shared failure', async () => {
    const regionalClient = client();
    vi.mocked(WatsonXAI.newInstance)
      .mockImplementationOnce(() => {
        throw new Error('Client initialization failed');
      })
      .mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    const results = await Promise.allSettled([
      instance.callApi('First'),
      instance.callApi('Second'),
    ]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(WatsonXAI.newInstance).toHaveBeenCalledTimes(1);
    expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();

    expect((await instance.callApi('Recovered')).output).toBe('Hello');
    expect(WatsonXAI.newInstance).toHaveBeenCalledTimes(2);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
  });

  it('keeps the initialized client and response cache bound to the same account', async () => {
    const firstClient = client('class_c1', 'class_c1');
    const secondClient = client('class_9', 'class_9');
    secondClient.generateText.mockResolvedValue({
      result: {
        ...textResult.result,
        results: [{ ...textResult.result.results[0], generated_text: 'Other account' }],
      },
    });
    secondClient.textChat.mockResolvedValue({
      result: { ...chatResult.result, choices: [{ message: { content: 'Other account' } }] },
    });
    const responses = new Map<string, string>();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockReturnValue({
      get: vi.fn(async (key: string) => responses.get(key)),
      set: vi.fn(async (key: string, value: string) => responses.set(key, value)),
    } as any);
    const instance = provider(chat);
    let overlappingClient: ReturnType<WatsonXProvider['getClient']> | undefined;
    vi.mocked(WatsonXAI.newInstance)
      .mockImplementationOnce(() => {
        // Overlap initialization before the first SDK client has been assigned.
        instance.config.apiBearerToken = 'other-account-token';
        overlappingClient = instance.getClient();
        return firstClient as any;
      })
      .mockReturnValue(secondClient as any);
    await instance.getClient();
    await overlappingClient;
    await instance.callApi('Shared prompt');

    vi.mocked(WatsonXAI.newInstance).mockReturnValue(firstClient as any);
    const replay = await provider(chat).callApi('Shared prompt');
    expect(replay).toMatchObject({ cached: true, output: 'Hello' });
    expect(replay.cost).toBeCloseTo((30 * 0.106) / 1e6, 12);
    expect(chat ? secondClient.textChat : secondClient.generateText).not.toHaveBeenCalled();
  });

  it('shares a metadata refresh after the successful entry expires', async () => {
    vi.useFakeTimers();
    const regionalClient = client();
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    await instance.callApi('Initial');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    const lookup = deferred<ReturnType<typeof metadata>>();
    const started = deferred<void>();
    regionalClient.listFoundationModelSpecs.mockImplementation(() => {
      started.resolve();
      return lookup.promise;
    });
    const pending = Promise.all(
      ['First', 'Second', 'Third'].map((prompt) => instance.callApi(prompt)),
    );
    await started.promise;
    await vi.advanceTimersByTimeAsync(0);
    lookup.resolve(metadata('class_9', 'class_9'));
    const results = await pending;

    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
    for (const result of results) {
      expect(result.cost).toBeCloseTo((30 * 0.371) / 1e6, 12);
    }
    await instance.callApi('Still fresh');
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['failure', 'timeout'])(
    'releases all shared metadata waiters after %s and permits recovery',
    async (failure) => {
      vi.useFakeTimers();
      vi.stubEnv('REQUEST_TIMEOUT_MS', '50');
      const regionalClient = client();
      const lookup = deferred<ReturnType<typeof metadata>>();
      const started = deferred<void>();
      regionalClient.listFoundationModelSpecs.mockImplementation(() => {
        started.resolve();
        return lookup.promise;
      });
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const instance = provider(chat);
      await instance.getClient();
      const pending = Promise.all(
        ['First', 'Second', 'Third'].map((prompt) => instance.callApi(prompt)),
      );
      await started.promise;
      await vi.advanceTimersByTimeAsync(0);
      const signal = regionalClient.listFoundationModelSpecs.mock.calls[0][0].signal;
      if (failure === 'timeout') {
        await vi.advanceTimersByTimeAsync(50);
      } else {
        lookup.reject(new Error('Metadata unavailable'));
      }
      const results = await pending;

      expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
      expect(signal.aborted).toBe(failure === 'timeout');
      for (const result of results) {
        expect(result.output).toBe('Hello');
        expect(result.error).toBeUndefined();
        expect(result.cost).toBeUndefined();
      }
      expect(vi.getTimerCount()).toBe(0);

      regionalClient.listFoundationModelSpecs.mockResolvedValue(metadata());
      const recovered = await instance.callApi('Recovered');
      expect(recovered.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
      if (failure === 'timeout') {
        lookup.resolve(metadata('class_1', 'class_1'));
        expect((await instance.callApi('After late response')).cost).toBe(recovered.cost);
      }
      expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('uses the generation client and effective model ID for authenticated regional metadata', async () => {
    const regionalClient = client();
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const result = await provider(chat).callApi('Hello');

    expect(WatsonXAI.newInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceUrl: 'https://eu-de.ml.cloud.ibm.com',
        version: '2024-05-01',
        authenticator: expect.anything(),
      }),
    );
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledWith({
      filters: `modelid_${modelId}`,
      signal: expect.any(AbortSignal),
    });
    expect(chat ? regionalClient.textChat : regionalClient.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ modelId }),
    );
    expect(result.output).toBe('Hello');
    expect(result.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
  });

  it.each([
    ['new input tier', 'future_class', 'class_9'],
    ['new output tier', 'class_c1', 'future_class'],
    ['missing input tier', null, 'class_9'],
    ['missing output tier', 'class_c1', null],
  ])(
    'leaves cost unknown for %s while preserving the generated output',
    async (_name, input, output) => {
      const regionalClient = client(input, output);
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const result = await provider(chat).callApi('Hello');
      expect(result.output).toBe('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeUndefined();
    },
  );

  it('keeps a metadata failure out of the generation error and retries after recovery', async () => {
    const regionalClient = client();
    regionalClient.listFoundationModelSpecs.mockRejectedValueOnce(
      new Error('Metadata unavailable'),
    );
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    const first = await instance.callApi('Hello');
    const second = await instance.callApi('Hello again');
    expect(first).toMatchObject({ output: 'Hello' });
    expect(first.error).toBeUndefined();
    expect(first.cost).toBeUndefined();
    expect(second.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
  });

  it('aborts stalled metadata at the request deadline and retries after recovery', async () => {
    vi.useFakeTimers();
    vi.stubEnv('REQUEST_TIMEOUT_MS', '50');
    const regionalClient = client();
    let metadataSignal: AbortSignal | undefined;
    let onMetadataStarted!: () => void;
    const metadataStarted = new Promise<void>((resolve) => {
      onMetadataStarted = resolve;
    });
    regionalClient.listFoundationModelSpecs.mockImplementationOnce(
      ({ signal }: { signal?: AbortSignal }) => {
        metadataSignal = signal;
        onMetadataStarted();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('Metadata aborted')), {
            once: true,
          });
        });
      },
    );
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    const pending = instance.callApi('Hello');
    await metadataStarted;
    await vi.advanceTimersByTimeAsync(49);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
    expect(metadataSignal).toBeInstanceOf(AbortSignal);
    expect(metadataSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(metadataSignal?.aborted).toBe(true);
    const result = await pending;
    expect(result.output).toBe('Hello');
    expect(result.error).toBeUndefined();
    expect(result.cost).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    const recovered = await instance.callApi('Hello again');
    expect(recovered.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])(
    'bounds SDK waits that settle after cancellation (rejects=%s)',
    async (rejects) => {
      vi.useFakeTimers();
      vi.stubEnv('REQUEST_TIMEOUT_MS', '50');
      const regionalClient = client();
      let onMetadataStarted!: () => void;
      const metadataStarted = new Promise<void>((resolve) => {
        onMetadataStarted = resolve;
      });
      let settleMetadata!: () => void;
      regionalClient.listFoundationModelSpecs.mockImplementationOnce(() => {
        onMetadataStarted();
        return new Promise((resolve, reject) => {
          settleMetadata = () =>
            rejects
              ? reject(new Error('Delayed SDK cancellation'))
              : resolve(metadata('class_1', 'class_1'));
        });
      });
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const instance = provider(chat);
      const pending = instance.callApi('Hello');
      await metadataStarted;
      await vi.advanceTimersByTimeAsync(50);
      const result = await pending;
      expect(result.output).toBe('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeUndefined();
      expect(regionalClient.listFoundationModelSpecs.mock.calls[0][0].signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);

      // Late SDK success must not populate the cache; rejection must remain handled.
      settleMetadata();
      const recovered = await instance.callApi('Hello again');
      expect(recovered.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
      expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([false, true])(
    'clears the metadata deadline after settlement (failure=%s)',
    async (fails) => {
      vi.useFakeTimers();
      vi.stubEnv('REQUEST_TIMEOUT_MS', '50');
      const regionalClient = client();
      if (fails) {
        regionalClient.listFoundationModelSpecs.mockRejectedValueOnce(new Error('Unavailable'));
      }
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      await provider(chat).callApi('Hello');
      const signal = regionalClient.listFoundationModelSpecs.mock.calls[0][0].signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(50);
      expect(signal.aborted).toBe(false);
    },
  );

  it.each([
    { cost: 0.01, expected: 0.3 },
    { inputCost: 0.01, outputCost: 0.02, expected: 0.5 },
    { cost: 0.01, outputCost: 0.02, expected: 0.5 },
    { inputCost: 0, outputCost: 0, expected: 0 },
  ])(
    'honors explicit per-token prices without fetching metadata ($expected)',
    async ({ expected, ...config }) => {
      const regionalClient = client();
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      expect((await provider(chat, config).callApi('Hello')).cost).toBeCloseTo(expected, 12);
      expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
    },
  );

  it('combines an explicit input price with a known output tier', async () => {
    const regionalClient = client('unknown', 'class_9');
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    expect((await provider(chat, { inputCost: 0.01 }).callApi('Hello')).cost).toBeCloseTo(
      0.1 + (20 * 0.371) / 1e6,
      12,
    );
  });

  it.each([
    {
      name: 'unknown output tier',
      input: 10,
      output: 0,
      inputTier: 'class_c1',
      outputTier: 'unknown',
      expected: (10 * 0.106) / 1e6,
    },
    {
      name: 'missing output tier',
      input: 10,
      output: 0,
      inputTier: 'class_c1',
      outputTier: null,
      expected: (10 * 0.106) / 1e6,
    },
    {
      name: 'unknown input tier',
      input: 0,
      output: 20,
      inputTier: 'unknown',
      outputTier: 'class_9',
      expected: (20 * 0.371) / 1e6,
    },
    {
      name: 'missing input tier',
      input: 0,
      output: 20,
      inputTier: null,
      outputTier: 'class_9',
      expected: (20 * 0.371) / 1e6,
    },
  ])(
    'ignores an unused $name for reported zero tokens',
    async ({ input, output, inputTier, outputTier, expected }) => {
      const regionalClient = client(inputTier, outputTier);
      setTokenCounts(regionalClient, input, output);
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const result = await provider(chat).callApi('Hello');

      expect(result.output).toBe('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(expected, 12);
      expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { name: 'input override', input: 10, output: 0, config: { inputCost: 0.01 }, expected: 0.1 },
    { name: 'output override', input: 0, output: 20, config: { outputCost: 0.02 }, expected: 0.4 },
    { name: 'both counts zero', input: 0, output: 0, config: {}, expected: 0 },
  ])(
    'skips metadata when $name supplies every required price',
    async ({ input, output, config, expected }) => {
      const regionalClient = client('unknown', 'unknown');
      setTokenCounts(regionalClient, input, output);
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const result = await provider(chat, config).callApi('Hello');

      expect(result.output).toBe('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(expected, 12);
      expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: 'missing input', input: undefined, output: 0 },
    { name: 'missing output', input: 0, output: undefined },
    { name: 'negative input', input: -1, output: 0 },
    { name: 'negative output', input: 0, output: -1 },
    { name: 'NaN input', input: Number.NaN, output: 0 },
    { name: 'NaN output', input: 0, output: Number.NaN },
    { name: 'infinite input', input: Number.POSITIVE_INFINITY, output: 0 },
    { name: 'infinite output', input: 0, output: Number.POSITIVE_INFINITY },
  ])(
    'keeps cost unknown for $name despite a reported zero counterpart',
    async ({ input, output }) => {
      const regionalClient = client();
      setTokenCounts(regionalClient, input, output);
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const result = await provider(chat, { cost: 0.01 }).callApi('Hello');

      expect(result.cost).toBeUndefined();
      expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
    },
  );

  it('does not replay old cached responses with fabricated zero costs', async () => {
    const regionalClient = client('unknown', 'unknown');
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    const cache = {
      get: vi.fn(async (key: string) =>
        key.startsWith('watsonx:v2:') ||
        (key.startsWith('watsonx:chat:') && !key.startsWith('watsonx:chat:v3:'))
          ? JSON.stringify({ output: 'Old response', cost: 0 })
          : null,
      ),
      set: vi.fn(),
    };
    vi.mocked(getCache).mockReturnValue(cache as any);
    const response = await provider(chat).callApi('Hello');
    expect(response.output).toBe('Hello');
    expect(response.cost).toBeUndefined();
    expect(response.cached).not.toBe(true);
  });
});

describe.each([false, true])('WatsonX caller cancellation (chat=%s)', (chat) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('REQUEST_TIMEOUT_MS', '50');
    vi.mocked(isCacheEnabled).mockReturnValue(true);
  });

  it.each([false, true])(
    'returns SDK AbortErrors as ordinary failures when the caller did not cancel (signal=%s)',
    async (withSignal) => {
      const regionalClient = client();
      const generation = chat ? regionalClient.textChat : regionalClient.generateText;
      const sdkError = Object.assign(new Error('SDK request timed out'), { name: 'AbortError' });
      generation.mockRejectedValueOnce(sdkError);
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const signal = withSignal ? new AbortController().signal : undefined;
      const cache = getCache();

      await expect(
        provider(chat).callApi(
          'SDK failure',
          undefined,
          signal ? { abortSignal: signal } : undefined,
        ),
      ).resolves.toEqual({
        error: 'API call error: AbortError: SDK request timed out',
        output: '',
        tokenUsage: createEmptyTokenUsage(),
      });
      expect(generation).toHaveBeenCalledTimes(1);
      expect(generation.mock.calls[0][0].signal).toBe(signal);
      expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
      if (signal) {
        expect(signal.aborted).toBe(false);
        expect(getEventListeners(signal, 'abort')).toEqual([]);
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('rejects pre-aborted calls before initializing the SDK or reading the response cache', async () => {
    const regionalClient = client();
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const controller = new AbortController();
    controller.abort(new Error('Caller network timeout'));
    const cache = getCache();
    const observed = provider(chat)
      .callApi('Never dispatched', undefined, { abortSignal: controller.signal })
      .catch((error) => error);

    try {
      await expectCallerAbort(observed);
      expect(WatsonXAI.newInstance).not.toHaveBeenCalled();
      expect(regionalClient.generateText).not.toHaveBeenCalled();
      expect(regionalClient.textChat).not.toHaveBeenCalled();
      expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
      expect(cache.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
      expect(getEventListeners(controller.signal, 'abort')).toEqual([]);
    } finally {
      await observed;
    }
  });

  it('detaches during shared client initialization while a surviving caller completes', async () => {
    const regionalClient = client();
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    const originalGetAuth = instance.getAuth.bind(instance);
    const started = deferred<void>();
    const release = deferred<void>();
    const auth = vi.spyOn(instance, 'getAuth').mockImplementation(async () => {
      const authenticator = await originalGetAuth();
      started.resolve();
      await release.promise;
      return authenticator;
    });
    const canceled = new AbortController();
    const surviving = new AbortController();
    const cache = getCache();
    const observed = instance
      .callApi('Canceled', undefined, { abortSignal: canceled.signal })
      .catch((error) => error);
    const survivor = instance.callApi('Survivor', undefined, { abortSignal: surviving.signal });
    try {
      await started.promise;
      canceled.abort();
      await expectCallerAbort(observed);
      expect(WatsonXAI.newInstance).not.toHaveBeenCalled();
      expect(regionalClient.generateText).not.toHaveBeenCalled();
      expect(regionalClient.textChat).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();

      release.resolve();
      expect((await survivor).output).toBe('Hello');
      expect(auth).toHaveBeenCalledTimes(1);
      expect(WatsonXAI.newInstance).toHaveBeenCalledTimes(1);
      expect(chat ? regionalClient.textChat : regionalClient.generateText).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);
      expect(surviving.signal.aborted).toBe(false);
      expect(getEventListeners(canceled.signal, 'abort')).toEqual([]);
      expect(getEventListeners(surviving.signal, 'abort')).toEqual([]);
    } finally {
      release.resolve();
      await Promise.allSettled([observed, survivor]);
    }
  });

  it.each(['late success', 'late failure', 'SDK cancellation'])(
    'detaches from pending SDK work and ignores %s',
    async (settlement) => {
      const regionalClient = client();
      const generation = chat ? regionalClient.textChat : regionalClient.generateText;
      const response = chat ? chatResult : textResult;
      const started = deferred<void>();
      const held = deferred<unknown>();
      generation.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
        started.resolve();
        if (settlement === 'SDK cancellation') {
          signal?.addEventListener(
            'abort',
            () => held.reject(new Error('Network timeout: SDK request canceled')),
            { once: true },
          );
        }
        return held.promise;
      });
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const instance = provider(chat);
      expect(await instance.getClient()).toBe(regionalClient);
      const controller = new AbortController();
      const cache = getCache();
      const observed = instance
        .callApi('Canceled SDK call', undefined, { abortSignal: controller.signal })
        .catch((error) => error);
      try {
        await started.promise;
        controller.abort(new Error('Caller network timeout'));
        await expectCallerAbort(observed);
        expect(generation).toHaveBeenCalledWith(
          expect.objectContaining({ signal: controller.signal }),
        );
        expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();

        if (settlement === 'late failure') {
          held.reject(new Error('Late SDK failure'));
        } else if (settlement === 'late success') {
          held.resolve(response);
        }
        await vi.advanceTimersByTimeAsync(0);
        expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
        expect(getEventListeners(controller.signal, 'abort')).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        held.resolve(response);
        await observed;
        await vi.advanceTimersByTimeAsync(0);
      }
    },
  );

  it('cancels one metadata waiter while preserving the survivor and shared cached prices', async () => {
    const regionalClient = client();
    const lookup = deferred<ReturnType<typeof metadata>>();
    const started = deferred<void>();
    regionalClient.listFoundationModelSpecs.mockImplementation(() => {
      started.resolve();
      return lookup.promise;
    });
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    expect(await instance.getClient()).toBe(regionalClient);
    const canceled = new AbortController();
    const surviving = new AbortController();
    const cache = getCache();
    const observed = instance
      .callApi('Canceled', undefined, { abortSignal: canceled.signal })
      .catch((error) => error);
    const survivor = instance.callApi('Survivor', undefined, { abortSignal: surviving.signal });
    try {
      await started.promise;
      await vi.advanceTimersByTimeAsync(0);
      canceled.abort();
      await expectCallerAbort(observed);
      const metadataSignal = regionalClient.listFoundationModelSpecs.mock.calls[0][0].signal;
      expect(metadataSignal).not.toBe(canceled.signal);
      expect(metadataSignal).not.toBe(surviving.signal);
      expect(metadataSignal.aborted).toBe(false);
      expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
      expect(cache.set).not.toHaveBeenCalled();

      lookup.resolve(metadata());
      const result = await survivor;
      expect(result.output).toBe('Hello');
      expect(result.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
      expect(cache.set).toHaveBeenCalledTimes(1);
      expect((await instance.callApi('Future caller')).cost).toBe(result.cost);
      expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
      expect(surviving.signal.aborted).toBe(false);
      expect(getEventListeners(canceled.signal, 'abort')).toEqual([]);
      expect(getEventListeners(surviving.signal, 'abort')).toEqual([]);
    } finally {
      lookup.resolve(metadata());
      await Promise.allSettled([observed, survivor]);
    }
  });

  it.each(['success', 'deadline'])(
    'preserves the shared metadata %s after every caller cancels',
    async (settlement) => {
      const regionalClient = client();
      const lookup = deferred<ReturnType<typeof metadata>>();
      const started = deferred<void>();
      regionalClient.listFoundationModelSpecs.mockImplementation(() => {
        started.resolve();
        return lookup.promise;
      });
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const instance = provider(chat);
      expect(await instance.getClient()).toBe(regionalClient);
      const controllers = [new AbortController(), new AbortController()];
      const cache = getCache();
      const observed = controllers.map((controller, index) =>
        instance
          .callApi(`Canceled ${index}`, undefined, { abortSignal: controller.signal })
          .catch((error) => error),
      );
      try {
        await started.promise;
        await vi.advanceTimersByTimeAsync(0);
        controllers.forEach((controller) => controller.abort());
        for (const result of observed) {
          await expectCallerAbort(result);
        }
        const metadataSignal = regionalClient.listFoundationModelSpecs.mock.calls[0][0].signal;
        expect(metadataSignal.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(1);
        expect(cache.set).not.toHaveBeenCalled();

        if (settlement === 'success') {
          lookup.resolve(metadata());
          await vi.advanceTimersByTimeAsync(0);
        } else {
          await vi.advanceTimersByTimeAsync(50);
          regionalClient.listFoundationModelSpecs.mockResolvedValue(metadata());
        }
        expect(metadataSignal.aborted).toBe(settlement === 'deadline');
        expect(vi.getTimerCount()).toBe(0);
        expect(cache.set).not.toHaveBeenCalled();
        const future = await instance.callApi('Future caller');
        expect(future.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
        expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(
          settlement === 'success' ? 1 : 2,
        );
        for (const controller of controllers) {
          expect(getEventListeners(controller.signal, 'abort')).toEqual([]);
        }
      } finally {
        lookup.resolve(metadata());
        await Promise.allSettled(observed);
        await vi.advanceTimersByTimeAsync(0);
      }
    },
  );

  it.each([false, true])(
    'detaches from a held response-cache read without continuing after abort (hit=%s)',
    async (hit) => {
      const regionalClient = client();
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const instance = provider(chat);
      expect(await instance.getClient()).toBe(regionalClient);
      const read = deferred<string | undefined>();
      const started = deferred<void>();
      const cache = {
        get: vi.fn(() => {
          started.resolve();
          return read.promise;
        }),
        set: vi.fn(),
      };
      vi.mocked(getCache).mockReturnValue(cache as any);
      const controller = new AbortController();
      const observed = instance
        .callApi('Held cache read', undefined, { abortSignal: controller.signal })
        .catch((error) => error);
      const cached = hit ? JSON.stringify({ output: 'Cached response', cost: 0.25 }) : undefined;
      try {
        await started.promise;
        controller.abort();
        await expectCallerAbort(observed);
        read.resolve(cached);
        await vi.advanceTimersByTimeAsync(0);
        expect(regionalClient.generateText).not.toHaveBeenCalled();
        expect(regionalClient.textChat).not.toHaveBeenCalled();
        expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
        expect(getEventListeners(controller.signal, 'abort')).toEqual([]);
      } finally {
        read.resolve(cached);
        await observed;
      }
    },
  );

  it('does not write a response when cancellation wins as pricing completes', async () => {
    const regionalClient = client();
    const lookup = deferred<ReturnType<typeof metadata>>();
    const started = deferred<void>();
    regionalClient.listFoundationModelSpecs.mockImplementation(() => {
      started.resolve();
      return lookup.promise;
    });
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    expect(await instance.getClient()).toBe(regionalClient);
    const controller = new AbortController();
    const cache = getCache();
    const observed = instance
      .callApi('Canceled before cache write', undefined, { abortSignal: controller.signal })
      .catch((error) => error);
    try {
      await started.promise;
      lookup.resolve(metadata());
      controller.abort();
      await expectCallerAbort(observed);
      expect(cache.set).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toEqual([]);
    } finally {
      lookup.resolve(metadata());
      await observed;
    }
  });

  it.each([false, true])(
    'removes caller listeners after ordinary settlement (failure=%s)',
    async (fails) => {
      const regionalClient = client();
      if (fails) {
        (chat ? regionalClient.textChat : regionalClient.generateText).mockRejectedValueOnce(
          new Error('Generation unavailable'),
        );
      }
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const controller = new AbortController();
      const result = await provider(chat).callApi('Ordinary call', undefined, {
        abortSignal: controller.signal,
      });
      if (fails) {
        expect(result.error).toContain('Generation unavailable');
      } else {
        expect(result.output).toBe('Hello');
        expect(result.cost).toBeDefined();
      }
      expect(controller.signal.aborted).toBe(false);
      expect(getEventListeners(controller.signal, 'abort')).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

describe('WatsonX metadata cache boundaries', () => {
  it.each([
    ['different regions', { serviceUrl: 'https://jp-tok.ml.cloud.ibm.com' }],
    ['different accounts in the same region', { apiBearerToken: 'other-account-token' }],
    ['different API versions', { version: '2025-01-01' }],
  ])('isolates %s', async (_name, config) => {
    vi.useFakeTimers();
    const firstClient = client('class_c1', 'class_c1');
    const secondClient = client('class_9', 'class_9');
    const firstLookup = deferred<ReturnType<typeof metadata>>();
    const secondLookup = deferred<ReturnType<typeof metadata>>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    firstClient.listFoundationModelSpecs.mockImplementation(() => {
      firstStarted.resolve();
      return firstLookup.promise;
    });
    secondClient.listFoundationModelSpecs.mockImplementation(() => {
      secondStarted.resolve();
      return secondLookup.promise;
    });
    vi.mocked(WatsonXAI.newInstance)
      .mockReturnValueOnce(firstClient as any)
      .mockReturnValueOnce(secondClient as any);
    const first = provider();
    const second = provider(false, config);
    expect(await first.getClient()).toBe(firstClient);
    expect(await second.getClient()).toBe(secondClient);
    const pending = Promise.all([first.callApi('Hello'), second.callApi('Hello')]);
    await Promise.all([firstStarted.promise, secondStarted.promise]);
    firstLookup.resolve(metadata('class_c1', 'class_c1'));
    secondLookup.resolve(metadata('class_9', 'class_9'));
    const [firstResult, secondResult] = await pending;
    expect(firstResult.error).toBeUndefined();
    expect(secondResult.error).toBeUndefined();
    expect(firstResult.cost).toBeCloseTo((30 * 0.106) / 1e6, 12);
    expect(secondResult.cost).toBeCloseTo((30 * 0.371) / 1e6, 12);
    await first.callApi('Again');
    expect(firstClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
    expect(secondClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
  });

  it('isolates simultaneous metadata lookups for different models on one client', async () => {
    vi.useFakeTimers();
    const otherModelId = 'account/other-model';
    const regionalClient = client();
    const firstLookup = deferred<ReturnType<typeof metadata>>();
    const secondLookup = deferred<ReturnType<typeof metadata>>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    regionalClient.listFoundationModelSpecs.mockImplementation(
      ({ filters }: { filters: string }) => {
        if (filters === `modelid_${modelId}`) {
          firstStarted.resolve();
          return firstLookup.promise;
        }
        secondStarted.resolve();
        return secondLookup.promise;
      },
    );
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const first = provider();
    const second = provider(false, { modelId: otherModelId });
    expect(await first.getClient()).toBe(regionalClient);
    expect(await second.getClient()).toBe(regionalClient);
    const pending = Promise.all([first.callApi('First'), second.callApi('Second')]);
    await Promise.all([firstStarted.promise, secondStarted.promise]);
    firstLookup.resolve(metadata('class_c1', 'class_c1'));
    secondLookup.resolve(metadata('class_9', 'class_9', otherModelId));
    const [firstResult, secondResult] = await pending;
    expect(firstResult.error).toBeUndefined();
    expect(secondResult.error).toBeUndefined();
    expect(firstResult.cost).toBeCloseTo((30 * 0.106) / 1e6, 12);
    expect(secondResult.cost).toBeCloseTo((30 * 0.371) / 1e6, 12);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledWith({
      filters: `modelid_${otherModelId}`,
      signal: expect.any(AbortSignal),
    });
    await Promise.all([first.callApi('First again'), second.callApi('Second again')]);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
  });

  it('does not let a pending lookup repopulate a cleared metadata cache', async () => {
    vi.useFakeTimers();
    const regionalClient = client();
    const oldLookup = deferred<ReturnType<typeof metadata>>();
    const started = deferred<void>();
    regionalClient.listFoundationModelSpecs.mockImplementationOnce(() => {
      started.resolve();
      return oldLookup.promise;
    });
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider();
    const pending = instance.callApi('Before clearing metadata');
    await started.promise;
    clearModelSpecsCache();

    regionalClient.listFoundationModelSpecs.mockResolvedValue(metadata('class_9', 'class_9'));
    const fresh = await instance.callApi('After clearing metadata');
    expect(fresh.cost).toBeCloseTo((30 * 0.371) / 1e6, 12);
    oldLookup.resolve(metadata('class_1', 'class_1'));
    expect((await pending).cost).toBeCloseTo((30 * 0.636) / 1e6, 12);

    expect((await instance.callApi('After old lookup settles')).cost).toBe(fresh.cost);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { result: { resources: {} } },
    { result: { resources: [] } },
    {
      result: {
        resources: [
          { model_id: 'different-model', input_tier: 'class_c1', output_tier: 'class_c1' },
        ],
      },
    },
  ])('does not cache missing or malformed model metadata: %j', async (unavailable) => {
    const regionalClient = client();
    regionalClient.listFoundationModelSpecs.mockResolvedValueOnce(unavailable as any);
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider();
    expect((await instance.callApi('First')).cost).toBeUndefined();
    expect((await instance.callApi('Second')).cost).toBeDefined();
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
  });
});
