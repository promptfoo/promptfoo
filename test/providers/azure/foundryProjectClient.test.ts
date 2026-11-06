import { afterEach, describe, expect, it, vi } from 'vitest';
import { FoundryProjectClient } from '../../../src/providers/azure/foundryProjectClient';
import type { TokenCredential } from '@azure/identity';
import type { ClientOptions } from '@azure-rest/core-client';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@azure-rest/core-client', async (importOriginal) => {
  const rest = await importOriginal<typeof import('@azure-rest/core-client')>();
  return {
    ...rest,
    getClient: (endpoint: string, credential: TokenCredential, options: ClientOptions) =>
      rest.getClient(endpoint, credential, { ...options, httpClient: { sendRequest } }),
  };
});

afterEach(() => vi.resetAllMocks());

describe('Foundry project agent discovery', () => {
  it('authenticates direct lookups and follows the service cursor for legacy ID lookup', async () => {
    const getToken = vi
      .fn()
      .mockResolvedValue({ token: 'fixture', expiresOnTimestamp: Date.now() + 3600000 });
    const client = new FoundryProjectClient('https://fixture.example/api/projects/project', {
      getToken,
    });
    const agent = { id: 'agent_id', name: 'agent-name' };
    const bodies = [
      agent,
      { data: [agent], has_more: true, last_id: 'cursor+/=' },
      { data: [], has_more: false },
    ];
    sendRequest.mockImplementation(async (request) => {
      expect(request.headers.get('authorization')).toBe('Bearer fixture');
      request.headers.set('content-type', 'application/json');
      return {
        request,
        status: 200,
        headers: request.headers,
        bodyAsText: JSON.stringify(bodies.shift()),
      };
    });

    await expect(client.getAgent('agent/name?#')).resolves.toEqual(agent);
    const agents = [];
    for await (const item of client.listAgents()) {
      agents.push(item);
    }
    expect(agents).toEqual([agent]);
    const urls = sendRequest.mock.calls.map(([request]) => new URL(request.url));
    expect(urls.map((url) => url.pathname)).toEqual([
      '/api/projects/project/agents/agent%2Fname%3F%23',
      '/api/projects/project/agents',
      '/api/projects/project/agents',
    ]);
    expect(urls.map((url) => url.searchParams.get('api-version'))).toEqual(['v1', 'v1', 'v1']);
    expect(urls.map((url) => url.searchParams.get('after'))).toEqual([null, null, 'cursor+/=']);
    expect(getToken.mock.calls[0][0]).toEqual(['https://ai.azure.com/.default']);
  });
});
