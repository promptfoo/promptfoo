import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    mcpMocks.mockInitialize.mockResolvedValue(undefined);
    mcpMocks.mockCleanup.mockResolvedValue(undefined);
    mcpMocks.mockGetAllTools.mockReturnValue([
      {
        name: 'list_resources',
        description: 'List available token system resources',
        inputSchema: { type: 'object' },
      },
    ]);
    mcpMocks.mockCallTool.mockResolvedValue({
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
