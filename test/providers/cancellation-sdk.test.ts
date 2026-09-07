import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import { AwsBedrockGenericProvider } from '../../src/providers/bedrock/base';
import { LumaRayVideoProvider } from '../../src/providers/bedrock/luma-ray';
import { NovaReelVideoProvider } from '../../src/providers/bedrock/nova-reel';
import { GoogleAuthManager } from '../../src/providers/google/auth';
import { GoogleProvider } from '../../src/providers/google/provider';
import { VertexChatProvider, VertexEmbeddingProvider } from '../../src/providers/google/vertex';
import { fetchWithProxy } from '../../src/util/fetch';
import { createDeferred } from '../util/utils';

const mocks = vi.hoisted(() => ({ request: vi.fn(), bedrockSend: vi.fn(), s3Send: vi.fn() }));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  isCacheEnabled: () => false,
}));
vi.mock('../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal()),
  getGoogleClient: async () => ({ client: { request: mocks.request } }),
  loadCredentials: async () => undefined,
  resolveProjectId: async () => 'fixture-project',
}));
vi.mock('../../src/util/fetch', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithProxy: vi.fn(),
}));
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = mocks.bedrockSend;
  },
  StartAsyncInvokeCommand: class {},
  GetAsyncInvokeCommand: class {},
}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mocks.s3Send;
  },
  GetObjectCommand: class {},
}));
vi.mock('../../src/logger');

