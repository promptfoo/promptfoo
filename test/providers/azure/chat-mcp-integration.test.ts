import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import { fetchWithCache } from '../../../src/cache';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';

const mcpMocks = vi.hoisted(() => {
  const mockInitialize = vi.fn().mockResolvedValue(undefined);
  const mockCleanup = vi.fn().mockResolvedValue(undefined);
  const mockGetAllTools = vi.fn().mockReturnValue([
    {
      name: 'list_resources',
      description: 'List available token system resources',
      inputSchema: { type: 'object' },
    },
  ]);
  const mockCallTool = vi.fn().mockResolvedValue({
    content: 'Available resources: [button-tokens.json, color-tokens.json, spacing-tokens.json]',
  });

  class MockMCPClient {
    initialize = mockInitialize;
    cleanup = mockCleanup;
    getAllTools = mockGetAllTools;
    callTool = mockCallTool;
  }

  return {
    MockMCPClient,
    mockInitialize,
    mockCleanup,
    mockGetAllTools,
    mockCallTool,
  };
});

// Mock external dependencies
vi.mock('../../../src/cache');
vi.mock('../../../src/logger');
vi.mock('../../../src/providers/mcp/client', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    MCPClient: mcpMocks.MockMCPClient,
  };
});

describe('AzureChatCompletionProvider MCP Integration', () => {
  let provider: AzureChatCompletionProvider;

  beforeEach(() => {
    // Reset mocks
    mcpMocks.mockInitialize.mockReset().mockResolvedValue(undefined);
    mcpMocks.mockCleanup.mockReset().mockResolvedValue(undefined);
    mcpMocks.mockGetAllTools.mockReset().mockReturnValue([
      {
        name: 'list_resources',
        description: 'List available token system resources',
        inputSchema: { type: 'object' },
      },
    ]);
    mcpMocks.mockCallTool.mockReset().mockResolvedValue({
      content: 'Available resources: [button-tokens.json, color-tokens.json, spacing-tokens.json]',
    });

    // Create provider with MCP enabled
    provider = new AzureChatCompletionProvider('test-deployment', {
      config: {
        apiKey: 'test-key',
        apiHost: 'https://test.openai.azure.com',
        mcp: {
          enabled: true,
          server: {
            command: 'npx',
            args: ['@fluentui-contrib/token-analyzer-mcp'],
            name: 'test-token-mcp',
          },
        },
      },
    });
  });

  afterEach(async () => {
    await provider.cleanup();
    vi.clearAllMocks();
  });

  it('should integrate MCP tools with FunctionCallbackHandler', async () => {
    // Wait for MCP initialization
    await (provider as any).initializationPromise;

    // Verify MCP client was initialized
    expect(mcpMocks.mockInitialize).toHaveBeenCalled();

    // Test that the function callback handler now has the MCP client
    const handler = (provider as any).functionCallbackHandler;
    expect(handler).toBeDefined();
    expect((handler as any).mcpClient).toBeDefined();
  });

  it('should execute MCP tool through FunctionCallbackHandler', async () => {
    // Wait for MCP initialization
    await (provider as any).initializationPromise;

    const handler = (provider as any).functionCallbackHandler;

    // Simulate a tool call that matches an MCP tool
    const toolCall = {
      name: 'list_resources',
      arguments: '{}',
    };

    const result = await handler.processCall(toolCall, {});

    // Verify MCP tool was called
    expect(mcpMocks.mockCallTool).toHaveBeenCalledWith('list_resources', {});

    // Verify result format matches expected pattern (not [object Object])
    expect(result).toEqual({
      output:
        'MCP Tool Result (list_resources): Available resources: [button-tokens.json, color-tokens.json, spacing-tokens.json]',
      isError: false,
    });

    // Ensure it's not the problematic [object Object] output
    expect(result.output).not.toContain('[object Object]');
  });

  it('returns structured MCP outcomes for assertion validation', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'list_resources', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    mcpMocks.mockCallTool
      .mockResolvedValueOnce({ content: 'real MCP success' })
      .mockResolvedValueOnce({ content: '', error: 'real MCP failure' });

    const successResponse = await provider.callApi('Use the MCP tool');
    const errorResponse = await provider.callApi('Use the MCP tool');

    expect(successResponse.metadata?.mcpToolCalls).toEqual([
      { name: 'list_resources', status: 'success' },
    ]);
    expect(errorResponse.metadata?.mcpToolCalls).toEqual([
      { name: 'list_resources', status: 'error', error: 'real MCP failure' },
    ]);

    const [successPositive, successInverse, errorPositive, errorInverse] = await Promise.all([
      runAssertion({
        assertion: { type: 'is-valid-openai-tools-call' },
        prompt: 'test',
        provider,
        providerResponse: successResponse,
        test: { vars: {} },
      }),
      runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'test',
        provider,
        providerResponse: successResponse,
        test: { vars: {} },
      }),
      runAssertion({
        assertion: { type: 'is-valid-openai-tools-call' },
        prompt: 'test',
        provider,
        providerResponse: errorResponse,
        test: { vars: {} },
      }),
      runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'test',
        provider,
        providerResponse: errorResponse,
        test: { vars: {} },
      }),
    ]);

    expect(successPositive).toMatchObject({ pass: true, score: 1 });
    expect(successInverse).toMatchObject({ pass: false, score: 0 });
    expect(errorPositive).toMatchObject({ pass: false, score: 0 });
    expect(errorInverse).toMatchObject({ pass: true, score: 1 });
  });

  it('does not treat MCP plus a successful ordinary callback as complete provenance', async () => {
    const ordinaryCallback = vi.fn().mockResolvedValue('ordinary result');
    (provider as any).config.functionToolCallbacks = { ordinary_tool: ordinaryCallback };
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_mcp',
                  type: 'function',
                  function: { name: 'list_resources', arguments: '{}' },
                },
                {
                  id: 'call_ordinary',
                  type: 'function',
                  function: { name: 'ordinary_tool', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    mcpMocks.mockCallTool.mockResolvedValue({ content: 'real MCP success' });

    const response = await provider.callApi('Use the MCP tool');

    expect(ordinaryCallback).toHaveBeenCalledOnce();
    expect(response.metadata).toMatchObject({
      mcpToolCalls: [{ name: 'list_resources', status: 'success' }],
      mcpToolCallsComplete: false,
    });
    for (const type of ['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const) {
      const result = await runAssertion({
        assertion: { type },
        prompt: 'test',
        provider,
        providerResponse: response,
        test: { vars: {} },
      });
      expect(result).toMatchObject({ pass: false, score: 0 });
    }
  });

  it('processes MCP calls even when the assistant also returns content', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'assistant summary',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'list_resources', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    mcpMocks.mockCallTool.mockResolvedValue({ content: 'real MCP success' });

    const response = await provider.callApi('Use the MCP tool');

    expect(mcpMocks.mockCallTool).toHaveBeenCalledWith('list_resources', {});
    expect(response).toMatchObject({
      output: 'MCP Tool Result (list_resources): real MCP success',
      metadata: {
        mcpToolCalls: [{ name: 'list_resources', status: 'success' }],
        mcpToolCallsComplete: true,
      },
    });
    const [positive, inverse] = await Promise.all(
      (['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const).map((type) =>
        runAssertion({
          assertion: { type },
          prompt: 'test',
          provider,
          providerResponse: response,
          test: { vars: {} },
        }),
      ),
    );
    expect(positive).toMatchObject({ pass: true, score: 1 });
    expect(inverse).toMatchObject({ pass: false, score: 0 });
  });

  it('preserves assistant content when tool calls have no configured handler', async () => {
    const providerWithoutHandlers = new AzureChatCompletionProvider('test-deployment', {
      config: {
        apiKey: 'test-key',
        apiHost: 'https://test.openai.azure.com',
      },
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'assistant summary',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'ordinary_tool', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    await expect(providerWithoutHandlers.callApi('Use a tool')).resolves.toMatchObject({
      output: 'assistant summary',
    });
  });

  it('preserves assistant content when MCP does not handle the emitted call', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'assistant summary',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'ordinary_tool', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const response = await provider.callApi('Use a tool');

    expect(response.output).toBe('assistant summary');
    expect(response.metadata?.mcpToolCalls).toBeUndefined();
    expect(mcpMocks.mockCallTool).not.toHaveBeenCalled();
  });

  it('preserves unmatched raw tool calls for assertion validation', async () => {
    (provider as any).config.tools = [
      {
        type: 'function',
        function: {
          name: 'ordinary_tool',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'ordinary_tool', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const response = await provider.callApi('Use a tool');

    expect(response.output).toEqual([
      {
        id: 'call_123',
        type: 'function',
        function: { name: 'ordinary_tool', arguments: '{}' },
      },
    ]);
    const [positive, inverse] = await Promise.all(
      (['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const).map((type) =>
        runAssertion({
          assertion: { type },
          provider,
          providerResponse: response,
          test: { vars: {} },
        }),
      ),
    );
    expect(positive).toMatchObject({ pass: true, score: 1 });
    expect(inverse).toMatchObject({ pass: false, score: 0 });
    expect(mcpMocks.mockCallTool).not.toHaveBeenCalled();
  });

  it('preserves assistant content when the MCP response has an empty tool-call array', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'assistant summary',
              tool_calls: [],
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const response = await provider.callApi('Answer normally');

    expect(response.output).toBe('assistant summary');
    expect(response.metadata?.mcpToolCalls).toBeUndefined();
    expect(mcpMocks.mockCallTool).not.toHaveBeenCalled();
  });

  it('should handle MCP tool errors gracefully', async () => {
    // Wait for MCP initialization
    await (provider as any).initializationPromise;

    // Configure mock to return an error
    mcpMocks.mockCallTool.mockResolvedValue({
      content: '',
      error: 'MCP server connection failed',
    });

    const handler = (provider as any).functionCallbackHandler;
    const toolCall = {
      name: 'list_resources',
      arguments: '{}',
    };

    const result = await handler.processCall(toolCall, {});

    expect(result).toEqual({
      output: 'MCP Tool Error (list_resources): MCP server connection failed',
      isError: true,
    });
  });

  it('should work without MCP enabled (backwards compatibility)', () => {
    // Create provider without MCP
    const providerWithoutMCP = new AzureChatCompletionProvider('test-deployment', {
      config: {
        apiKey: 'test-key',
        apiHost: 'https://test.openai.azure.com',
        // No MCP config
      },
    });

    // Should not have MCP client
    expect((providerWithoutMCP as any).mcpClient).toBeNull();

    // FunctionCallbackHandler should work without MCP client
    const handler = (providerWithoutMCP as any).functionCallbackHandler;
    expect(handler).toBeDefined();
    expect((handler as any).mcpClient).toBeUndefined();
  });

  it('should prioritize MCP tools over function callbacks', async () => {
    // Wait for MCP initialization
    await (provider as any).initializationPromise;

    const handler = (provider as any).functionCallbackHandler;

    // Create a function callback with the same name as an MCP tool
    const functionCallbacks = {
      list_resources: vi.fn().mockResolvedValue('Function callback result'),
    };

    const toolCall = {
      name: 'list_resources',
      arguments: '{}',
    };

    const result = await handler.processCall(toolCall, functionCallbacks);

    // Should call MCP tool, not function callback
    expect(mcpMocks.mockCallTool).toHaveBeenCalledWith('list_resources', {});
    expect(functionCallbacks.list_resources).not.toHaveBeenCalled();

    // Result should be from MCP tool
    expect(result.output).toContain('MCP Tool Result');
  });
});
