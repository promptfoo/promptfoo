import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsAgentsProvider } from '../../../../src/providers/elevenlabs/agents';
import { ElevenLabsAPIError } from '../../../../src/providers/elevenlabs/errors';
import { ProviderRegistry, providerRegistry } from '../../../../src/providers/providerRegistry';

const client = vi.hoisted(() => ({ post: vi.fn(), delete: vi.fn() }));
vi.mock('../../../../src/providers/elevenlabs/client', () => ({
  ElevenLabsClient: class {
    post = client.post;
    delete = client.delete;
  },
}));
vi.mock('../../../../src/logger');

beforeEach(() => {
  let nextId = 0;
  client.post
    .mockReset()
    .mockImplementation(async (path: string) =>
      path.endsWith('/create')
        ? { agent_id: `owned-${++nextId}` }
        : { status: 'completed', simulated_conversation: [] },
    );
  client.delete.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
});

const createProvider = () =>
  new ElevenLabsAgentsProvider('agent', {
    config: { apiKey: 'fixture', agentConfig: { prompt: 'hello' } },
  });

describe('ephemeral agent lifecycle', () => {
  it.each([
    { recovered: true, terminal: true },
    { recovered: false, terminal: true },
    { recovered: false, terminal: false },
  ])(
    'retries failed idle deletion once at shutdown ($recovered, terminal=$terminal)',
    async ({ recovered, terminal }) => {
      const registry = new ProviderRegistry(false);
      vi.spyOn(providerRegistry, 'register').mockImplementation(registry.register.bind(registry));
      vi.spyOn(providerRegistry, 'unregister').mockImplementation(
        registry.unregister.bind(registry),
      );
      vi.spyOn(providerRegistry, 'useResource').mockImplementation(
        registry.useResource.bind(registry),
      );
      vi.spyOn(providerRegistry, 'throwIfResourceUseAborted').mockImplementation(
        registry.throwIfResourceUseAborted.bind(registry),
      );
      vi.spyOn(providerRegistry, 'retainForProcessShutdown').mockImplementation(
        registry.retainForProcessShutdown.bind(registry),
      );
      client.delete.mockRejectedValue(new Error('unavailable'));
      const provider = createProvider();
      await registry.withEvaluation(() =>
        registry.withProvider(provider, () => provider.callApi('hello')),
      );
      expect(client.delete).toHaveBeenCalledOnce();
      if (recovered) {
        client.delete.mockResolvedValue(undefined);
      }
      await (terminal ? registry.shutdownForProcess() : registry.shutdownAll());
      expect(client.delete.mock.calls.map(([path]) => path)).toEqual([
        '/convai/agents/owned-1',
        '/convai/agents/owned-1',
      ]);
      await (terminal ? registry.shutdownForProcess() : registry.shutdownAll());
      expect(client.delete).toHaveBeenCalledTimes(2);
    },
  );

  it('aborts pending creation during cleanup and can create a new agent later', async () => {
    let creationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      creationStarted = resolve;
    });
    client.post.mockImplementationOnce(
      (_path: string, _body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          creationStarted();
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );
    const provider = createProvider();
    const call = provider.callApi('hello');
    await started;
    await provider.cleanup();
    expect((await call).error).toContain('aborted');
    expect(client.delete).not.toHaveBeenCalled();

    expect(
      (
        await providerRegistry.withEvaluation(() =>
          providerRegistry.withProvider(provider, () => provider.callApi('again')),
        )
      ).error,
    ).toBeUndefined();
    expect(client.delete).toHaveBeenCalledOnce();
  });

  it('starts a fresh creation when a direct caller retries immediately after cancellation', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    client.post.mockImplementationOnce(
      (_path, _body, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
          started();
        }),
    );
    const provider = createProvider();
    const controller = new AbortController();
    const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
    await ready;
    controller.abort();
    expect((await first).error).toContain('aborted');
    expect((await provider.callApi('replacement')).error).toBeUndefined();
    expect(client.post.mock.calls.filter(([path]) => path.endsWith('/create'))).toHaveLength(2);
  });

  it('creates a fresh agent after each evaluation, including with a new instance', async () => {
    const provider = createProvider();
    for (const current of [provider, provider, createProvider()]) {
      const result = await providerRegistry.withEvaluation(() =>
        providerRegistry.withProvider(current, () => current.callApi('hello')),
      );
      expect(result.error).toBeUndefined();
    }
    expect(client.delete.mock.calls.map(([path]) => path)).toEqual([
      '/convai/agents/owned-1',
      '/convai/agents/owned-2',
      '/convai/agents/owned-3',
    ]);
    for (const [, options] of client.delete.mock.calls) {
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('coalesces creation within an instance but keeps different instances independent', async () => {
    const first = createProvider();
    const second = createProvider();
    await providerRegistry.withEvaluation(async () => {
      const results = await Promise.all([
        first.callApi('a'),
        first.callApi('b'),
        second.callApi('c'),
      ]);
      expect(results.map((result) => result.metadata?.agentId)).toEqual([
        'owned-1',
        'owned-1',
        'owned-2',
      ]);
    });
    expect(client.delete).toHaveBeenCalledTimes(2);
    expect(client.post.mock.calls.filter(([path]) => path.endsWith('/create'))).toHaveLength(2);
  });

  it('does not delete a user supplied agent', async () => {
    const provider = new ElevenLabsAgentsProvider('agent', {
      config: { apiKey: 'fixture', agentId: 'user-owned' },
    });
    await providerRegistry.withEvaluation(() =>
      providerRegistry.withProvider(provider, () => provider.callApi('hello')),
    );
    expect(client.delete).not.toHaveBeenCalled();
  });

  it('retries creation after a failed request', async () => {
    client.post.mockRejectedValueOnce(new Error('creation failed'));
    const provider = createProvider();
    expect((await provider.callApi('hello')).error).toContain('creation failed');
    expect(
      (
        await providerRegistry.withEvaluation(() =>
          providerRegistry.withProvider(provider, () => provider.callApi('again')),
        )
      ).error,
    ).toBeUndefined();
    expect(client.delete).toHaveBeenCalledOnce();
  });

  it('creates a fresh agent while retrying an ambiguous deletion', async () => {
    client.delete.mockRejectedValueOnce(new Error('temporary failure'));
    const provider = createProvider();
    await provider.callApi('hello');
    await provider.cleanup();
    expect((await provider.callApi('again')).metadata?.agentId).toBe('owned-2');
    await provider.cleanup();
    expect(client.post.mock.calls.filter(([path]) => path.endsWith('/create'))).toHaveLength(2);
    expect(client.delete.mock.calls.map(([path]) => path)).toEqual([
      '/convai/agents/owned-1',
      '/convai/agents/owned-1',
      '/convai/agents/owned-2',
    ]);
  });

  it('aborts a pending simulation during cleanup and permits reuse', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    client.post
      .mockImplementationOnce(async () => ({ agent_id: 'owned-1' }))
      .mockImplementationOnce(
        (_path, _body, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), {
              once: true,
            });
            started();
          }),
      );
    const provider = createProvider();
    const call = provider.callApi('hello');
    await ready;
    await provider.cleanup();
    expect((await call).error).toContain('aborted');
    expect(client.delete).toHaveBeenCalledWith('/convai/agents/owned-1', {
      signal: expect.any(AbortSignal),
    });
    expect((await provider.callApi('again')).error).toBeUndefined();
  });

  it('cancels only the requested simulation when calls share a provider', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    client.post
      .mockImplementationOnce(async () => ({ agent_id: 'shared' }))
      .mockImplementationOnce(
        (_path, _body, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), {
              once: true,
            });
            started();
          }),
      );
    const provider = createProvider();
    const controller = new AbortController();
    const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
    await ready;
    const second = provider.callApi('second');
    controller.abort();
    expect((await first).error).toContain('aborted');
    expect((await second).error).toBeUndefined();
    expect(client.post.mock.calls.filter(([path]) => path.endsWith('/create'))).toHaveLength(1);
  });

  it('uses one aggregate deadline for retained deletion retries', async () => {
    const provider = createProvider();
    client.delete.mockRejectedValueOnce(new Error('temporary'));
    await provider.callApi('first');
    await provider.cleanup();
    await provider.callApi('second');
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    client.delete.mockClear().mockImplementation(
      (_path, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          }),
        ),
    );
    const cleanup = provider.cleanup();
    await vi.waitFor(() => expect(client.delete).toHaveBeenCalledTimes(2));
    expect(timeout).toHaveBeenCalledOnce();
    expect(client.delete.mock.calls.map(([, options]) => options.signal)).toEqual([
      controller.signal,
      controller.signal,
    ]);
    controller.abort();
    await cleanup;
    client.delete.mockResolvedValue(undefined);
  });

  it('forgets a retained deletion once the remote agent is already absent', async () => {
    const provider = createProvider();
    await provider.callApi('hello');
    client.delete.mockRejectedValueOnce(new ElevenLabsAPIError('Not found', 404));
    await provider.cleanup();
    await provider.cleanup();
    expect(client.delete).toHaveBeenCalledOnce();
  });

  it('bounds deletion and retains an agent whose deletion timed out', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
    client.delete.mockImplementationOnce(
      (_path: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );
    const provider = createProvider();
    await provider.callApi('hello');
    const cleanup = provider.cleanup();
    await vi.waitFor(() => expect(client.delete).toHaveBeenCalledOnce());
    controller.abort();
    await cleanup;
    expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
    await provider.cleanup();
    expect(client.delete).toHaveBeenCalledTimes(2);
    expect(client.delete.mock.calls.map(([path]) => path)).toEqual([
      '/convai/agents/owned-1',
      '/convai/agents/owned-1',
    ]);
  });
});