beforeEach(() => {
  mocks.request.mockReset();
  mocks.bedrockSend.mockReset();
  mocks.s3Send.mockReset();
  vi.mocked(fetchWithProxy).mockReset();
  vi.spyOn(AwsBedrockGenericProvider.prototype, 'getCredentials').mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function waitForAbort(signal: AbortSignal | null | undefined): Promise<never> {
  if (!signal) {
    throw new Error('Missing abort signal');
  }
  signal.throwIfAborted();
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

const vertexModels = ['gemini-2.5-flash', 'claude-sonnet-4', 'llama-3', 'chat-bison'];
const googleOperations = [
  ...vertexModels.map((model) => ({
    name: `Vertex ${model}`,
    call: (signal: AbortSignal) =>
      new VertexChatProvider(model, {
        config: { projectId: 'fixture-project', region: 'us-central1' },
      }).callApi('hello', undefined, { abortSignal: signal }),
  })),
  {
    name: 'Vertex embedding',
    call: (signal: AbortSignal) =>
      new VertexEmbeddingProvider('gemini-embedding-001').callEmbeddingApi('hello', undefined, {
        abortSignal: signal,
      }),
  },
  {
    name: 'Google OAuth',
    call: (signal: AbortSignal) =>
      new GoogleProvider('gemini-2.5-flash', {
        config: { vertexai: true, projectId: 'fixture-project' },
      }).callApi('hello', undefined, { abortSignal: signal }),
  },
];

describe.each(googleOperations)('$name SDK cancellation', ({ call }) => {
  beforeEach(() => {
    vi.spyOn(GoogleAuthManager, 'getApiKey').mockReturnValue({ apiKey: undefined, source: 'none' });
  });

  it('does not dispatch after cancellation', async () => {
    await expect(call(AbortSignal.abort(new Error('cancelled')))).rejects.toThrow('cancelled');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('cancels the active OAuth request', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    mocks.request.mockImplementation((request) => {
      expect(request.signal).toBe(controller.signal);
      started.resolve();
      return waitForAbort(request.signal);
    });
    const result = call(controller.signal).catch((error) => ({ error: String(error) }));
    await Promise.race([
      started.promise,
      result.then((response) => {
        throw new Error(response.error || 'Operation completed before dispatch');
      }),
    ]);
    controller.abort(new Error('cancelled'));
    expect((await result).error).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledOnce();
  });
});

describe.each([
  ['Vertex', VertexChatProvider],
  ['Google', GoogleProvider],
] as const)('%s express cancellation', (_name, Provider) => {
  it('preserves the transport deadline when a caller signal is present', async () => {
    const caller = new AbortController();
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const started = createDeferred<void>();
    vi.mocked(fetchWithProxy).mockImplementation(async (_url, request) => {
      started.resolve();
      return waitForAbort(request?.signal);
    });
    const provider = new Provider('gemini-2.5-flash', {
      config: { vertexai: true, apiKey: 'fixture-key' },
    });
    const result = provider.callApi('hello', undefined, { abortSignal: caller.signal });
    await Promise.race([
      started.promise,
      result.then((response) => {
        throw new Error(response.error || 'Operation completed before dispatch');
      }),
    ]);
    deadline.abort(new Error('deadline exceeded'));
    expect((await result).error).toContain('deadline exceeded');
    expect(caller.signal.aborted).toBe(false);
  });

  it('combines caller cancellation with the transport timeout', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    let transportSignal: AbortSignal | null | undefined;
    vi.mocked(fetchWithProxy).mockImplementation(async (_url, request) => {
      transportSignal = request?.signal;
      started.resolve();
      return waitForAbort(transportSignal);
    });
    const provider = new Provider('gemini-2.5-flash', {
      config: { vertexai: true, apiKey: 'fixture-key' },
    });
    const result = provider.callApi('hello', undefined, { abortSignal: controller.signal });
    await Promise.race([
      started.promise,
      result.then((response) => {
        throw new Error(response.error || 'Operation completed before dispatch');
      }),
    ]);
    expect(transportSignal?.aborted).toBe(false);
    controller.abort(new Error('cancelled'));
    expect((await result).error).toContain('cancelled');
    expect(transportSignal?.aborted).toBe(true);
  });
});

describe('Azure moderation cancellation', () => {
  const create = () =>
    new AzureModerationProvider('text-content-safety', {
      config: { apiKey: 'fixture-key', endpoint: 'https://fixture.invalid' },
    });
  it('does not dispatch after cancellation', async () => {
    await expect(
      create().callModerationApi('hello', 'hello', undefined, {
        abortSignal: AbortSignal.abort(new Error('cancelled')),
      }),
    ).rejects.toThrow('cancelled');
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });
  it('interrupts the active moderation request', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    vi.mocked(fetchWithProxy).mockImplementation(async (_url, request) => {
      started.resolve();
      return waitForAbort(request?.signal);
    });
    const result = create().callModerationApi('hello', 'hello', undefined, {
      abortSignal: controller.signal,
    });
    await Promise.race([
      started.promise,
      result.then((response) => {
        throw new Error(response.error || 'Operation completed before dispatch');
      }),
    ]);
    controller.abort(new Error('cancelled'));
    expect((await result).error).toContain('cancelled');
  });
});

describe.each([
  ['Nova Reel', NovaReelVideoProvider],
  ['Luma Ray', LumaRayVideoProvider],
] as const)('%s job cancellation', (_name, Provider) => {
  const create = () =>
    new Provider(undefined, {
      config: { s3OutputUri: 's3://fixture/videos', pollIntervalMs: 60_000 },
    });

  it('does not submit a cancelled job', async () => {
    await expect(
      create().callApi('hello', undefined, {
        abortSignal: AbortSignal.abort(new Error('cancelled')),
      }),
    ).rejects.toThrow('cancelled');
    expect(mocks.bedrockSend).not.toHaveBeenCalled();
  });

  it('forwards cancellation during submission', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    mocks.bedrockSend.mockImplementation((_command, request) => {
      expect(request.abortSignal).toBe(controller.signal);
      started.resolve();
      return waitForAbort(request.abortSignal);
    });
    const result = create().callApi('hello', undefined, { abortSignal: controller.signal });
    await Promise.race([
      started.promise,
      result.then((response) => {
        throw new Error(response.error || 'Operation completed before dispatch');
      }),
    ]);
    controller.abort(new Error('cancelled'));
    expect((await result).error).toContain('cancelled');
    expect(mocks.bedrockSend).toHaveBeenCalledOnce();
  });

  it('interrupts the polling wait without another poll or download', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mocks.bedrockSend
      .mockResolvedValueOnce({ invocationArn: 'fixture-job' })
      .mockResolvedValue({ status: 'InProgress' });
    const result = create().callApi('hello', undefined, { abortSignal: controller.signal });
    await vi.waitFor(() => expect(mocks.bedrockSend).toHaveBeenCalledTimes(2));
    expect(mocks.bedrockSend.mock.calls[1][1].abortSignal).toBe(controller.signal);
    controller.abort();
    expect((await result).error).toContain('cancelled by user');
    expect(mocks.bedrockSend).toHaveBeenCalledTimes(2);
    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
