import { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { providerRegistry } from '../../src/providers/providerRegistry';
import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';

const {
  runtimes,
  mockRuntimeClient,
  mockInvokeEndpointCommand,
  mockSend,
  mockCacheGet,
  mockIsCacheEnabled,
  mockResolveDefaultsModeConfig,
} = vi.hoisted(() => ({
  runtimes: [] as { region: string; send: Mock; destroy: Mock }[],
  mockRuntimeClient: vi.fn(),
  mockInvokeEndpointCommand: vi.fn(),
  mockSend: vi.fn(),
  mockCacheGet: vi.fn(),
  mockIsCacheEnabled: vi.fn(),
  mockResolveDefaultsModeConfig: vi.fn(),
}));

vi.mock('@smithy/core/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@smithy/core/config')>()),
  resolveDefaultsModeConfig: mockResolveDefaultsModeConfig,
}));

vi.mock('@aws-sdk/client-sagemaker-runtime', () => ({
  SageMakerRuntimeClient: mockRuntimeClient,
  InvokeEndpointCommand: mockInvokeEndpointCommand,
}));

vi.mock('../../src/cache', () => ({
  isCacheEnabled: mockIsCacheEnabled,
  getCache: () => ({ get: mockCacheGet, set: vi.fn() }),
}));

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function response(region: string) {
  return {
    Body: new TextEncoder().encode(JSON.stringify({ output: region, embedding: [0.1, 0.2] })),
  };
}

