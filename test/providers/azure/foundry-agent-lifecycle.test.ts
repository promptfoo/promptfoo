import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';
import { createDeferred } from '../../util/utils';

vi.mock('@azure/ai-projects', () => ({ AIProjectClient: vi.fn() }));
vi.mock('@azure/identity', () => ({ DefaultAzureCredential: vi.fn() }));

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
    vi.mocked(AIProjectClient)
      .mockReset()
      .mockImplementation(function () {
        return Object.assign(Object.create(AIProjectClient.prototype), {
          agents: { get: getAgent, list: listAgents },
          getOpenAIClient,
        });
      });
    await import('@azure/ai-projects');
    await import('@azure/identity');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares first-call client and agent setup, and retains the OpenAI client for later requests', async () => {
    const lookup = createDeferred<typeof agent>();
    getAgent.mockReturnValueOnce(lookup.promise);
    const provider = createProvider();
    const requests = Array.from({ length: 20 }, () => provider.callApi('Hello'));
    await vi.dynamicImportSettled();
    expect(AIProjectClient).toHaveBeenCalledTimes(1);
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(createResponse).not.toHaveBeenCalled();
    lookup.resolve(agent);
    expect((await Promise.all(requests)).every((result) => result.output === 'Hello')).toBe(true);
    await provider.callApi('Again');

    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(getOpenAIClient).toHaveBeenCalledTimes(1);
    expect(createResponse).toHaveBeenCalledTimes(21);
    expect(AIProjectClient).toHaveBeenCalledWith(projectUrl, expect.any(DefaultAzureCredential));
  });

  it.each(['credential', 'project client'])(
    'retries failed %s initialization on a later call',
    async (failure) => {
      const constructor = failure === 'credential' ? DefaultAzureCredential : AIProjectClient;
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
    expect(AIProjectClient).toHaveBeenCalledTimes(1);
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
    expect(AIProjectClient).toHaveBeenCalledTimes(1);
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
    expect(AIProjectClient).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledTimes(1);
  });

  it('retains initialized clients when a model request fails', async () => {
    createResponse.mockRejectedValueOnce(new Error('temporary token acquisition failure'));
    const provider = createProvider();
    expect(await provider.callApi('Hello')).toMatchObject({
      error: expect.stringContaining('temporary token acquisition failure'),
    });
    expect(await provider.callApi('Recovered')).toMatchObject({ output: 'Hello' });
    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(getOpenAIClient).toHaveBeenCalledTimes(1);
    expect(AIProjectClient).toHaveBeenCalledTimes(1);
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledTimes(1);
  });

  it('keeps credentials and clients isolated across provider instances and project endpoints', async () => {
    const secondUrl = 'https://test.services.ai.azure.com/api/projects/other';
    const first = createProvider();
    const second = createProvider(secondUrl);
    await first.callApi('First');
    await second.callApi('Second');

    expect(AIProjectClient).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = vi.mocked(AIProjectClient).mock.calls;
    expect(new Set([firstCall[0], secondCall[0]])).toEqual(new Set([projectUrl, secondUrl]));
    expect(firstCall[1]).not.toBe(secondCall[1]);
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(2);
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(getOpenAIClient).toHaveBeenCalledTimes(2);
  });
});
