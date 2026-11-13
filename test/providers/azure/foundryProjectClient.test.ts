import { DefaultAzureCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';
import { FoundryProjectClient } from '../../../src/providers/azure/foundryProjectClient';
import type { TokenCredential } from '@azure/identity';
import type { ClientOptions } from '@azure-rest/core-client';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@azure-rest/core-client', async (importOriginal) => {
  const rest = await importOriginal<typeof import('@azure-rest/core-client')>();
  return {
    ...rest,
    getClient: (endpoint: string, credential: TokenCredential, options: ClientOptions) =>
      rest.getClient(endpoint, credential, {
        ...options,
        httpClient: { sendRequest },
        retryOptions: { maxRetries: 0 },
      }),
  };
});
vi.mock('../../../src/cache', () => ({ isCacheEnabled: () => false }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers({ 'content-type': 'application/json', ...headers });
  sendRequest.mockImplementationOnce(async (request) => ({
    request,
    status,
    headers: Object.assign(responseHeaders, { toJSON: () => Object.fromEntries(responseHeaders) }),
    bodyAsText: JSON.stringify(body),
  }));
}

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

  it.each([
    [401, 'Unauthorized', 'Invalid access token'],
    [503, 'ServiceUnavailable', 'Project temporarily unavailable'],
  ] as const)('preserves HTTP %i discovery errors', async (status, code, message) => {
    const body = { error: { code, message } };
    reply(status, body);
    const client = new FoundryProjectClient('https://fixture.example/api/projects/project', {
      getToken: async () => ({ token: 'fixture', expiresOnTimestamp: Date.now() + 3600000 }),
    });

    await expect(client.getAgent('agent')).rejects.toMatchObject({
      message,
      code,
      statusCode: status,
      response: { status },
      details: body,
    });
  });

  describe('provider recovery after malformed discovery', () => {
    const agent = { id: 'legacy-id', name: 'agent-name' };
    let provider: AzureFoundryAgentProvider;

    beforeEach(() => {
      vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
        token: 'fixture',
        expiresOnTimestamp: Date.now() + 3600000,
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        Response.json({
          id: 'response-id',
          model: 'gpt-4.1',
          object: 'response',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Hello' }],
            },
          ],
        }),
      );
      provider = new AzureFoundryAgentProvider('legacy-id', {
        config: { projectUrl: 'https://fixture.example/api/projects/project' },
      });
    });

    it('falls back from JSON null to a valid listed agent and reuses that identity', async () => {
      reply(200, null);
      reply(200, { data: [agent], has_more: false });
      await expect(provider.callApi('first')).resolves.toMatchObject({ output: 'Hello' });
      await expect(provider.callApi('again')).resolves.toMatchObject({ output: 'Hello' });
      expect(sendRequest.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual([
        '/api/projects/project/agents/legacy-id',
        '/api/projects/project/agents',
      ]);
    });

    it.each([
      { id: 'legacy-id', name: '   ' },
      { id: '  ', name: 'legacy-id' },
      { id: 'legacy-id', name: 42 },
    ])('retries discovery after both endpoints return an invalid identity %j', async (invalid) => {
      reply(200, invalid);
      reply(200, { data: [invalid], has_more: false });
      expect((await provider.callApi('first')).error).toBeTruthy();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      reply(200, agent);
      await expect(provider.callApi('recover')).resolves.toMatchObject({ output: 'Hello' });
      await expect(provider.callApi('again')).resolves.toMatchObject({ output: 'Hello' });
      expect(sendRequest.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual([
        '/api/projects/project/agents/legacy-id',
        '/api/projects/project/agents',
        '/api/projects/project/agents/legacy-id',
      ]);
    });
  });

  it('falls back after a 404 and forwards a later discovery page throttle to the scheduler', async () => {
    vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
      token: 'fixture',
      expiresOnTimestamp: Date.now() + 3600000,
    });
    reply(404, { error: { code: 'NotFound', message: 'Unknown agent name' } });
    reply(200, { data: [], has_more: true, last_id: 'cursor' });
    reply(
      429,
      { error: { code: 'rate_limit_exceeded', message: 'Slow down' } },
      { 'retry-after': '2' },
    );
    const provider = new AzureFoundryAgentProvider('legacy-id', {
      config: { projectUrl: 'https://fixture.example/api/projects/project' },
    });

    const result = await provider.callApi('hello');

    expect(result.error).toContain('Slow down');
    expect(result.metadata).toMatchObject({
      rateLimitKind: 'rate_limit',
      http: { status: 429, headers: { 'retry-after': '2' } },
    });
    expect(sendRequest.mock.calls.map(([request]) => new URL(request.url))).toMatchObject([
      { pathname: '/api/projects/project/agents/legacy-id' },
      { pathname: '/api/projects/project/agents' },
      { pathname: '/api/projects/project/agents', search: expect.stringContaining('after=cursor') },
    ]);
  });
});
