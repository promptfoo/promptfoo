import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../../../src/cache';
import { ElevenLabsAgentsProvider } from '../../../../src/providers/elevenlabs/agents';
import { createDeferred } from '../../../util/utils';

const { post, deleteAgent } = vi.hoisted(() => ({ post: vi.fn(), deleteAgent: vi.fn() }));
vi.mock('../../../../src/providers/elevenlabs/client', () => ({
  ElevenLabsClient: vi.fn(function () {
    return { post, delete: deleteAgent };
  }),
}));

function createProvider(agentId?: string) {
  return new ElevenLabsAgentsProvider('agent', {
    config: {
      apiKey: 'fixture-key',
      agentId,
      agentConfig: { prompt: expect.getState().currentTestName },
    },
  });
}

const creations = () =>
  post.mock.calls.filter(([endpoint]) => endpoint === '/convai/agents/create');
const simulations = () =>
  post.mock.calls.filter(([endpoint]) => endpoint.endsWith('/simulate-conversation'));

describe('ElevenLabs ephemeral agent ownership', () => {
  beforeEach(() => {
    post.mockReset();
    deleteAgent.mockReset().mockResolvedValue(undefined);
    let nextAgent = 0;
    post.mockImplementation(async (endpoint: string) =>
      endpoint === '/convai/agents/create'
        ? { agent_id: `agent-${++nextAgent}` }
        : { status: 'completed', simulated_conversation: [] },
    );
  });

  afterEach(() => vi.resetAllMocks());

  it.each([false, true])(
    'reuses and deletes its own agent when caching is %s',
    async (cacheEnabled) => {
      await withCacheEnabled(cacheEnabled, async () => {
        const provider = createProvider();
        try {
          expect((await provider.callApi('First')).error).toBeUndefined();
          expect((await provider.callApi('Second')).error).toBeUndefined();
          expect(creations()).toHaveLength(1);
          expect(simulations().map(([endpoint]) => endpoint)).toEqual([
            '/convai/agents/agent-1/simulate-conversation',
            '/convai/agents/agent-1/simulate-conversation',
          ]);
        } finally {
          await provider.cleanup();
        }
        expect(deleteAgent.mock.calls).toEqual([['/convai/agents/agent-1']]);
      });
    },
  );

  it('shares one creation across overlapping calls with response caching disabled', async () => {
    await withCacheEnabled(false, async () => {
      const provider = createProvider();
      try {
        const responses = await Promise.all([
          provider.callApi('First'),
          provider.callApi('Second'),
        ]);
        expect(responses.every((response) => !response.error)).toBe(true);
        expect(creations()).toHaveLength(1);
      } finally {
        await provider.cleanup();
      }
      expect(deleteAgent.mock.calls).toEqual([['/convai/agents/agent-1']]);
    });
  });

  it('keeps separate provider instances from sharing ownership of an agent', async () => {
    await withCacheEnabled(true, async () => {
      const first = createProvider();
      const second = createProvider();
      try {
        expect((await first.callApi('First')).error).toBeUndefined();
        expect((await second.callApi('Second')).error).toBeUndefined();
        expect(creations()).toHaveLength(2);
      } finally {
        await first.cleanup();
        await second.cleanup();
      }
      expect(deleteAgent.mock.calls).toEqual([
        ['/convai/agents/agent-1'],
        ['/convai/agents/agent-2'],
      ]);
    });
  });

  it('waits for pending creation before deleting the owned agent', async () => {
    const creationStarted = createDeferred<void>();
    const created = createDeferred<{ agent_id: string }>();
    post.mockImplementationOnce(() => {
      creationStarted.resolve();
      return created.promise;
    });
    const provider = createProvider();
    const call = provider.callApi('First');
    await creationStarted.promise;
    const cleanup = provider.cleanup();
    expect(deleteAgent).not.toHaveBeenCalled();
    created.resolve({ agent_id: 'pending-agent' });
    await Promise.all([call, cleanup]);
    expect(deleteAgent.mock.calls).toEqual([['/convai/agents/pending-agent']]);
  });

  it('retries failed creation and still cleans up after a failed simulation', async () => {
    await withCacheEnabled(false, async () => {
      const provider = createProvider();
      post.mockRejectedValueOnce(new Error('creation failed'));
      expect((await provider.callApi('First')).error).toContain('creation failed');
      post.mockResolvedValueOnce({ agent_id: 'recovered-agent' });
      post.mockRejectedValueOnce(new Error('simulation failed'));
      expect((await provider.callApi('Second')).error).toContain('simulation failed');
      await provider.cleanup();
      expect(deleteAgent.mock.calls).toEqual([['/convai/agents/recovered-agent']]);
    });
  });

  it('retries failed deletion and creates a fresh agent after successful cleanup', async () => {
    await withCacheEnabled(false, async () => {
      const provider = createProvider();
      expect((await provider.callApi('First')).error).toBeUndefined();
      deleteAgent.mockRejectedValueOnce(new Error('delete failed'));
      await provider.cleanup();
      await provider.cleanup();
      await provider.cleanup();
      expect(deleteAgent.mock.calls).toEqual([
        ['/convai/agents/agent-1'],
        ['/convai/agents/agent-1'],
      ]);
      expect((await provider.callApi('Second')).error).toBeUndefined();
      expect(creations()).toHaveLength(2);
      await provider.cleanup();
      expect(deleteAgent).toHaveBeenLastCalledWith('/convai/agents/agent-2');
    });
  });

  it('does not delete an agent supplied by the caller', async () => {
    const provider = createProvider('caller-owned');
    expect((await provider.callApi('First')).error).toBeUndefined();
    await provider.cleanup();
    expect(creations()).toHaveLength(0);
    expect(deleteAgent).not.toHaveBeenCalled();
  });
});
