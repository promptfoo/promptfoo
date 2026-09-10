import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { AzureGenericProvider } from '../../src/providers/azure/generic';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import { AwsBedrockGenericProvider } from '../../src/providers/bedrock/base';
import { AwsBedrockEmbeddingProvider } from '../../src/providers/bedrock/index';
import { LumaRayVideoProvider } from '../../src/providers/bedrock/luma-ray';
import { NovaReelVideoProvider } from '../../src/providers/bedrock/nova-reel';
import {
  executeProviderFunctionCallback,
  FunctionCallbackHandler,
} from '../../src/providers/functionCallbackUtils';
import { GoogleAuthManager } from '../../src/providers/google/auth';
import { GoogleProvider } from '../../src/providers/google/provider';
import { VertexChatProvider, VertexEmbeddingProvider } from '../../src/providers/google/vertex';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import { fetchWithProxy } from '../../src/util/fetch';
import { createDeferred } from '../util/utils';

const mocks = vi.hoisted(() => ({ request: vi.fn(), bedrockSend: vi.fn(), s3Send: vi.fn() }));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  isCacheEnabled: vi.fn(),
  getCache: vi.fn(),
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
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor() {
      throw new Error('Cancellation tests must not initialize real Google credentials');
    }
  },
}));

beforeEach(() => {
  vi.mocked(isCacheEnabled).mockReset().mockReturnValue(false);
  vi.mocked(getCache).mockReset();
  mocks.request.mockReset();
  mocks.bedrockSend.mockReset();
  mocks.s3Send.mockReset();
  vi.mocked(fetchWithProxy).mockReset();
  // GoogleGenericProvider resolves project IDs through the auth manager directly,
  // while transport setup also uses the compatibility exports in google/util.
  vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
    client: { request: mocks.request },
    projectId: 'fixture-project',
  });
  vi.spyOn(GoogleAuthManager, 'resolveProjectId').mockResolvedValue('fixture-project');
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

it.each([
  ['OpenAI', OpenAiModerationProvider],
  ['Azure', AzureModerationProvider],
] as const)(
  '%s moderation rejects a settled cache hit after cancellation',
  async (_name, Provider) => {
    const controller = new AbortController();
    const reason = new Error('cancelled after cache settled');
    const started = createDeferred<void>();
    const read = createDeferred<string | { flags: never[] }>();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockReturnValue({
      get: vi.fn(() => {
        started.resolve();
        return read.promise;
      }),
    } as unknown as ReturnType<typeof getCache>);
    const provider = new Provider('moderation', {
      config: { apiKey: 'fixture-key', endpoint: 'https://fixture.invalid' },
    });
    const request = provider.callModerationApi('', 'hello', undefined, {
      abortSignal: controller.signal,
    });
    await Promise.race([
      started.promise,
      request.then(() => {
        throw new Error('Operation completed before cache read');
      }),
    ]);
    read.resolve(
      Provider === OpenAiModerationProvider ? JSON.stringify({ flags: [] }) : { flags: [] },
    );
    queueMicrotask(() => controller.abort(reason));
    await expect(request).rejects.toBe(reason);
  },
);

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

