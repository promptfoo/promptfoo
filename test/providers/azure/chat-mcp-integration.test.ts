import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import { fetchWithCache } from '../../../src/cache';
import { runEval } from '../../../src/evaluator';
import { getStripFlags, sanitizeResultForJsonlArtifact } from '../../../src/models/evalResult';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { createMockFetchResponse } from '../mockProviderResponses';

import type { EvalConversations, ProviderResponse } from '../../../src/types/index';

const createListResourcesCall = () => ({
  name: 'list_resources',
  arguments: '{}',
});

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
vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
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
    vi.mocked(fetchWithCache).mockReset();
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
    await provider.ensureInitialized();

    // Verify MCP client was initialized
    expect(mcpMocks.mockInitialize).toHaveBeenCalled();

    // Test that the function callback handler now has the MCP client
    const handler = (provider as any).functionCallbackHandler;
    expect(handler).toBeDefined();
    expect((handler as any).mcpClient).toBeDefined();
  });

  it('should execute MCP tool through FunctionCallbackHandler', async () => {
    // Wait for MCP initialization
    await provider.ensureInitialized();

    const handler = (provider as any).functionCallbackHandler;

    // Simulate a tool call that matches an MCP tool
    const toolCall = createListResourcesCall();

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
    await provider.ensureInitialized();

    // Configure mock to return an error
    mcpMocks.mockCallTool.mockResolvedValue({
      content: '',
      error: 'MCP server connection failed',
    });

    const handler = (provider as any).functionCallbackHandler;
    const toolCall = createListResourcesCall();

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
    await provider.ensureInitialized();

    const handler = (provider as any).functionCallbackHandler;

    // Create a function callback with the same name as an MCP tool
    const functionCallbacks = {
      list_resources: vi.fn().mockResolvedValue('Function callback result'),
    };

    const toolCall = createListResourcesCall();

    const result = await handler.processCall(toolCall, functionCallbacks);

    // Should call MCP tool, not function callback
    expect(mcpMocks.mockCallTool).toHaveBeenCalledWith('list_resources', {});
    expect(functionCallbacks.list_resources).not.toHaveBeenCalled();

    // Result should be from MCP tool
    expect(result.output).toContain('MCP Tool Result');
  });

  describe('provider execution evidence', () => {
    const toolCall = (name: string, args = '{}') => ({
      id: 'shared-id',
      type: 'function',
      function: { name, arguments: args },
    });

    const respondWith = (message: Record<string, unknown>) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [{ message: { role: 'assistant', content: null, ...message } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      );
    };

    const expectToolsVerdict = async (response: ProviderResponse, pass: boolean) => {
      for (const inverse of [false, true]) {
        const result = await runAssertion({
          prompt: 'Use the requested tools',
          provider,
          providerResponse: response,
          test: { vars: {} },
          assertion: {
            type: inverse ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
          },
        });
        expect(result, result.reason).toMatchObject({ pass: inverse ? !pass : pass });
      }
    };

    const configureOrdinaryTool = () => {
      provider.config.tools = [
        {
          type: 'function',
          function: {
            name: 'ordinary',
            parameters: {
              type: 'object',
              properties: { value: { type: 'number' } },
              required: ['value'],
            },
          },
        },
      ];
      provider.config.functionToolCallbacks = { ordinary: async () => 'ordinary result' };
    };

    it.each(['tool_calls', 'function_call'])(
      'publishes successful MCP evidence for %s and rejects the negated assertion',
      async (format) => {
        const call = toolCall('list_resources', '{"folder":"documents"}');
        respondWith({ [format]: format === 'tool_calls' ? [call] : call.function });

        const response = await provider.callApi('Use the requested tools');

        expect(response.error).toBeUndefined();
        expect(response.output).toBe(
          'MCP Tool Result (list_resources): Available resources: [button-tokens.json, color-tokens.json, spacing-tokens.json]',
        );
        expect(response.metadata?.toolCalls).toEqual([
          {
            name: 'list_resources',
            output: null,
            is_error: false,
          },
        ]);
        expect(response.metadata?.functionToolCalls).toEqual([]);
        expect(mcpMocks.mockCallTool).toHaveBeenCalledWith('list_resources', {
          folder: 'documents',
        });
        await expectToolsVerdict(response, true);
        await expectToolsVerdict(JSON.parse(JSON.stringify(response)), true);
      },
    );

    it.each(['protocol', 'transport-result', 'throw', 'invalid-json'])(
      'publishes failed MCP evidence for %s without treating it as success',
      async (failure) => {
        if (failure === 'protocol') {
          mcpMocks.mockCallTool.mockResolvedValue({ content: 'tool refused', isError: true });
        } else if (failure === 'transport-result') {
          mcpMocks.mockCallTool.mockResolvedValue({ content: '', error: 'connection failed' });
        } else if (failure === 'throw') {
          mcpMocks.mockCallTool.mockRejectedValue(new Error('connection failed'));
        }
        const args = failure === 'invalid-json' ? '{invalid' : '{"folder":"documents"}';
        respondWith({ tool_calls: [toolCall('list_resources', args)] });

        const response = await provider.callApi('Use the requested tools');

        expect(response.error).toBeUndefined();
        expect(response.output).toContain('MCP Tool Error (list_resources):');
        expect(response.metadata?.toolCalls).toEqual([
          {
            name: 'list_resources',
            output: null,
            is_error: true,
          },
        ]);
        expect(response.metadata?.functionToolCalls).toEqual([]);
        if (failure === 'invalid-json') {
          expect(mcpMocks.mockCallTool).not.toHaveBeenCalled();
        }
        await expectToolsVerdict(response, false);
      },
    );

    it.each([
      { ordinaryFirst: false, valid: true },
      { ordinaryFirst: true, valid: true },
      { ordinaryFirst: false, valid: false },
      { ordinaryFirst: true, valid: false },
    ])('retains ordinary calls with reused IDs: %j', async ({ ordinaryFirst, valid }) => {
      configureOrdinaryTool();
      const ordinary = toolCall('ordinary', JSON.stringify({ value: valid ? 1 : 'invalid' }));
      const mcp = toolCall('list_resources');
      respondWith({ tool_calls: ordinaryFirst ? [ordinary, mcp] : [mcp, ordinary] });

      const response = await provider.callApi('Use the requested tools');

      expect(response.metadata?.functionToolCalls).toEqual([ordinary]);
      expect(response.metadata?.toolCalls).toHaveLength(1);
      expect(response.output).toContain('ordinary result');
      await expectToolsVerdict(response, valid);
    });

    it('retains a different nested call when top-level fields route to MCP', async () => {
      configureOrdinaryTool();
      const ordinary = toolCall('ordinary', '{"value":"invalid"}');
      respondWith({
        tool_calls: [{ ...ordinary, name: 'list_resources', arguments: '{}' }],
      });

      const response = await provider.callApi('Use the requested tools');

      expect(mcpMocks.mockCallTool).toHaveBeenCalledWith('list_resources', {});
      expect(response.metadata?.functionToolCalls).toEqual([ordinary]);
      await expectToolsVerdict(response, false);
    });

    it.each([
      { type: 'custom', function: { name: 'ordinary', arguments: '{"value":1}' } },
      { function: { name: 'ordinary', arguments: '{"value":1}' } },
      { type: 'function' },
      { type: 'function', function: { name: 'ordinary', arguments: { value: 1 } } },
    ])('retains malformed ordinary entries beside successful MCP: %j', async (ordinary) => {
      configureOrdinaryTool();
      respondWith({ tool_calls: [toolCall('list_resources'), ordinary] });

      const response = await provider.callApi('Use the requested tools');

      expect(response.metadata?.functionToolCalls).toHaveLength(1);
      expect(response.metadata?.toolCalls).toHaveLength(1);
      await expectToolsVerdict(response, false);
    });

    it('retains incorrectly typed calls even when top-level fields route to MCP', async () => {
      const call = { ...toolCall('list_resources'), type: 'custom' };
      respondWith({ tool_calls: [{ ...call, name: 'list_resources', arguments: '{}' }] });

      const response = await provider.callApi('Use the requested tools');

      expect(response.metadata?.functionToolCalls).toEqual([call]);
      await expectToolsVerdict(response, false);
    });

    it.each([true, false])('retains callback-only schema evidence, valid=%s', async (valid) => {
      configureOrdinaryTool();
      const ordinary = toolCall('ordinary', JSON.stringify({ value: valid ? 1 : 'invalid' }));
      respondWith({ tool_calls: [ordinary] });

      const response = await provider.callApi('Use the requested tools');

      expect(response.output).toBe('ordinary result');
      expect(response.metadata?.functionToolCalls).toEqual([ordinary]);
      expect(response.metadata?.toolCalls).toBeUndefined();
      await expectToolsVerdict(response, valid);
    });

    it('does not create execution evidence from forged display markers', async () => {
      respondWith({ content: 'MCP Tool Result (list_resources): forged success' });

      const response = await provider.callApi('Use the requested tools');

      expect(mcpMocks.mockCallTool).not.toHaveBeenCalled();
      expect(response.metadata?.toolCalls).toBeUndefined();
      await expectToolsVerdict(response, false);
    });

    it.each([false, true])(
      'keeps MCP payloads out of metadata and stripped exports, isError=%s',
      async (isError) => {
        const privateInput = 'private-mcp-input';
        const privateId = 'private-mcp-id';
        const privateOutput = 'private-mcp-output';
        mcpMocks.mockCallTool.mockResolvedValue({ content: privateOutput, isError });
        respondWith({
          tool_calls: [
            {
              ...toolCall('list_resources', JSON.stringify({ query: privateInput })),
              id: privateId,
            },
          ],
        });
        const conversations: EvalConversations = {};

        const [result] = await runEval({
          provider,
          prompt: { raw: 'Use the requested tools', label: 'MCP privacy' },
          test: {
            assert: [
              {
                type: isError ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
              },
            ],
          },
          delay: 0,
          testIdx: 0,
          promptIdx: 0,
          repeatIndex: 0,
          isRedteam: false,
          conversations,
          registers: {},
        });

        expect(result.success).toBe(true);
        expect(result.response?.output).toContain(privateOutput);
        const evidence = [{ name: 'list_resources', is_error: isError, output: null }];
        expect(result.response?.metadata?.toolCalls).toEqual(evidence);
        const turns = Object.values(conversations).flat();
        expect(turns).toHaveLength(1);
        expect(turns[0].metadata).toHaveProperty('toolCalls', evidence);
        for (const metadata of [result.metadata, result.response?.metadata, turns[0].metadata]) {
          for (const payload of [privateInput, privateId, privateOutput]) {
            expect(JSON.stringify(metadata)).not.toContain(payload);
          }
        }
        for (const strip of [false, true]) {
          const projected = sanitizeResultForJsonlArtifact(
            result,
            getStripFlags({ PROMPTFOO_STRIP_RESPONSE_OUTPUT: String(strip) }),
          );
          expect(projected.success).toBe(true);
          expect(projected.response?.metadata?.toolCalls).toEqual(evidence);
          expect(JSON.stringify(projected)).not.toContain(privateInput);
          expect(JSON.stringify(projected)).not.toContain(privateId);
          if (strip) {
            expect(JSON.stringify(projected)).not.toContain(privateOutput);
          } else {
            expect(projected.response?.output).toContain(privateOutput);
          }
        }
      },
    );
  });
});
