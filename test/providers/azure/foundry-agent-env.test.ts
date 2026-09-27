import { ClientSecretCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';
import { loadApiProvider } from '../../../src/providers/index';
import { mockProcessEnv } from '../../util/utils';
import type { AIProjectClient } from '@azure/ai-projects';

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
    expect(fixtures.lookup).toHaveBeenCalledTimes(1);
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

describe('Foundry SDK endpoint scopes', () => {
  const initialUrl = 'https://initial.services.ai.azure.com/api/projects/initial';
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    fixtures.cache.clear();
    restoreEnv = mockProcessEnv({ AZURE_AI_PROJECT_URL: initialUrl });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  function client(provider: AzureFoundryAgentProvider): Promise<AIProjectClient> {
    return Reflect.get(provider, 'initializeClient').call(provider);
  }

  it.each([false, true])(
    'matches endpoint and principal on reused providers (concurrent: %s)',
    async (concurrent) => {
      const provider = new AzureFoundryAgentProvider('agent-name');
      const seen: AIProjectClient[] = [];
      const run = async (tenant: string) => {
        const url = `https://${tenant}.services.ai.azure.com/api/projects/${tenant}`;
        await cliState.withEnv(
          { ...scopeEnv(tenant), AZURE_TENANT_ID: tenant, AZURE_AI_PROJECT_URL: url },
          async () => {
            const selected = await client(provider);
            expect(selected.endpoint).toBe(url);
            const credential = Reflect.get(selected, '_credential');
            expect(credential).toBeInstanceOf(ClientSecretCredential);
            expect(credential.tenantId).toBe(tenant);
            expect(await client(provider)).toBe(selected);
            seen.push(selected);
          },
        );
      };
      if (concurrent) {
        await Promise.all([run('first'), run('second')]);
      } else {
        await run('first');
        await run('second');
      }
      expect(new Set(seen).size).toBe(2);
    },
  );

  it('honors an invocation-file endpoint after construction', async () => {
    const provider = new AzureFoundryAgentProvider('agent-name');
    const url = 'https://file.services.ai.azure.com/api/projects/file';
    await cliState.withEnvFileOverrides(
      { ...scopeEnv('file'), AZURE_AI_PROJECT_URL: url },
      async () => {
        expect((await client(provider)).endpoint).toBe(url);
      },
    );
  });

  it('rejects a later empty scoped endpoint without falling back to the construction URL', async () => {
    const provider = new AzureFoundryAgentProvider('agent-name');
    await expect(
      cliState.withEnv({ ...scopeEnv('masked'), AZURE_AI_PROJECT_URL: '' }, () => client(provider)),
    ).rejects.toThrow('Azure AI Project URL must be provided');
  });

  it.each(['config', 'provider', 'loaded'] as const)(
    'retains an explicit %s endpoint over invocation scopes',
    async (binding) => {
      const url = 'https://bound.services.ai.azure.com/api/projects/bound';
      const provider =
        binding === 'loaded'
          ? ((await loadApiProvider('azure:foundry-agent:agent-name', {
              env: { AZURE_AI_PROJECT_URL: url },
            })) as AzureFoundryAgentProvider)
          : new AzureFoundryAgentProvider(
              'agent-name',
              binding === 'config'
                ? {
                    config: { projectUrl: url },
                    env: { AZURE_AI_PROJECT_URL: 'https://lower.example.invalid' },
                  }
                : { env: { AZURE_AI_PROJECT_URL: url } },
            );
      await cliState.withEnv({ ...scopeEnv('active'), AZURE_AI_PROJECT_URL: '' }, async () => {
        expect((await client(provider)).endpoint).toBe(url);
      });
    },
  );
});