describe('SageMaker runtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimes.length = 0;
    mockRuntimeClient.mockReset().mockImplementation(function ({ region }) {
      const runtime = {
        region,
        send: vi.fn((command, options) => mockSend(command, region, options)),
        destroy: vi.fn(),
      };
      runtimes.push(runtime);
      return runtime;
    });
    mockInvokeEndpointCommand.mockReset().mockImplementation(function (input) {
      return input;
    });
    mockSend.mockReset().mockImplementation(async (_command, region) => response(region));
    mockCacheGet.mockReset();
    mockIsCacheEnabled.mockReset().mockReturnValue(false);
    mockResolveDefaultsModeConfig.mockReset().mockReturnValue(async () => 'legacy');
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('releases owned clients when requests finish and supports later reuse', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const credentials = vi.spyOn(provider, 'getCredentials');
    for (const region of ['us-east-1', 'us-west-2', 'us-east-1']) {
      provider.config.region = region;
      expect(await provider.callApi('A garden')).toMatchObject({ output: region });
      expect(runtimes.every((runtime) => runtime.destroy.mock.calls.length === 1)).toBe(true);
    }
    expect(SageMakerRuntimeClient).toHaveBeenCalledTimes(3);
    expect(credentials).toHaveBeenCalledTimes(3);
    await provider.cleanup();
    expect(runtimes.every((runtime) => runtime.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('shares pending initialization between concurrent requests to the same region', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const started = deferred<void>();
    const secondStarted = deferred<void>();
    const credentialsReady = deferred<void>();
    const credentials = vi.spyOn(provider, 'getCredentials').mockImplementation(async () => {
      started.resolve();
      await credentialsReady.promise;
    });
    const getRuntime = provider.getSageMakerRuntimeInstance.bind(provider);
    const acquireRuntime = vi.spyOn(provider, 'getSageMakerRuntimeInstance');
    acquireRuntime.mockImplementation((...args) => {
      const runtime = getRuntime(...args);
      if (acquireRuntime.mock.calls.length === 2) {
        secondStarted.resolve();
      }
      return runtime;
    });
    const first = provider.callApi('First garden');
    await started.promise;
    const second = provider.callApi('Second garden');
    await secondStarted.promise;
    credentialsReady.resolve();
    expect(await Promise.all([first, second])).toEqual([
      expect.objectContaining({ output: 'us-east-1' }),
      expect.objectContaining({ output: 'us-east-1' }),
    ]);
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(SageMakerRuntimeClient).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('keeps an earlier region client alive while its request is in flight', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const started = deferred<void>();
    const firstResponse = deferred<ReturnType<typeof response>>();
    mockSend.mockImplementationOnce(() => {
      started.resolve();
      return firstResponse.promise;
    });
    const first = provider.callApi('First garden');
    await started.promise;
    provider.config.region = 'us-west-2';
    expect(await provider.callApi('Second garden')).toMatchObject({ output: 'us-west-2' });
    expect(runtimes[0].destroy).not.toHaveBeenCalled();
    firstResponse.resolve(response('us-east-1'));
    expect(await first).toMatchObject({ output: 'us-east-1' });
    await provider.cleanup();
    expect(runtimes.map((runtime) => runtime.destroy.mock.calls.length)).toEqual([1, 1]);
  });

  it('cleans up displaced owned clients while leaving an injected client untouched', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    await provider.getSageMakerRuntimeInstance('us-east-1');
    const injected = { send: vi.fn().mockResolvedValue(response('borrowed')), destroy: vi.fn() };
    provider.sagemakerRuntime = injected;
    const credentials = vi.spyOn(provider, 'getCredentials');
    for (const region of ['us-east-1', 'us-west-2']) {
      provider.config.region = region;
      expect(await provider.callApi('A garden')).toMatchObject({ output: 'borrowed' });
    }
    await provider.cleanup();
    expect(runtimes[0].destroy).toHaveBeenCalledOnce();
    expect(injected.destroy).not.toHaveBeenCalled();
    expect(provider.sagemakerRuntime).toBe(injected);
    expect(await provider.callApi('Another garden')).toMatchObject({ output: 'borrowed' });
    expect(credentials).not.toHaveBeenCalled();
    expect(SageMakerRuntimeClient).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite an injected client when older initialization finishes', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const started = deferred<void>();
    const credentialsReady = deferred<void>();
    vi.spyOn(provider, 'getCredentials').mockImplementation(async () => {
      started.resolve();
      await credentialsReady.promise;
    });
    const first = provider.callApi('First garden');
    await started.promise;
    const injected = { send: vi.fn().mockResolvedValue(response('borrowed')), destroy: vi.fn() };
    provider.sagemakerRuntime = injected;
    credentialsReady.resolve();
    expect(await first).toMatchObject({ output: 'us-east-1' });
    expect(await provider.callApi('Second garden')).toMatchObject({ output: 'borrowed' });
    await provider.cleanup();
    expect(runtimes[0].destroy).toHaveBeenCalledOnce();
    expect(injected.destroy).not.toHaveBeenCalled();
  });

  it('retries initialization after a credential failure', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const credentials = vi
      .spyOn(provider, 'getCredentials')
      .mockRejectedValueOnce(new Error('Credentials unavailable'))
      .mockResolvedValue(undefined);
    await expect(provider.callApi('First garden')).rejects.toThrow();
    expect(await provider.callApi('Second garden')).toMatchObject({ output: 'us-east-1' });
    expect(credentials).toHaveBeenCalledTimes(2);
    expect(SageMakerRuntimeClient).toHaveBeenCalledTimes(1);
  });

  it('attempts every owned client cleanup even when one destroy fails', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    await provider.getSageMakerRuntimeInstance('us-east-1');
    await provider.getSageMakerRuntimeInstance('us-west-2');
    runtimes[0].destroy.mockImplementation(() => {
      throw new Error('Destroy failed');
    });
    expect(() => provider.cleanup()).not.toThrow();
    expect(runtimes.map((runtime) => runtime.destroy.mock.calls.length)).toEqual([1, 1]);
  });

  it('invalidates pending initialization without waiting for credentials or blocking a new call', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const started = deferred<void>();
    const credentialsReady = deferred<void>();
    vi.spyOn(provider, 'getCredentials')
      .mockImplementationOnce(async () => {
        started.resolve();
        await credentialsReady.promise;
      })
      .mockResolvedValue(undefined);
    const stale = provider.callApi('Old garden').catch((error) => ({ error: String(error) }));
    await started.promise;
    await provider.cleanup();
    expect(await provider.callApi('New garden')).toMatchObject({ output: 'us-east-1' });
    credentialsReady.resolve();
    expect(await stale).toMatchObject({ error: expect.stringContaining('shut down') });
    expect(SageMakerRuntimeClient).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    await provider.cleanup();
    expect(runtimes[0].destroy).toHaveBeenCalledOnce();
  });

  it('ignores global shutdown while its own request is active', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const started = deferred<void>();
    const finished = deferred<ReturnType<typeof response>>();
    mockSend.mockImplementationOnce(() => {
      started.resolve();
      return finished.promise;
    });
    const pending = provider.callApi('A garden');
    await started.promise;
    await providerRegistry.shutdownAll();
    expect(runtimes[0].destroy).not.toHaveBeenCalled();
    finished.resolve(response('us-east-1'));
    expect(await pending).toMatchObject({ output: 'us-east-1' });
    expect(runtimes[0].destroy).toHaveBeenCalledOnce();
  });

  it('aborts active sends before destroying their owned client', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const started = deferred<AbortSignal>();
    mockSend.mockImplementationOnce((_command, _region, { abortSignal }) => {
      started.resolve(abortSignal);
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
      });
    });
    const pending = provider.callApi('A garden');
    const result = expect(pending).rejects.toThrow('shut down');
    const signal = await started.promise;
    runtimes[0].destroy.mockImplementation(() => expect(signal.aborted).toBe(true));
    provider.cleanup();
    await result;
    expect(runtimes[0].destroy).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledOnce();
    expect(await provider.callApi('Another garden')).toMatchObject({ output: 'us-east-1' });
    expect(runtimes[1].destroy).toHaveBeenCalledOnce();
  });

  it('preserves a caller abort reason without aborting another call on the shared client', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    const secondResponse = deferred<ReturnType<typeof response>>();
    const reason = { message: 'Caller cancelled this row' };
    const controller = new AbortController();
    mockSend
      .mockImplementationOnce((_command, _region, { abortSignal }) => {
        firstStarted.resolve();
        return new Promise((_resolve, reject) => {
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        });
      })
      .mockImplementationOnce(() => {
        secondStarted.resolve();
        return secondResponse.promise;
      });
    const first = provider.callApi('First garden', undefined, { abortSignal: controller.signal });
    const firstResult = expect(first).rejects.toBe(reason);
    await firstStarted.promise;
    const second = provider.callApi('Second garden');
    await secondStarted.promise;
    controller.abort(reason);
    await firstResult;
    expect(SageMakerRuntimeClient).toHaveBeenCalledOnce();
    expect(runtimes[0].destroy).not.toHaveBeenCalled();
    secondResponse.resolve(response('us-east-1'));
    expect(await second).toMatchObject({ output: 'us-east-1' });
    expect(runtimes[0].destroy).toHaveBeenCalledOnce();
  });

  it('keeps shared initialization alive when only one waiting caller aborts', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const started = deferred<void>();
    const credentialsReady = deferred<void>();
    const secondStarted = deferred<void>();
    const credentials = vi.spyOn(provider, 'getCredentials').mockImplementation(async () => {
      started.resolve();
      await credentialsReady.promise;
    });
    const getRuntime = provider.getSageMakerRuntimeInstance.bind(provider);
    const acquire = vi
      .spyOn(provider, 'getSageMakerRuntimeInstance')
      .mockImplementation((...args) => {
        const runtime = getRuntime(...args);
        if (acquire.mock.calls.length === 2) {
          secondStarted.resolve();
        }
        return runtime;
      });
    const controller = new AbortController();
    const reason = new Error('Only cancel the first row');
    const first = provider.callApi('First garden', undefined, { abortSignal: controller.signal });
    const firstResult = expect(first).rejects.toBe(reason);
    await started.promise;
    const second = provider.callApi('Second garden');
    await secondStarted.promise;
    controller.abort(reason);
    await firstResult;
    credentialsReady.resolve();
    expect(await second).toMatchObject({ output: 'us-east-1' });
    expect(credentials).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledOnce();
    expect(runtimes[0].destroy).toHaveBeenCalledOnce();
  });

  it('preserves a borrowed client when aborting a call', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { modelType: 'custom' },
    });
    const started = deferred<void>();
    const borrowed = {
      send: vi.fn((_command, { abortSignal }) => {
        started.resolve();
        return new Promise((_resolve, reject) => {
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        });
      }),
      destroy: vi.fn(),
    };
    provider.sagemakerRuntime = borrowed;
    const result = expect(provider.callApi('A garden')).rejects.toThrow('shut down');
    await started.promise;
    provider.cleanup();
    await result;
    expect(borrowed.destroy).not.toHaveBeenCalled();
    expect(provider.sagemakerRuntime).toBe(borrowed);
    expect(SageMakerRuntimeClient).not.toHaveBeenCalled();
  });

  it('does not start work when the caller has already aborted', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { modelType: 'custom' },
    });
    const transformation = vi.spyOn(provider, 'applyTransformation');
    const reason = new Error('Already cancelled');
    await expect(
      provider.callApi('A garden', undefined, { abortSignal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(transformation).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(SageMakerRuntimeClient).not.toHaveBeenCalled();
  });

  describe.each(['completion', 'embedding'] as const)('%s delayed continuations', (kind) => {
    function createProvider() {
      const options = { config: { region: 'us-east-1', modelType: 'custom' as const } };
      return kind === 'completion'
        ? new SageMakerCompletionProvider('endpoint', options)
        : new SageMakerEmbeddingProvider('endpoint', options);
    }

    function call(provider: ReturnType<typeof createProvider>, abortSignal?: AbortSignal) {
      return provider instanceof SageMakerEmbeddingProvider
        ? provider.callEmbeddingApi('A garden', undefined, { abortSignal })
        : provider.callApi('A garden', undefined, { abortSignal });
    }

    it('aborts an active send when cleaned up', async () => {
      const provider = createProvider();
      const started = deferred<AbortSignal>();
      mockSend.mockImplementationOnce((_command, _region, { abortSignal }) => {
        started.resolve(abortSignal);
        return new Promise((_resolve, reject) => {
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        });
      });
      const result = expect(call(provider)).rejects.toThrow('shut down');
      const signal = await started.promise;
      provider.cleanup();
      await result;
      expect(signal.aborted).toBe(true);
      expect(runtimes[0].destroy).toHaveBeenCalledOnce();
    });

    it('does not initialize a client or credentials for a cache hit', async () => {
      const provider = createProvider();
      const credentials = vi.spyOn(provider, 'getCredentials');
      mockIsCacheEnabled.mockReturnValue(true);
      mockCacheGet.mockResolvedValue(JSON.stringify({ output: 'cached', embedding: [0.1, 0.2] }));
      expect(await call(provider)).toMatchObject({ cached: true });
      expect(credentials).not.toHaveBeenCalled();
      expect(SageMakerRuntimeClient).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('clears the delay immediately when its caller aborts', async () => {
      vi.useFakeTimers();
      const provider = createProvider();
      provider.delay = 60_000;
      const controller = new AbortController();
      const reason = { message: 'Cancel the delayed request' };
      const result = expect(call(provider, controller.signal)).rejects.toBe(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);

      controller.abort(reason);

      expect(vi.getTimerCount()).toBe(0);
      await result;
      expect(SageMakerRuntimeClient).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it.each(['caller abort', 'cleanup'] as const)(
      'does not allocate a delay when a transform resumes after %s',
      async (cancellation) => {
        vi.useFakeTimers();
        const provider = createProvider();
        provider.delay = 60_000;
        const started = deferred<void>();
        const transformed = deferred<string>();
        provider.transform = async () => {
          started.resolve();
          return transformed.promise;
        };
        const controller = new AbortController();
        const result = expect(call(provider, controller.signal)).rejects.toThrow();
        await started.promise;
        if (cancellation === 'caller abort') {
          controller.abort(new Error('Cancelled before the delay'));
        } else {
          provider.cleanup();
        }
        await result;
        transformed.resolve('A garden');
        await vi.advanceTimersByTimeAsync(0);

        expect(vi.getTimerCount()).toBe(0);
        expect(SageMakerRuntimeClient).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
      },
    );

    it('keeps another caller delay live when one caller aborts', async () => {
      vi.useFakeTimers();
      const provider = createProvider();
      provider.delay = 60_000;
      const bothAtDelay = deferred<void>();
      const delayTimers = new Set<ReturnType<typeof setTimeout>>();
      const schedule = globalThis.setTimeout;
      const timerSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation((callback, ms, ...args) => {
          const timer = schedule(callback, ms, ...args);
          if (ms === 60_000) {
            delayTimers.add(timer);
            if (delayTimers.size === 2) {
              bothAtDelay.resolve();
            }
          }
          return timer;
        });
      const controller = new AbortController();
      const first = call(provider, controller.signal);
      const second = call(provider);
      const settlesBeforeDelay = (pending: Promise<unknown>, caller: string) =>
        pending.then(
          () => {
            throw new Error(`${caller} finished before both delays registered`);
          },
          (cause) => {
            throw Object.assign(new Error(`${caller} failed before both delays registered`), {
              cause,
            });
          },
        );

      try {
        await Promise.race([
          bothAtDelay.promise,
          settlesBeforeDelay(first, 'First caller'),
          settlesBeforeDelay(second, 'Second caller'),
        ]);
        expect(delayTimers.size).toBe(2);
        expect(vi.getTimerCount()).toBe(2);
        const firstAborted = expect(first).rejects.toThrow('Cancel first');
        controller.abort(new Error('Cancel first'));
        await firstAborted;

        expect(vi.getTimerCount()).toBe(1);
        expect(mockSend).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(60_000);
        await expect(second).resolves.toMatchObject(
          kind === 'completion' ? { output: 'us-east-1' } : { embedding: [0.1, 0.2] },
        );
        expect(mockSend).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        provider.cleanup();
        await Promise.allSettled([first, second]);
        timerSpy.mockRestore();
      }
    });

    it.each(['cache lookup', 'transform', 'delay', 'client acquisition'] as const)(
      'does not create or send through a client after cleanup during %s',
      async (stage) => {
        const provider = createProvider();
        const credentials = vi.spyOn(provider, 'getCredentials');
        const started = deferred<void>();
        const continueRequest = deferred<void>();
        if (stage === 'cache lookup') {
          mockIsCacheEnabled.mockReturnValue(true);
          mockCacheGet.mockImplementation(async () => {
            started.resolve();
            await continueRequest.promise;
          });
        } else if (stage === 'transform') {
          provider.transform = async (prompt) => {
            started.resolve();
            await continueRequest.promise;
            return prompt;
          };
        } else if (stage === 'delay') {
          vi.useFakeTimers();
          provider.delay = 100;
        } else {
          const getRuntime = provider.getSageMakerRuntimeInstance.bind(provider);
          vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
            const runtime = await getRuntime(...args);
            await provider.cleanup();
            return runtime;
          });
        }
        const result = call(provider).catch((error) => ({ error: String(error) }));
        if (stage === 'delay') {
          await vi.advanceTimersByTimeAsync(0);
          expect(vi.getTimerCount()).toBe(1);
          await provider.cleanup();
          expect(vi.getTimerCount()).toBe(0);
        } else if (stage !== 'client acquisition') {
          await started.promise;
          await provider.cleanup();
          continueRequest.resolve();
        }
        expect(await result).toMatchObject({ error: expect.stringContaining('shut down') });
        expect(mockSend).not.toHaveBeenCalled();
        if (stage === 'client acquisition') {
          expect(runtimes[0].destroy).toHaveBeenCalledOnce();
        } else {
          expect(SageMakerRuntimeClient).not.toHaveBeenCalled();
          expect(credentials).not.toHaveBeenCalled();
        }
      },
    );
  });
});
