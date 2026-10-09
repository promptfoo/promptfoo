import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../../../src/cache';
import { evaluate } from '../../../../src/node';
import { ElevenLabsAgentsProvider } from '../../../../src/providers/elevenlabs/agents';
import { providerRegistry } from '../../../../src/providers/providerRegistry';
import { createDeferred } from '../../../util/utils';

const { post, deleteAgent } = vi.hoisted(() => ({ post: vi.fn(), deleteAgent: vi.fn() }));
vi.mock('../../../../src/providers/elevenlabs/client', () => ({
  ElevenLabsClient: vi.fn(function () {
    return { post, delete: deleteAgent };
  }),
}));

async function runEvaluation(provider: ElevenLabsAgentsProvider) {
  const result = await evaluate(
    {
      prompts: ['fixture'],
      providers: [provider],
      tests: [{ assert: [{ type: 'contains', value: 'Agent conversation completed' }] }],
      writeLatestResults: false,
      sharing: false,
    },
    { cache: false, showProgressBar: false },
  );
  const rows = await result.getResults();
  expect(rows).toHaveLength(1);
  expect(rows[0].success).toBe(true);
}

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

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.resetAllMocks();
  });

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
  it('cleans up after public API evaluations and re-registers a reused provider', async () => {
    const provider = createProvider();
    await runEvaluation(provider);
    expect(deleteAgent.mock.calls).toEqual([['/convai/agents/agent-1']]);
    expect(providerRegistry.has(provider)).toBe(false);
    await runEvaluation(provider);
    expect(creations()).toHaveLength(2);
    expect(deleteAgent.mock.calls).toEqual([
      ['/convai/agents/agent-1'],
      ['/convai/agents/agent-2'],
    ]);
  });

  it('keeps an active peer evaluation alive during global registry shutdown', async () => {
    const simulationStarted = createDeferred<void>();
    const releaseSimulation = createDeferred<void>();
    let nextAgent = 0;
    post.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/convai/agents/create') {
        return { agent_id: `agent-${++nextAgent}` };
      }
      if (endpoint === '/convai/agents/agent-1/simulate-conversation') {
        simulationStarted.resolve();
        await releaseSimulation.promise;
      }
      return { status: 'completed', simulated_conversation: [] };
    });
    const slow = runEvaluation(createProvider());
    await simulationStarted.promise;
    try {
      await runEvaluation(createProvider());
      expect(deleteAgent.mock.calls).toEqual([['/convai/agents/agent-2']]);
    } finally {
      releaseSimulation.resolve();
      await slow;
    }
    expect(deleteAgent.mock.calls).toEqual([
      ['/convai/agents/agent-2'],
      ['/convai/agents/agent-1'],
    ]);
  });

  it('waits for retiring-agent deletion before creating and registering its replacement', async () => {
    const provider = createProvider();
    await provider.callApi('First');
    expect(providerRegistry.has(provider)).toBe(true);
    const deletionStarted = createDeferred<void>();
    const finishDeletion = createDeferred<void>();
    deleteAgent.mockImplementationOnce(() => {
      deletionStarted.resolve();
      return finishDeletion.promise;
    });
    const retiring = providerRegistry.shutdownAll();
    await deletionStarted.promise;
    const nextCall = provider.callApi('Second');
    try {
      expect(creations()).toHaveLength(1);
    } finally {
      finishDeletion.resolve();
      await Promise.all([retiring, nextCall]);
    }
    expect(creations()).toHaveLength(2);
    expect(simulations().map(([endpoint]) => endpoint)).toEqual([
      '/convai/agents/agent-1/simulate-conversation',
      '/convai/agents/agent-2/simulate-conversation',
    ]);
    expect(providerRegistry.has(provider)).toBe(true);
    await providerRegistry.shutdownAll();
    expect(deleteAgent.mock.calls).toEqual([
      ['/convai/agents/agent-1'],
      ['/convai/agents/agent-2'],
    ]);
  });

  it('lets an active simulation finish before explicit cleanup deletes its agent', async () => {
    const simulationStarted = createDeferred<void>();
    const releaseSimulation = createDeferred<void>();
    post.mockResolvedValueOnce({ agent_id: 'active-agent' });
    post.mockImplementationOnce(async () => {
      simulationStarted.resolve();
      await releaseSimulation.promise;
      return { status: 'completed', simulated_conversation: [] };
    });
    const provider = createProvider();
    const call = provider.callApi('First');
    await simulationStarted.promise;
    const cleanup = provider.cleanup();
    try {
      await Promise.resolve();
      expect(deleteAgent).not.toHaveBeenCalled();
    } finally {
      releaseSimulation.resolve();
      await Promise.all([call, cleanup]);
    }
    expect(deleteAgent.mock.calls).toEqual([['/convai/agents/active-agent']]);
  });

  it('leaves caller-owned agents unregistered during public API evaluations', async () => {
    const provider = createProvider('caller-owned');
    await runEvaluation(provider);
    expect(providerRegistry.has(provider)).toBe(false);
    expect(creations()).toHaveLength(0);
    expect(deleteAgent).not.toHaveBeenCalled();
  });
});
