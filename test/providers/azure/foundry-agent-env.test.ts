import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';

const fixtures = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  clients: vi.fn(),
  requests: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock('../../../src/cache', () => ({
  isCacheEnabled: () => true,
  getCache: async () => ({
    get: async (key: string) => fixtures.cache.get(key),
    set: async (key: string, value: unknown) => fixtures.cache.set(key, value),
  }),
}));

function createClient(clientId: string) {
  fixtures.clients(clientId);
  return {
    agents: {
      get: async () => {
        fixtures.lookup(clientId);
        return { id: clientId, name: clientId };
      },
    },
    getOpenAIClient: () => ({
      responses: {
        create: async (_body: unknown, options: unknown) => {
          fixtures.requests(clientId, options);
          return {
            id: 'fixture-response',
            model: 'gpt-4.1',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: clientId }],
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          };
        },
      },
    }),
  };
}

function scopeEnv(clientId: string) {
  return {
    AZURE_CLIENT_ID: clientId,
    AZURE_TENANT_ID: 'fixture-tenant',
    AZURE_CLIENT_SECRET: 'fixture-secret',
  };
}

function createProvider() {
  return new AzureFoundryAgentProvider('agent-name', {
    config: { projectUrl: 'https://fixture.services.ai.azure.com/api/projects/project' },
  });
}

describe('Foundry invocation ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fixtures.cache.clear();
    // Stub only SDK construction; exercise the real client, agent, and cache ownership.
    vi.spyOn(AzureFoundryAgentProvider.prototype as any, 'createProjectClient').mockImplementation(
      async () => createClient(getEnvString('AZURE_CLIENT_ID') ?? 'default'),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([false, true])(
    'isolates reused providers between scopes (concurrent: %s)',
    async (concurrent) => {
      const provider = createProvider();
      const run = (clientId: string) =>
        cliState.withEnv(scopeEnv(clientId), async () => {
          const first = await provider.callApi('same prompt');
          const cached = await provider.callApi('same prompt');
          const next = await provider.callApi('different prompt');
          expect(first).toMatchObject({ output: clientId });
          expect(cached).toMatchObject({ output: clientId, cached: true });
          expect(next).toMatchObject({ output: clientId });
          expect(next.cached).not.toBe(true);
        });
      if (concurrent) {
        await Promise.all([run('first-client'), run('second-client')]);
      } else {
        await run('first-client');
        await run('second-client');
      }
      expect(fixtures.clients.mock.calls.map(([id]) => id).sort()).toEqual([
        'first-client',
        'second-client',
      ]);
      expect(fixtures.lookup).toHaveBeenCalledTimes(2);
      expect(fixtures.requests).toHaveBeenCalledTimes(4);
      for (const [clientId, options] of fixtures.requests.mock.calls) {
        expect(options).toMatchObject({ body: { agent_reference: { name: clientId } } });
      }
    },
  );

  it('initializes one client for concurrent requests within a scope', async () => {
    const provider = createProvider();
    await cliState.withEnv(scopeEnv('shared-client'), async () => {
      const results = await Promise.all(
        ['one', 'two', 'three'].map((prompt) => provider.callApi(prompt)),
      );
      for (const result of results) {
        expect(result).toMatchObject({ output: 'shared-client' });
      }
    });
    expect(fixtures.clients).toHaveBeenCalledTimes(1);
  });

  it('allows retry after client initialization fails', async () => {
    const provider = createProvider();
    fixtures.clients.mockImplementationOnce(() => {
      throw new Error('fixture initialization failure');
    });
    await cliState.withEnv(scopeEnv('retry-client'), async () => {
      expect(await provider.callApi('same prompt')).toMatchObject({
        error: expect.stringContaining('fixture initialization failure'),
      });
      expect(await provider.callApi('same prompt')).toMatchObject({ output: 'retry-client' });
    });
    expect(fixtures.clients).toHaveBeenCalledTimes(2);
  });
});