describe.each([VertexChatProvider, GoogleProvider])('%s authentication waits', (Provider) => {
  it('stops waiting for OAuth discovery without dispatching a request', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    const discovery = createDeferred<any>();
    const provider = new Provider('gemini-2.5-flash', {
      config: { vertexai: true, projectId: 'fixture-project' },
    });
    vi.spyOn(provider as any, 'getClientWithCredentials').mockImplementation(() => {
      started.resolve();
      return discovery.promise;
    });
    const pending = provider
      .callApi('hello', undefined, { abortSignal: controller.signal })
      .catch((error) => ({ error: String(error) }));
    await started.promise;
    controller.abort(new Error('cancelled discovery'));
    expect((await pending).error).toContain('cancelled discovery');
    discovery.resolve({ client: { request: mocks.request } });
    await Promise.resolve();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

it('stops waiting for Azure authentication while leaving shared initialization usable', async () => {
  const controller = new AbortController();
  const authentication = createDeferred<Record<string, string>>();
  vi.spyOn(AzureGenericProvider.prototype, 'getAuthHeaders').mockReturnValue(
    authentication.promise,
  );
  const provider = new AzureChatCompletionProvider('fixture', {
    config: { apiBaseUrl: 'http://127.0.0.1' },
  });
  const pending = provider.ensureInitialized(controller.signal);
  controller.abort(new Error('cancelled authentication'));
  await expect(pending).rejects.toThrow('cancelled authentication');
  authentication.resolve({ 'api-key': 'fixture' });
  await expect(provider.ensureInitialized()).resolves.toBeUndefined();
  await provider.cleanup();
});

it('does not dispatch Bedrock embedding after cancelled client initialization', async () => {
  const controller = new AbortController();
  const started = createDeferred<void>();
  const runtime = createDeferred<any>();
  const invokeModel = vi.fn();
  const provider = new AwsBedrockEmbeddingProvider('amazon.titan-embed-text-v2:0');
  vi.spyOn(provider, 'getBedrockInstance').mockImplementation(() => {
    started.resolve();
    return runtime.promise;
  });
  const pending = provider.callEmbeddingApi('hello', undefined, { abortSignal: controller.signal });
  await started.promise;
  controller.abort(new Error('cancelled embedding'));
  expect((await pending).error).toContain('cancelled embedding');
  runtime.resolve({ invokeModel });
  await Promise.resolve();
  expect(invokeModel).not.toHaveBeenCalled();
});

it('forwards cancellation to Bedrock embedding transport', async () => {
  const controller = new AbortController();
  const started = createDeferred<void>();
  const invokeModel = vi.fn((_input, options) => {
    started.resolve();
    return waitForAbort(options.abortSignal);
  });
  const provider = new AwsBedrockEmbeddingProvider('amazon.titan-embed-text-v2:0');
  vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ invokeModel } as any);
  const pending = provider.callEmbeddingApi('hello', undefined, { abortSignal: controller.signal });
  await started.promise;
  controller.abort(new Error('cancelled embedding'));
  expect((await pending).error).toContain('cancelled embedding');
  expect(invokeModel.mock.calls[0][1].abortSignal).toBe(controller.signal);
});

it('does not dispatch a Google callback after cancellation', async () => {
  const provider = new GoogleProvider('gemini-2.5-flash', { config: { apiKey: 'fixture' } });
  const callback = vi.fn();
  await expect(
    (provider as any).executeFunctionCallback(
      'tool',
      '{}',
      { functionToolCallbacks: { tool: callback } },
      undefined,
      AbortSignal.abort(new Error('cancelled callback')),
    ),
  ).rejects.toThrow('cancelled callback');
  expect(callback).not.toHaveBeenCalled();
});

it('stops waiting for a Google callback already in progress', async () => {
  const provider = new GoogleProvider('gemini-2.5-flash', { config: { apiKey: 'fixture' } });
  const controller = new AbortController();
  const started = createDeferred<void>();
  const result = createDeferred<string>();
  const callback = vi.fn(() => {
    started.resolve();
    return result.promise;
  });
  const pending = (provider as any).executeFunctionCallback(
    'tool',
    '{}',
    { functionToolCallbacks: { tool: callback } },
    undefined,
    controller.signal,
  );
  await started.promise;
  controller.abort(new Error('cancelled callback'));
  await expect(pending).rejects.toThrow('cancelled callback');
  result.resolve('late result');
});

it.each([false, true])('forwards Anthropic cancellation with streaming=%s', async (stream) => {
  const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
    config: { apiKey: 'fixture', stream },
  });
  const controller = new AbortController();
  const started = createDeferred<void>();
  const messages = (provider as any).anthropic.messages;
  const request = vi
    .spyOn(messages, stream ? 'stream' : 'create')
    .mockImplementation((_params, options: any) => {
      expect(options.signal).toBe(controller.signal);
      started.resolve();
      return waitForAbort(options.signal);
    });
  const pending = provider.callApi('hello', undefined, { abortSignal: controller.signal });
  await started.promise;
  controller.abort(new Error('cancelled Anthropic'));
  expect((await pending).error).toContain('cancelled Anthropic');
  expect(request).toHaveBeenCalledOnce();
  await provider.cleanup();
});

it.each(['direct', 'handler'])(
  'cancels pending shared callbacks through the %s adapter',
  async (adapter) => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    const result = createDeferred<string>();
    const callbacks = {
      fixture: () => {
        started.resolve();
        return result.promise;
      },
    };
    const pending =
      adapter === 'direct'
        ? executeProviderFunctionCallback({
            functionName: 'fixture',
            args: '{}',
            callbacks,
            cache: {},
            signal: controller.signal,
          })
        : new FunctionCallbackHandler().processCalls(
            { name: 'fixture', arguments: '{}' },
            callbacks,
            undefined,
            { abortSignal: controller.signal },
          );
    await started.promise;
    controller.abort(new Error('cancelled shared callback'));
    await expect(pending).rejects.toThrow('cancelled shared callback');
    result.resolve('late result');
  },
);
