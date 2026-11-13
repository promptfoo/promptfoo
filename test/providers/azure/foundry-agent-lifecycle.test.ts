import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';
import { FoundryProjectClient } from '../../../src/providers/azure/foundryProjectClient';
import { createDeferred } from '../../util/utils';

vi.mock('../../../src/providers/azure/foundryProjectClient', () => ({
  FoundryProjectClient: vi.fn(),
}));
vi.mock('@azure/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@azure/identity')>()),
  ClientSecretCredential: vi.fn(),
  DefaultAzureCredential: vi.fn(),
}));

const agent = { id: 'agent-id', name: 'test-agent', object: 'agent', versions: { latest: {} } };
const response = {
  id: 'response-id',
  model: 'gpt-4.1',
  error: null,
  output: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello' }] },
  ],
};
const projectUrl = 'https://test.services.ai.azure.com/api/projects/test';
const createProvider = (endpoint = projectUrl, name = 'test-agent') =>
  new AzureFoundryAgentProvider(name, {
    config: { projectUrl: endpoint, maxPollTimeMs: 1000 },
  });

async function* noAgents() {}

describe('Foundry client lifecycle', () => {
  const getAgent = vi.fn();
  const listAgents = vi.fn();
  const createResponse = vi.fn();
  const getOpenAIClient = vi.fn();

  beforeEach(async () => {
    getAgent.mockReset().mockResolvedValue(agent);
    listAgents.mockReset().mockImplementation(noAgents);
    createResponse.mockReset().mockResolvedValue(response);
    getOpenAIClient.mockReset().mockReturnValue({ responses: { create: createResponse } });
    vi.mocked(DefaultAzureCredential)
      .mockReset()
      .mockImplementation(function () {
        return Object.create(DefaultAzureCredential.prototype);
      });
    vi.mocked(FoundryProjectClient)
      .mockReset()
      .mockImplementation(function () {
        return Object.assign(Object.create(FoundryProjectClient.prototype), {
          getAgent,
          listAgents,
          getOpenAIClient,
        });
      });
    await import('../../../src/providers/azure/foundryProjectClient');
    await import('@azure/identity');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shares first-call project and agent setup, with an OpenAI client per invocation', async () => {
    const lookup = createDeferred<typeof agent>();
    getAgent.mockReturnValueOnce(lookup.promise);
    const provider = createProvider();
    const requests = Array.from({ length: 20 }, () => provider.callApi('Hello'));
    await vi.dynamicImportSettled();
    expect(FoundryProjectClient).toHaveBeenCalledTimes(1);
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(createResponse).not.toHaveBeenCalled();
    lookup.resolve(agent);
    expect((await Promise.all(requests)).every((result) => result.output === 'Hello')).toBe(true);
    await provider.callApi('Again');

    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(getOpenAIClient).toHaveBeenCalledTimes(21);
    expect(createResponse).toHaveBeenCalledTimes(21);
    expect(FoundryProjectClient).toHaveBeenCalledWith(
      projectUrl,
      expect.any(DefaultAzureCredential),
    );
  });

  it.each(['credential', 'project client'])(
    'retries failed %s initialization on a later call',
    async (failure) => {
      const constructor = failure === 'credential' ? DefaultAzureCredential : FoundryProjectClient;
      vi.mocked(constructor).mockImplementationOnce(function () {
        throw new Error('temporary initialization failure');
      });
      const provider = createProvider();
      const results = await Promise.all(
        Array.from({ length: 20 }, () => provider.callApi('Hello')),
      );
      expect(
        results.every((result) => result.error?.includes('temporary initialization failure')),
      ).toBe(true);
      expect(constructor).toHaveBeenCalledTimes(1);
      expect(getAgent).not.toHaveBeenCalled();

      expect(await provider.callApi('Recovered')).toMatchObject({ output: 'Hello' });
      expect(constructor).toHaveBeenCalledTimes(2);
      expect(getAgent).toHaveBeenCalledTimes(1);
    },
  );

  it('shares failed agent lookup and retries it without reconstructing the client or credential', async () => {
    const lookup = createDeferred<typeof agent>();
    getAgent.mockReturnValueOnce(lookup.promise);
    listAgents.mockImplementationOnce(async function* () {
      throw new Error('temporary lookup failure');
    });
    const provider = createProvider();
    const requests = Array.from({ length: 20 }, () => provider.callApi('Hello'));
    await vi.dynamicImportSettled();
    lookup.reject(new Error('agent get unavailable'));
    const results = await Promise.all(requests);
    expect(results.every((result) => result.error?.includes('temporary lookup failure'))).toBe(
      true,
    );
    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(listAgents).toHaveBeenCalledTimes(1);
    expect(createResponse).not.toHaveBeenCalled();

    expect(await provider.callApi('Recovered')).toMatchObject({ output: 'Hello' });
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(FoundryProjectClient).toHaveBeenCalledTimes(1);
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
  });

  it('shares legacy-ID fallback lookup and retries an earlier not-found result', async () => {
    getAgent.mockRejectedValue(new Error('name not found'));
    const provider = createProvider(projectUrl, agent.id);
    expect(await provider.callApi('Missing')).toMatchObject({
      error: expect.stringContaining('was not found'),
    });
    listAgents.mockImplementation(async function* () {
      yield agent;
    });
    const results = await Promise.all(Array.from({ length: 20 }, () => provider.callApi('Found')));
    expect(results.every((result) => result.output === 'Hello')).toBe(true);
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(listAgents).toHaveBeenCalledTimes(2);
    expect(FoundryProjectClient).toHaveBeenCalledTimes(1);
  });

  it('retries OpenAI client construction without repeating successful initialization', async () => {
    getOpenAIClient.mockImplementationOnce(() => {
      throw new Error('temporary OpenAI client failure');
    });
    const provider = createProvider();
    expect(await provider.callApi('Hello')).toMatchObject({
      error: expect.stringContaining('temporary OpenAI client failure'),
    });
    expect(await provider.callApi('Recovered')).toMatchObject({ output: 'Hello' });
    expect(getOpenAIClient).toHaveBeenCalledTimes(2);
    expect(FoundryProjectClient).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledTimes(1);
  });

  it('retains project and agent initialization when a model request fails', async () => {
    createResponse.mockRejectedValueOnce(new Error('temporary token acquisition failure'));
    const provider = createProvider();
    expect(await provider.callApi('Hello')).toMatchObject({
      error: expect.stringContaining('temporary token acquisition failure'),
    });
    expect(await provider.callApi('Recovered')).toMatchObject({ output: 'Hello' });
    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(getOpenAIClient).toHaveBeenCalledTimes(2);
    expect(FoundryProjectClient).toHaveBeenCalledTimes(1);
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledTimes(1);
  });

  it('returns a later token acquisition failure through the actual SDK request', async () => {
    const { FoundryProjectClient: RealFoundryProjectClient } = await vi.importActual<
      typeof import('../../../src/providers/azure/foundryProjectClient')
    >('../../../src/providers/azure/foundryProjectClient');
    vi.useFakeTimers();
    const getToken = vi
      .fn()
      .mockResolvedValueOnce({ token: 'test-token', expiresOnTimestamp: Date.now() + 1500 })
      .mockRejectedValue(new Error('simulated identity outage'));
    const project = new RealFoundryProjectClient(projectUrl, { getToken });
    vi.spyOn(project, 'getAgent').mockImplementation(getAgent);
    vi.mocked(FoundryProjectClient).mockImplementationOnce(function () {
      return project;
    });
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ ...response, object: 'response', status: 'completed' }),
      );
    vi.stubGlobal('fetch', fetch);
    const provider = createProvider();

    expect(await provider.callApi('First')).toMatchObject({ output: 'Hello' });
    // The actual SDK bearer provider can return a near-expiry token while starting
    // a detached refresh. A new OpenAI client keeps this acquisition on the request
    // path, so its failure is returned to the caller instead of becoming unhandled.
    expect(await provider.callApi('Second')).toMatchObject({
      error: expect.stringContaining('simulated identity outage'),
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledTimes(1);

    getToken.mockResolvedValue({
      token: 'recovered-token',
      expiresOnTimestamp: Date.now() + 3600000,
    });
    expect(await provider.callApi('Recovered')).toMatchObject({ output: 'Hello' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(FoundryProjectClient).toHaveBeenCalledTimes(1);
  });

  it('hands explicit service principals to separate project clients without invoking ambient discovery', async () => {
    vi.mocked(ClientSecretCredential)
      .mockReset()
      .mockImplementation(function () {
        return Object.create(ClientSecretCredential.prototype);
      });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
    vi.stubEnv('AZURE_AUTHORITY_HOST', 'https://login.microsoftonline.us');
    vi.stubEnv('AZURE_TOKEN_CREDENTIALS', 'prod');
    try {
      const create = (tenant: string) =>
        new AzureFoundryAgentProvider('test-agent', {
          config: {
            projectUrl,
            maxPollTimeMs: 1000,
            azureTenantId: tenant,
            azureClientId: `client-${tenant}`,
            ...(tenant === 'two' && { azureAuthorityHost: 'https://login.chinacloudapi.cn' }),
            azureClientSecret: `fixture-${tenant}`,
          },
        });
      expect(await create('one').callApi('First')).toMatchObject({ output: 'Hello' });
      expect(await create('two').callApi('Second')).toMatchObject({ output: 'Hello' });
      for (const tenant of ['one', 'two']) {
        expect(ClientSecretCredential).toHaveBeenCalledWith(
          tenant,
          `client-${tenant}`,
          `fixture-${tenant}`,
          {
            authorityHost: tenant === 'two' ? 'https://login.chinacloudapi.cn' : undefined,
          },
        );
      }
      expect(DefaultAzureCredential).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(
        new Set(vi.mocked(FoundryProjectClient).mock.calls.map(([, credential]) => credential))
          .size,
      ).toBe(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    { azureClientSecret: 'fixture-incomplete' },
    { azureClientId: 'fixture-client', azureClientSecret: 'fixture-incomplete' },
    { azureTenantId: 'fixture-tenant', azureClientSecret: 'fixture-incomplete' },
    { azureTenantId: 'fixture-tenant', azureClientId: 'fixture-client', azureClientSecret: '' },
  ])(
    'rejects incomplete explicit secret credentials before using ambient credentials or a cached response',
    (partial) => {
      expect(
        () => new AzureFoundryAgentProvider('test-agent', { config: { projectUrl, ...partial } }),
      ).toThrow(/azureClientId, azureTenantId and azureClientSecret/);
      expect(DefaultAzureCredential).not.toHaveBeenCalled();
    },
  );

  it('rejects an explicit secret when the host restricts Azure credential discovery to its CLI', async () => {
    vi.stubEnv('AZURE_TOKEN_CREDENTIALS', 'AzureCliCredential');
    try {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl,
          azureTenantId: 'tenant',
          azureClientId: 'client',
          azureClientSecret: 'fixture-secret',
        },
      });
      expect(await provider.callApi('Hello')).toMatchObject({
        error: expect.stringContaining('AZURE_TOKEN_CREDENTIALS'),
      });
      expect(DefaultAzureCredential).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps credentials and clients isolated across provider instances and project endpoints', async () => {
    const secondUrl = 'https://test.services.ai.azure.com/api/projects/other';
    const first = createProvider();
    const second = createProvider(secondUrl);
    await first.callApi('First');
    await second.callApi('Second');

    expect(FoundryProjectClient).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = vi.mocked(FoundryProjectClient).mock.calls;
    expect(new Set([firstCall[0], secondCall[0]])).toEqual(new Set([projectUrl, secondUrl]));
    expect(firstCall[1]).not.toBe(secondCall[1]);
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(2);
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(getOpenAIClient).toHaveBeenCalledTimes(2);
  });
});
