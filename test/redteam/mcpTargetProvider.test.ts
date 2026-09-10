import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPProvider } from '../../src/providers/mcp';
import { maybeWrapMcpProviderForRedteam } from '../../src/redteam/mcpTargetProvider';
import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../src/util/tokenUsageUtils';

import type { MCPTool } from '../../src/providers/mcp/types';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../src/types';

const providerManagerMocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
}));
const promptfooProviderMocks = vi.hoisted(() => ({
  materializeMcpToolCallRemote: vi.fn(),
}));

vi.mock('../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: providerManagerMocks.getProvider,
  },
}));
vi.mock('../../src/redteam/extraction/util', () => ({
  materializeMcpToolCallRemote: promptfooProviderMocks.materializeMcpToolCallRemote,
}));

class FakeMcpProvider extends MCPProvider {
  calls: { context?: CallApiContextParams; options?: CallApiOptionsParams; prompt: string }[] = [];
  cleanupCalls = 0;

  constructor(
    private readonly tools: MCPTool[],
    id = 'mcp',
  ) {
    super({ config: { enabled: false }, id });
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    this.calls.push({ prompt, context, options });
    return { output: 'ok' };
  }

  async cleanup(): Promise<void> {
    this.cleanupCalls += 1;
  }
}

describe('maybeWrapMcpProviderForRedteam', () => {
  const searchCompaniesPrompt = 'Find clean energy companies.';
  const searchCompaniesCall = {
    tool: 'search_companies',
    args: {
      query: searchCompaniesPrompt,
      limit: 10,
    },
  };

  const searchCompaniesTool: MCPTool = {
    name: 'search_companies',
    description: 'Search sample company records.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['query'],
    },
  };

  const redteamMetadata = (pluginId: string, purpose = 'Search companies') => ({
    metadata: {
      pluginId,
      purpose,
    },
  });

  const redteamContext = (
    prompt = searchCompaniesPrompt,
    pluginId = 'harmful:hate',
    purpose = 'Search companies',
  ): CallApiContextParams => ({
    prompt: {
      raw: '{{prompt}}',
      label: 'prompt',
    },
    vars: { prompt },
    test: redteamMetadata(pluginId, purpose),
  });

  const parseToolCall = (raw: unknown) => JSON.parse(String(raw));
  const remoteMaterializedCall = (tokenUsage?: Record<string, number>) => ({
    prompt: JSON.stringify(searchCompaniesCall),
    ...(tokenUsage ? { tokenUsage } : {}),
  });

  beforeEach(() => {
    providerManagerMocks.getProvider.mockReset();
    promptfooProviderMocks.materializeMcpToolCallRemote.mockReset();
  });

  it('uses remote materialization for invalid redteam target calls before they reach MCP providers', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(
      remoteMaterializedCall(),
    );

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(promptfooProviderMocks.materializeMcpToolCallRemote).toHaveBeenCalledWith(
      {
        intentValue: searchCompaniesPrompt,
        purpose: 'Search companies',
        tools: [searchCompaniesTool],
        value: searchCompaniesPrompt,
      },
      undefined,
    );
    expect(providerManagerMocks.getProvider).not.toHaveBeenCalled();
    expect(target.calls).toHaveLength(1);
    expect(parseToolCall(target.calls[0].prompt)).toEqual(searchCompaniesCall);
    expect(parseToolCall(target.calls[0].context?.vars.prompt)).toEqual(searchCompaniesCall);
  });

  it('attributes remote materialization to attacker usage without adding a target probe', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(
      remoteMaterializedCall({
        completion: 3,
        numRequests: 1,
        prompt: 7,
        total: 10,
      }),
    );

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await expect(wrapped.callApi(searchCompaniesPrompt, redteamContext())).resolves.toMatchObject({
      output: 'ok',
      tokenUsage: {
        attacker: {
          completion: 3,
          prompt: 7,
          total: 10,
          numRequests: 1,
        },
      },
    });
  });

  it('preserves cached remote materialization without incurring attacker usage', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce({
      ...remoteMaterializedCall({ completion: 3, numRequests: 1, prompt: 7, total: 10 }),
      cached: true,
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    const response = await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(response).toMatchObject({
      output: 'ok',
      tokenUsage: {
        numRequests: 1,
        attacker: { total: 10, prompt: 7, completion: 3, cached: 10, numRequests: 1 },
        incurredTokenUsage: {
          numRequests: 1,
          attacker: { total: 0, numRequests: 0 },
        },
      },
    });
    expect(target.calls).toHaveLength(1);

    const evaluationUsage = createEmptyTokenUsage();
    accumulateResponseTokenUsage(evaluationUsage, response);
    expect(evaluationUsage).toMatchObject({
      numRequests: 1,
      incurredTokenUsage: { numRequests: 1, attacker: { total: 0, numRequests: 0 } },
    });
  });

  it('preserves fresh target tokens and requests when cached materialization is merged', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce({
      prompt: JSON.stringify(searchCompaniesCall),
      cached: true,
      tokenUsage: {
        total: 10,
        prompt: 7,
        completion: 3,
        numRequests: 1,
        assertions: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
        incurredTokenUsage: {
          total: 10,
          prompt: 7,
          completion: 3,
          numRequests: 1,
          assertions: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
        },
      },
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    vi.spyOn(target, 'callApi').mockResolvedValueOnce({
      output: 'target response',
      tokenUsage: { total: 21, prompt: 14, completion: 7 },
    });
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await expect(wrapped.callApi(searchCompaniesPrompt, redteamContext())).resolves.toMatchObject({
      output: 'target response',
      tokenUsage: {
        total: 21,
        prompt: 14,
        completion: 7,
        numRequests: 1,
        attacker: { total: 10, numRequests: 1 },
        assertions: { total: 5, numRequests: 1 },
        incurredTokenUsage: {
          total: 21,
          prompt: 14,
          completion: 7,
          numRequests: 1,
          attacker: { total: 0, numRequests: 0 },
          assertions: { total: 0, numRequests: 0 },
        },
      },
    });
  });

  it('does not incur a cached target request when materialization is also cached', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce({
      ...remoteMaterializedCall({ completion: 3, numRequests: 1, prompt: 7, total: 10 }),
      cached: true,
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    vi.spyOn(target, 'callApi').mockResolvedValueOnce({
      output: 'cached target response',
      cached: true,
      tokenUsage: { total: 21, prompt: 14, completion: 7 },
    });
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await expect(wrapped.callApi(searchCompaniesPrompt, redteamContext())).resolves.toMatchObject({
      output: 'cached target response',
      tokenUsage: {
        total: 21,
        cached: 21,
        numRequests: 1,
        attacker: { total: 10, numRequests: 1 },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          attacker: { total: 0, numRequests: 0 },
        },
      },
    });
  });

  it('passes linked cloud target context to remote materialization', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(
      remoteMaterializedCall(),
    );

    const target = new FakeMcpProvider(
      [searchCompaniesTool],
      'promptfoo://provider/cloud-target-123',
    );
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(promptfooProviderMocks.materializeMcpToolCallRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: 'cloud-target-123',
      }),
      undefined,
    );
  });

  it('does not request inference when the prompt is already valid MCP JSON', async () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));
    const prompt = JSON.stringify({
      tool: 'search_companies',
      args: { query: 'cloud', limit: 1 },
    });

    await wrapped.callApi(prompt, redteamContext(prompt));

    expect(providerManagerMocks.getProvider).not.toHaveBeenCalled();
    expect(promptfooProviderMocks.materializeMcpToolCallRemote).not.toHaveBeenCalled();
    expect(target.calls).toHaveLength(1);
    expect(parseToolCall(target.calls[0].prompt)).toEqual({
      tool: 'search_companies',
      args: { query: 'cloud', limit: 1 },
    });
  });

  it('forwards directly when the MCP provider has no tools', async () => {
    const target = new FakeMcpProvider([]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        strategyId: 'jailbreak:hydra',
      },
    });

    const options = { includeLogProbs: true };

    const response = await wrapped.callApi('Plain prompt', undefined, options);

    expect(response).toEqual({ output: 'ok' });
    expect(providerManagerMocks.getProvider).not.toHaveBeenCalled();
    expect(promptfooProviderMocks.materializeMcpToolCallRemote).not.toHaveBeenCalled();
    expect(target.calls).toEqual([{ prompt: 'Plain prompt', context: undefined, options }]);
  });

  it('uses local fallback materialization when remote generation is disabled', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(undefined);
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output: JSON.stringify(searchCompaniesCall),
        tokenUsage: { prompt: 9, completion: 4, total: 13 },
      }),
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    const response = await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(promptfooProviderMocks.materializeMcpToolCallRemote).toHaveBeenCalledTimes(1);
    expect(providerManagerMocks.getProvider).toHaveBeenCalledWith({ jsonOnly: true });
    expect(parseToolCall(target.calls[0].prompt)).toEqual(searchCompaniesCall);
    expect(response.tokenUsage?.attacker).toMatchObject({
      prompt: 9,
      completion: 4,
      total: 13,
      numRequests: 1,
    });
  });

  it('preserves provider identity helpers and cleanup behavior', async () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'bias:age',
      },
    });

    expect(wrapped.id()).toBe('mcp');
    expect(wrapped.toString?.()).toBe('[MCP Provider]');

    await wrapped.cleanup?.();

    expect(target.cleanupCalls).toBe(1);
  });

  it('preserves cached local materialization in logical but not incurred attacker usage', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(undefined);
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output: JSON.stringify(searchCompaniesCall),
        cached: true,
        tokenUsage: {
          prompt: 9,
          completion: 4,
          total: 13,
          assertions: { total: 5, numRequests: 1 },
          incurredTokenUsage: {
            prompt: 9,
            completion: 4,
            total: 13,
            numRequests: 1,
            assertions: { total: 5, numRequests: 1 },
          },
        },
      }),
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));
    const response = await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(response.tokenUsage).toMatchObject({
      numRequests: 1,
      attacker: { total: 13, prompt: 9, completion: 4, cached: 13, numRequests: 1 },
      assertions: { total: 5, numRequests: 1 },
      incurredTokenUsage: {
        numRequests: 1,
        attacker: { total: 0, numRequests: 0 },
        assertions: { total: 0, numRequests: 0 },
      },
    });
    expect(target.calls).toHaveLength(1);
  });

  it('does not confuse a fully prompt-cached local request with a cached response', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(undefined);
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output: JSON.stringify(searchCompaniesCall),
        cached: false,
        tokenUsage: { prompt: 13, completion: 0, total: 13, cached: 13, numRequests: 0 },
      }),
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));
    const response = await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(response.tokenUsage?.attacker).toMatchObject({
      total: 13,
      prompt: 13,
      cached: 13,
      numRequests: 0,
    });
    expect(response.tokenUsage).not.toHaveProperty('incurredTokenUsage');
  });

  it('returns a materialization error when inference provider is unavailable', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(undefined);
    providerManagerMocks.getProvider.mockRejectedValueOnce(
      new Error('No repair provider configured'),
    );

    const target = new FakeMcpProvider([
      {
        name: 'list_industries',
        description: 'List industries.',
        inputSchema: { type: 'object', properties: {} },
      },
      searchCompaniesTool,
    ]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'sql-injection',
        purpose: 'Search companies',
      },
    });

    await expect(
      wrapped.callApi(
        'Search for clean energy companies.',
        redteamContext('Search for clean energy companies.', 'sql-injection'),
      ),
    ).resolves.toEqual({
      error: expect.stringContaining('Failed to materialize MCP target prompt'),
    });
    expect(target.calls).toHaveLength(0);
  });

  it('returns a materialization error when inference provider calls fail', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(undefined);
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => {
        throw new Error('Repair provider failed');
      },
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await expect(wrapped.callApi(searchCompaniesPrompt, redteamContext())).resolves.toEqual({
      error: expect.stringContaining('Failed to materialize MCP target prompt'),
    });
    expect(target.calls).toHaveLength(0);
  });

  it('preserves paid materialization usage when the inference request fails', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(undefined);
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => {
        throw Object.assign(new Error('Repair provider failed'), {
          tokenUsage: { prompt: 9, completion: 4, total: 13 },
        });
      },
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));
    const response = await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(response).toMatchObject({
      error: expect.stringContaining('Failed to materialize MCP target prompt'),
      tokenUsage: {
        numRequests: 0,
        attacker: { total: 13, prompt: 9, completion: 4, numRequests: 1 },
      },
    });
    expect(target.calls).toHaveLength(0);
  });

  it('does not invent target probes when cached materialization returns invalid output', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(undefined);
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output: 'invalid cached tool call',
        cached: true,
        tokenUsage: {
          prompt: 9,
          completion: 4,
          total: 13,
          assertions: { total: 5, numRequests: 1 },
          incurredTokenUsage: {
            total: 13,
            numRequests: 1,
            assertions: { total: 5, numRequests: 1 },
          },
        },
      }),
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));
    const response = await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(response).toMatchObject({
      error: expect.stringContaining('Failed to materialize MCP target prompt'),
      tokenUsage: {
        numRequests: 0,
        attacker: { total: 13, cached: 13, numRequests: 1 },
        assertions: { total: 5, numRequests: 1 },
        incurredTokenUsage: {
          numRequests: 0,
          attacker: { total: 0, numRequests: 0 },
          assertions: { total: 0, numRequests: 0 },
        },
      },
    });
    expect(target.calls).toHaveLength(0);

    const evaluationUsage = createEmptyTokenUsage();
    accumulateResponseTokenUsage(evaluationUsage, response);
    expect(evaluationUsage).toMatchObject({
      numRequests: 0,
      incurredTokenUsage: { numRequests: 0 },
    });
  });

  it('counts an attempted target probe when cached materialization precedes a target error', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce({
      ...remoteMaterializedCall({ completion: 3, numRequests: 1, prompt: 7, total: 10 }),
      cached: true,
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const targetCall = vi
      .spyOn(target, 'callApi')
      .mockRejectedValueOnce(new Error('Target provider failed'));
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await expect(wrapped.callApi(searchCompaniesPrompt, redteamContext())).resolves.toMatchObject({
      error: expect.stringContaining('Target provider failed'),
      tokenUsage: {
        numRequests: 1,
        attacker: { total: 10, numRequests: 1 },
        incurredTokenUsage: {
          numRequests: 1,
          attacker: { total: 0, numRequests: 0 },
        },
      },
    });
    expect(targetCall).toHaveBeenCalledTimes(1);
  });

  it('returns a materialization error when the wrapped provider call fails', async () => {
    promptfooProviderMocks.materializeMcpToolCallRemote.mockResolvedValueOnce(
      remoteMaterializedCall(),
    );

    const target = new FakeMcpProvider([searchCompaniesTool]);
    vi.spyOn(target, 'callApi').mockRejectedValueOnce(new Error('Target provider failed'));
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await expect(wrapped.callApi(searchCompaniesPrompt, redteamContext())).resolves.toEqual({
      error: expect.stringContaining('Target provider failed'),
    });
  });

  it('does not wrap non-redteam MCP calls', () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);

    expect(maybeWrapMcpProviderForRedteam(target, { metadata: {} })).toBe(target);
  });

  it('does not wrap non-MCP providers for redteam calls', () => {
    const provider = {
      id: () => 'openai:test',
      callApi: vi.fn(),
    };

    expect(
      maybeWrapMcpProviderForRedteam(provider, {
        metadata: {
          pluginId: 'bias:age',
        },
      }),
    ).toBe(provider);
  });

  it('does not wrap the same MCP provider more than once', () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const test = { metadata: { pluginId: 'bias:age' } };
    const wrapped = maybeWrapMcpProviderForRedteam(target, test);

    expect(maybeWrapMcpProviderForRedteam(wrapped, test)).toBe(wrapped);
  });
});
