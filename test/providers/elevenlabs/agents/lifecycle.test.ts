import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsAgentsProvider } from '../../../../src/providers/elevenlabs/agents';
import { providerRegistry } from '../../../../src/providers/providerRegistry';

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
  it('creates a fresh agent after each evaluation, including with a new instance', async () => {
    const provider = createProvider();
    for (const current of [provider, provider, createProvider()]) {
      const result = await providerRegistry.withScope([current], () => current.callApi('hello'));
      expect(result.error).toBeUndefined();
    }
    expect(client.delete.mock.calls).toEqual([
      ['/convai/agents/owned-1'],
      ['/convai/agents/owned-2'],
      ['/convai/agents/owned-3'],
    ]);
  });

  it('coalesces creation within an instance but keeps different instances independent', async () => {
    const first = createProvider();
    const second = createProvider();
    await providerRegistry.withScope([first, second], async () => {
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
    await providerRegistry.withScope([provider], () => provider.callApi('hello'));
    expect(client.delete).not.toHaveBeenCalled();
  });

  it('retries creation after a failed request', async () => {
    client.post.mockRejectedValueOnce(new Error('creation failed'));
    const provider = createProvider();
    expect((await provider.callApi('hello')).error).toContain('creation failed');
    expect(
      (await providerRegistry.withScope([provider], () => provider.callApi('again'))).error,
    ).toBeUndefined();
    expect(client.delete).toHaveBeenCalledOnce();
  });

  it('retries deletion of the same ephemeral agent after a failed cleanup', async () => {
    client.delete.mockRejectedValueOnce(new Error('temporary failure'));
    const provider = createProvider();
    await provider.callApi('hello');
    await provider.cleanup();
    expect((await provider.callApi('again')).metadata?.agentId).toBe('owned-1');
    await provider.cleanup();
    expect(client.post.mock.calls.filter(([path]) => path.endsWith('/create'))).toHaveLength(1);
    expect(client.delete.mock.calls).toEqual([
      ['/convai/agents/owned-1'],
      ['/convai/agents/owned-1'],
    ]);
  });
});
