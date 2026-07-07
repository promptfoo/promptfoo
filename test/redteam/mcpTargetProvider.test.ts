import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPProvider } from '../../src/providers/mcp';
import { SequenceProvider } from '../../src/providers/sequence';
import { maybeWrapMcpProviderForRedteam } from '../../src/redteam/mcpTargetProvider';

import type { MCPTool } from '../../src/providers/mcp/types';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../src/types';

const providerManagerMocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
}));

vi.mock('../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: providerManagerMocks.getProvider,
  },
}));

class FakeMcpProvider extends MCPProvider {
  calls: { context?: CallApiContextParams; options?: CallApiOptionsParams; prompt: string }[] = [];
  cleanupCalls = 0;

  constructor(private readonly tools: MCPTool[]) {
    super({ config: { enabled: false }, id: 'mcp' });
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

  beforeEach(() => {
    providerManagerMocks.getProvider.mockReset();
  });

  it('materializes redteam target calls before they reach MCP providers', async () => {
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output: JSON.stringify(searchCompaniesCall),
      }),
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, redteamMetadata('harmful:hate'));

    await wrapped.callApi(searchCompaniesPrompt, redteamContext());

    expect(target.calls).toHaveLength(1);
    expect(parseToolCall(target.calls[0].prompt)).toEqual(searchCompaniesCall);
    expect(parseToolCall(target.calls[0].context?.vars.prompt)).toEqual(searchCompaniesCall);
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
    expect(target.calls).toEqual([{ prompt: 'Plain prompt', context: undefined, options }]);
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

  it('returns a materialization error when inference provider is unavailable', async () => {
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

  it('returns a materialization error when the wrapped provider call fails', async () => {
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output: JSON.stringify(searchCompaniesCall),
      }),
    });

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

  it('enforces metadata-only limits after Sequence renders the underlying call', async () => {
    const target = {
      id: () => 'openai:test',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    const test = { metadata: { pluginConfig: { minCharsPerMessage: 5 } } };
    const wrappedTarget = maybeWrapMcpProviderForRedteam(target, test);
    const sequence = new SequenceProvider({
      id: 'sequence',
      config: { inputs: ['x'] },
    });

    await expect(
      sequence.callApi('a sufficiently long outer prompt', {
        originalProvider: wrappedTarget,
        prompt: { raw: '{{prompt}}', label: 'prompt' },
        test,
        vars: {},
      }),
    ).rejects.toThrow('minCharsPerMessage=5');
    expect(target.callApi).not.toHaveBeenCalled();
  });

  it('does not wrap normalized layered agentic seed providers', () => {
    const test = {
      metadata: {
        strategyId: 'layer/hydra-audio:jailbreak:hydra/audio',
        strategyConfig: { minCharsPerMessage: 5 },
      },
    };
    const hydra = {
      id: () => 'promptfoo:redteam:hydra',
      callApi: vi.fn(),
    };
    const meta = {
      id: () => 'promptfoo:redteam:iterative:meta/tree',
      callApi: vi.fn(),
    };

    expect(maybeWrapMcpProviderForRedteam(hydra, test)).toBe(hydra);
    expect(maybeWrapMcpProviderForRedteam(meta, test)).toBe(meta);
  });

  it('wraps the final target even when layered agentic metadata is present', async () => {
    const target = {
      id: () => 'openai:test',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    const test = {
      metadata: {
        strategyId: 'layer/meta-base64:jailbreak:meta/base64',
        strategyConfig: { minCharsPerMessage: 5 },
      },
    };
    const wrappedTarget = maybeWrapMcpProviderForRedteam(target, test);

    await expect(
      wrappedTarget.callApi('tiny', {
        prompt: { raw: '{{prompt}}', label: 'prompt' },
        test,
        vars: {},
      }),
    ).rejects.toThrow('minCharsPerMessage=5');
    expect(target.callApi).not.toHaveBeenCalled();
  });

  it('blocks short mischievous-user target turns', async () => {
    const target = {
      id: () => 'openai:test',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    const test = {
      metadata: {
        strategyId: 'mischievous-user',
        strategyConfig: { minCharsPerMessage: 5 },
      },
    };
    const wrappedTarget = maybeWrapMcpProviderForRedteam(target, test);

    await expect(
      wrappedTarget.callApi('tiny', {
        prompt: { raw: '{{prompt}}', label: 'prompt' },
        test,
        vars: {},
      }),
    ).rejects.toThrow('minCharsPerMessage=5');
    expect(target.callApi).not.toHaveBeenCalled();
  });

  it('does not reject short raw MCP intents when normalized more than once', async () => {
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({ output: JSON.stringify(searchCompaniesCall) }),
    });
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const test = { metadata: { pluginConfig: { minCharsPerMessage: 20 } } };
    const wrapped = maybeWrapMcpProviderForRedteam(target, test);
    const normalizedAgain = maybeWrapMcpProviderForRedteam(wrapped, test);

    await normalizedAgain.callApi('x', {
      ...redteamContext('x'),
      test,
    });

    expect(normalizedAgain).toBe(wrapped);
    expect(target.calls).toHaveLength(1);
    expect(parseToolCall(target.calls[0].prompt)).toEqual(searchCompaniesCall);
  });

  it('enforces limits after MCP materializes the underlying call', async () => {
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({ output: JSON.stringify(searchCompaniesCall) }),
    });
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const test = { metadata: { pluginConfig: { maxCharsPerMessage: 20 } } };
    const wrapped = maybeWrapMcpProviderForRedteam(target, test);

    await expect(
      wrapped.callApi('x', {
        ...redteamContext('x'),
        test,
      }),
    ).rejects.toThrow('maxCharsPerMessage=20');
    expect(target.calls).toHaveLength(0);
  });
});
