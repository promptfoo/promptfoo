import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache, getCache } from '../../src/cache';
import logger from '../../src/logger';
import {
  CLAUDE_CODE_MODEL_ALIASES,
  ClaudeCodeSDKProvider,
  FS_READONLY_ALLOWED_TOOLS,
} from '../../src/providers/claude-agent-sdk';
import { transformMCPConfigToClaudeCode } from '../../src/providers/mcp/transform';
import type { NonNullableUsage, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { MockInstance } from 'vitest';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cliState', () => ({
  default: { basePath: '/test/basePath' },
  basePath: '/test/basePath',
}));
vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
    resolvePackageEntryPoint: vi.fn(() => '@anthropic-ai/claude-agent-sdk'),
  };
});
vi.mock('../../src/providers/mcp/transform');
vi.mock('node:module', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    createRequire: vi.fn(() => ({
      resolve: vi.fn(() => '@anthropic-ai/claude-agent-sdk'),
    })),
  };
});

const mockQuery = vi.fn();
const mockTransformMCPConfigToClaudeCode = vi.mocked(transformMCPConfigToClaudeCode);

// Helper to create a complete NonNullableUsage object
const createMockUsage = (input = 0, output = 0): NonNullableUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation: {
    ephemeral_1h_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
  },
  server_tool_use: {
    web_search_requests: 0,
    web_fetch_requests: 0,
  },
  service_tier: 'standard',
});

// Helper to create mock Query response
const createMockQuery = (message: Partial<SDKMessage>): Query => {
  const generator = async function* (): AsyncGenerator<SDKMessage, void> {
    yield message as SDKMessage;
  };

  const query = generator() as Query;
  // Add the interrupt and setPermissionMode methods that Query extends with
  query.interrupt = vi.fn().mockResolvedValue(undefined);
  query.setPermissionMode = vi.fn().mockResolvedValue(undefined);

  return query;
};

// Helper to create mock success response
const createMockResponse = (
  result: string,
  usage?: { input_tokens?: number; output_tokens?: number },
  cost = 0.001,
  sessionId = 'test-session-123',
): Query => {
  return createMockQuery({
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    uuid: '12345678-1234-1234-1234-123456789abc' as `${string}-${string}-${string}-${string}-${string}`,
    result,
    usage: createMockUsage(usage?.input_tokens, usage?.output_tokens),
    total_cost_usd: cost,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    permission_denials: [],
  });
};

// Helper to create mock success response with structured output
const createMockStructuredResponse = (
  result: string,
  structuredOutput: unknown,
  usage?: { input_tokens?: number; output_tokens?: number },
  cost = 0.001,
  sessionId = 'test-session-123',
): Query => {
  return createMockQuery({
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    uuid: '12345678-1234-1234-1234-123456789abc' as `${string}-${string}-${string}-${string}-${string}`,
    result,
    structured_output: structuredOutput,
    usage: createMockUsage(usage?.input_tokens, usage?.output_tokens),
    total_cost_usd: cost,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    permission_denials: [],
  });
};

// Helper to create mock error response
const createMockErrorResponse = (
  errorSubtype: 'error_max_turns' | 'error_during_execution',
): Query => {
  return createMockQuery({
    type: 'result',
    subtype: errorSubtype,
    session_id: 'error-session',
    uuid: '87654321-4321-4321-4321-210987654321' as `${string}-${string}-${string}-${string}-${string}`,
    usage: createMockUsage(10, 0),
    total_cost_usd: 0.0001,
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: true,
    num_turns: 1,
    permission_denials: [],
  });
};

describe('ClaudeCodeSDKProvider', () => {
  let tempDirSpy: MockInstance;
  let statSyncSpy: MockInstance;
  let rmSyncSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup importModule to return our mockQuery
    const { importModule } = await import('../../src/esm');
    vi.mocked(importModule).mockResolvedValue({ query: mockQuery });

    // Default mocks
    mockTransformMCPConfigToClaudeCode.mockResolvedValue({});

    // File system mocks
    tempDirSpy = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/test-temp-dir');
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(function () {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearCache();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const provider = new ClaudeCodeSDKProvider();

      expect(provider.config).toEqual({});
      expect(provider.id()).toBe('anthropic:claude-agent-sdk');
    });

    it('should initialize with custom config', () => {
      const config = {
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
        max_turns: 5,
      };

      const provider = new ClaudeCodeSDKProvider({ config });

      expect(provider.config).toEqual(config);
      expect(provider.apiKey).toBe('test-key');
    });

    it('should use custom id when provided', () => {
      const provider = new ClaudeCodeSDKProvider({ id: 'custom-provider-id' });

      expect(provider.id()).toBe('custom-provider-id');
    });

    it('should warn about unknown model', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      new ClaudeCodeSDKProvider({ config: { model: 'unknown-model' } });

      expect(warnSpy).toHaveBeenCalledWith(
        'Using unknown model for Claude Agent SDK: unknown-model',
      );

      warnSpy.mockRestore();
    });

    it('should warn about unknown fallback model', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      new ClaudeCodeSDKProvider({ config: { fallback_model: 'unknown-fallback' } });

      expect(warnSpy).toHaveBeenCalledWith(
        'Using unknown model for Claude Agent SDK fallback: unknown-fallback',
      );

      warnSpy.mockRestore();
    });

    it('should not warn about Claude Agent SDK model aliases', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      // Test all Claude Agent SDK aliases
      CLAUDE_CODE_MODEL_ALIASES.forEach((alias) => {
        new ClaudeCodeSDKProvider({ config: { model: alias } });
        new ClaudeCodeSDKProvider({ config: { fallback_model: alias } });
      });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should not warn about known Anthropic models', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      new ClaudeCodeSDKProvider({ config: { model: 'claude-3-5-sonnet-20241022' } });
      new ClaudeCodeSDKProvider({ config: { fallback_model: 'claude-3-5-haiku-20241022' } });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('callApi', () => {
    describe('basic functionality', () => {
      it('should successfully call API with simple prompt', async () => {
        mockQuery.mockReturnValue(
          createMockResponse('Test response', { input_tokens: 10, output_tokens: 20 }, 0.002),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          output: 'Test response',
          tokenUsage: {
            prompt: 10,
            completion: 20,
            total: 30,
          },
          cost: 0.002,
          raw: expect.stringContaining('"type":"result"'),
          sessionId: 'test-session-123',
        });

        // Verify the raw contains the expected data
        const rawData = JSON.parse(result.raw as string);
        expect(rawData.type).toBe('result');
        expect(rawData.subtype).toBe('success');
        expect(rawData.result).toBe('Test response');
        expect(rawData.session_id).toBe('test-session-123');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            cwd: '/tmp/test-temp-dir',
            allowedTools: [], // no tools with no working directory
            strictMcpConfig: true,
          }),
        });
      });

      it('should handle SDK error response', async () => {
        mockQuery.mockReturnValue(createMockErrorResponse('error_during_execution'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Claude Agent SDK call failed: error_during_execution');
        expect(result.tokenUsage).toEqual({
          prompt: 10,
          completion: 0,
          total: undefined,
        });
      });

      it('should handle SDK exceptions', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(function () {});
        mockQuery.mockRejectedValue(new Error('Network error'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Error calling Claude Agent SDK: Error: Network error');
        expect(errorSpy).toHaveBeenCalledWith(
          'Error calling Claude Agent SDK: Error: Network error',
        );

        errorSpy.mockRestore();
      });

      it('should handle structured output response', async () => {
        const structuredData = { name: 'John', age: 30, active: true };
        mockQuery.mockReturnValue(
          createMockStructuredResponse('JSON response', structuredData, {
            input_tokens: 10,
            output_tokens: 20,
          }),
        );

        const provider = new ClaudeCodeSDKProvider({
          config: {
            output_format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'number' },
                  active: { type: 'boolean' },
                },
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        // When structured output is available, it should be the output
        expect(result.output).toEqual(structuredData);
        expect(result.metadata?.structuredOutput).toEqual(structuredData);
        expect(result.error).toBeUndefined();
      });

      it('should fall back to text result when no structured output', async () => {
        mockQuery.mockReturnValue(
          createMockResponse('Plain text response', { input_tokens: 10, output_tokens: 20 }),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Plain text response');
        expect(result.metadata?.structuredOutput).toBeUndefined();
      });

      it('should return error when API key is missing', async () => {
        // ensure process env won't provide the key or any other Claude Agent SDK env vars
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.CLAUDE_CODE_USE_BEDROCK;
        delete process.env.CLAUDE_CODE_USE_VERTEX;

        const provider = new ClaudeCodeSDKProvider();
        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /Anthropic API key is not set/,
        );
      });

      it('should not throw when using Bedrock or Vertex env vars', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider();

        // Set the env var in process.env for the test
        process.env.CLAUDE_CODE_USE_BEDROCK = 'true';

        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Response');

        delete process.env.CLAUDE_CODE_USE_BEDROCK;
      });
    });

    describe('working directory management', () => {
      it('should create temp directory when no working_dir specified', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(tempDirSpy).toHaveBeenCalledWith(
          expect.stringContaining('promptfoo-claude-agent-sdk-'),
        );
        expect(rmSyncSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      });

      it('should use custom working_dir when provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(statSyncSpy).toHaveBeenCalledWith('/custom/dir');
        expect(tempDirSpy).not.toHaveBeenCalled();
        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            cwd: '/custom/dir',
          }),
        });
        expect(rmSyncSpy).not.toHaveBeenCalled();
      });

      it('should error when working_dir does not exist', async () => {
        statSyncSpy.mockImplementation(function () {
          throw new Error('ENOENT: no such file or directory');
        });

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/nonexistent/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /Working dir \/nonexistent\/dir does not exist/,
        );
      });

      it('should error when working_dir is not a directory', async () => {
        statSyncSpy.mockReturnValue({
          isDirectory: () => false,
        } as fs.Stats);

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/path/to/file.txt' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'Working dir /path/to/file.txt is not a directory',
        );
      });

      it('should cleanup temp dir even on error', async () => {
        mockQuery.mockRejectedValue(new Error('API error'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(rmSyncSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      });
    });

    describe('tool configuration', () => {
      it('should use no tools by default when no working directory is provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: [], // No tools when no working directory
          }),
        });
      });

      it('should use read-only tools by default when working directory is provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: './test-dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: FS_READONLY_ALLOWED_TOOLS,
          }),
        });
      });

      it('should handle allowed tools configuration', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Test default allowed tools with working directory
        const provider1 = new ClaudeCodeSDKProvider({
          config: { working_dir: './test-dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider1.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: FS_READONLY_ALLOWED_TOOLS,
          }),
        });

        // Test custom_allowed_tools replaces defaults
        mockQuery.mockClear();
        const provider2 = new ClaudeCodeSDKProvider({
          config: { custom_allowed_tools: ['Edit', 'Write'] },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider2.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: ['Edit', 'Write'],
          }),
        });

        // Test append_allowed_tools with deduplication
        mockQuery.mockClear();
        const provider3 = new ClaudeCodeSDKProvider({
          config: {
            working_dir: './test-dir',
            append_allowed_tools: ['Write', 'Read'], // Read is duplicate
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider3.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: [...FS_READONLY_ALLOWED_TOOLS, 'Write'],
          }),
        });
      });

      it('should handle disallowed tools and conflicting configurations', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Test disallowed_tools
        const provider1 = new ClaudeCodeSDKProvider({
          config: { disallowed_tools: ['Edit', 'Write'] },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider1.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            disallowedTools: ['Edit', 'Write'],
          }),
        });

        // Test error when both custom and append tools specified
        const provider2 = new ClaudeCodeSDKProvider({
          config: {
            custom_allowed_tools: ['Write'],
            append_allowed_tools: ['Edit'],
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider2.callApi('Test prompt')).rejects.toThrow(
          'Cannot specify both custom_allowed_tools and append_allowed_tools',
        );
      });
    });

    describe('config merging', () => {
      it('should merge provider and prompt configs', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: {
            max_turns: 5,
            model: 'claude-3-5-sonnet-20241022',
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: {
              max_thinking_tokens: 1000,
              permission_mode: 'plan',
            },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            maxTurns: 5,
            model: 'claude-3-5-sonnet-20241022',
            maxThinkingTokens: 1000,
            permissionMode: 'plan',
          }),
        });
      });

      it('should prioritize prompt config over provider config', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { max_turns: 5 },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: { max_turns: 10 },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            maxTurns: 10,
          }),
        });
      });
    });

    describe('MCP configuration', () => {
      it('should transform MCP config', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));
        mockTransformMCPConfigToClaudeCode.mockResolvedValue({
          'test-server': {
            command: 'test-command',
            args: ['arg1'],
          },
        });

        const provider = new ClaudeCodeSDKProvider({
          config: {
            mcp: {
              enabled: true,
              server: {
                name: 'test-server',
                command: 'test-command',
                args: ['arg1'],
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockTransformMCPConfigToClaudeCode).toHaveBeenCalledWith({
          enabled: true,
          server: {
            name: 'test-server',
            command: 'test-command',
            args: ['arg1'],
          },
        });

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            mcpServers: {
              'test-server': {
                command: 'test-command',
                args: ['arg1'],
              },
            },
            strictMcpConfig: true,
          }),
        });
      });

      it('should handle strict_mcp_config false', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { strict_mcp_config: false },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            strictMcpConfig: false,
          }),
        });
      });
    });

    describe('abort signal', () => {
      it('should handle abort signal scenarios', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Test normal abort signal propagation - use unique prompt
        const abortController1 = new AbortController();
        const result1 = await provider.callApi('Abort test prompt 1', undefined, {
          abortSignal: abortController1.signal,
        });

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Abort test prompt 1',
          options: expect.objectContaining({
            abortController: expect.any(AbortController),
          }),
        });

        expect(result1.output).toBe('Response');

        // Test pre-aborted signal
        mockQuery.mockClear();
        const abortController2 = new AbortController();
        abortController2.abort();

        const result2 = await provider.callApi('Abort test prompt 2', undefined, {
          abortSignal: abortController2.signal,
        });

        expect(result2.error).toBe('Claude Agent SDK call aborted before it started');
        expect(mockQuery).not.toHaveBeenCalled();

        // Test abort during execution
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
        const abortError = new Error('AbortError');
        abortError.name = 'AbortError';
        mockQuery.mockRejectedValue(abortError);

        const result3 = await provider.callApi('Abort test prompt 3', undefined, {
          abortSignal: new AbortController().signal,
        });

        expect(result3.error).toBe('Claude Agent SDK call aborted');
        expect(warnSpy).toHaveBeenCalledWith('Claude Agent SDK call aborted');

        warnSpy.mockRestore();
      });
    });

    describe('Claude Agent SDK specific configuration', () => {
      describe('should pass all Claude Agent SDK specific options', () => {
        it('with custom system prompt', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'acceptEdits',
              custom_system_prompt: 'Custom prompt',
              model: 'claude-3-5-sonnet-20241022',
              fallback_model: 'claude-3-5-haiku-20241022',
              max_turns: 10,
              max_thinking_tokens: 2000,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'acceptEdits',
              systemPrompt: 'Custom prompt',
              model: 'claude-3-5-sonnet-20241022',
              fallbackModel: 'claude-3-5-haiku-20241022',
              maxTurns: 10,
              maxThinkingTokens: 2000,
            }),
          });
        });

        it('with plugins configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const plugins = [
            { type: 'local' as const, path: './my-plugin' },
            { type: 'local' as const, path: '/absolute/path/to/plugin' },
          ];

          const provider = new ClaudeCodeSDKProvider({
            config: {
              plugins,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              plugins,
            }),
          });
        });

        it('with maxBudgetUsd configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              max_budget_usd: 5.0,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              maxBudgetUsd: 5.0,
            }),
          });
        });

        it('with additionalDirectories configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const additionalDirectories = ['/path/to/dir1', '/path/to/dir2'];

          const provider = new ClaudeCodeSDKProvider({
            config: {
              additional_directories: additionalDirectories,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              additionalDirectories,
            }),
          });
        });

        it('with session management configuration (resume, forkSession, continue)', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              resume: 'session-123',
              fork_session: true,
              resume_session_at: 'message-uuid-456',
              continue: false,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              resume: 'session-123',
              forkSession: true,
              resumeSessionAt: 'message-uuid-456',
              continue: false,
            }),
          });
        });

        it('with programmatic agents configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const agents = {
            'code-reviewer': {
              description: 'Reviews code for issues',
              prompt: 'You are a code reviewer. Review the code carefully.',
              tools: ['Read', 'Grep', 'Glob'],
              model: 'sonnet' as const,
            },
            'test-writer': {
              description: 'Writes tests for code',
              prompt: 'You are a test writer. Write comprehensive tests.',
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              agents,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              agents,
            }),
          });
        });

        it('with outputFormat (structured output) configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const outputFormat = {
            type: 'json_schema' as const,
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
              required: ['name', 'age'],
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              output_format: outputFormat,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              outputFormat,
            }),
          });
        });

        it('with hooks configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          // Create a mock hook callback
          const mockHookCallback = vi.fn().mockResolvedValue({ continue: true });
          const hooks = {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [mockHookCallback],
              },
            ],
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              hooks,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              hooks,
            }),
          });
        });

        it('with ask_user_question configuration creates canUseTool callback', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              ask_user_question: {
                behavior: 'first_option',
              },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              canUseTool: expect.any(Function),
            }),
          });
        });

        it('with ask_user_question canUseTool callback handles AskUserQuestion tool', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              ask_user_question: { behavior: 'first_option' },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          // Get the canUseTool callback that was passed to query
          const callArgs = mockQuery.mock.calls[0][0];
          const canUseTool = callArgs.options.canUseTool;

          // Test it handles AskUserQuestion and selects first option
          const result = await canUseTool(
            'AskUserQuestion',
            {
              questions: [
                {
                  question: 'Which option?',
                  header: 'Test',
                  options: [
                    { label: 'Option A', description: 'First' },
                    { label: 'Option B', description: 'Second' },
                  ],
                  multiSelect: false,
                },
              ],
            },
            { signal: new AbortController().signal, toolUseID: 'test-id' },
          );

          expect(result).toEqual({
            behavior: 'allow',
            updatedInput: {
              questions: expect.any(Array),
              answers: { 'Which option?': 'Option A' },
            },
          });
        });

        it('with includePartialMessages configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              include_partial_messages: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              includePartialMessages: true,
            }),
          });
        });

        it('with betas configuration for 1M context window', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              betas: ['context-1m-2025-08-07'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              betas: ['context-1m-2025-08-07'],
            }),
          });
        });

        it('with dontAsk permission mode', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'dontAsk',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'dontAsk',
            }),
          });
        });

        it('with sandbox configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            autoAllowBashIfSandboxed: true,
            network: {
              allowedDomains: ['api.example.com'],
              allowLocalBinding: true,
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox network proxy configuration (httpProxyPort, socksProxyPort)', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            network: {
              httpProxyPort: 8080,
              socksProxyPort: 1080,
              allowedDomains: ['api.example.com'],
              allowAllUnixSockets: true,
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox excludedCommands and enableWeakerNestedSandbox', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            enableWeakerNestedSandbox: true,
            excludedCommands: ['docker', 'podman', 'kubectl'],
            allowUnsandboxedCommands: true,
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox ripgrep configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            ripgrep: {
              command: '/usr/local/bin/rg',
              args: ['--hidden', '--no-ignore'],
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox ignoreViolations configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            ignoreViolations: {
              'git*': ['network'],
              'npm*': ['filesystem', 'network'],
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox network allowUnixSockets configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            network: {
              allowUnixSockets: ['/var/run/docker.sock', '/tmp/mysql.sock'],
              allowLocalBinding: true,
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with delegate permission mode', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'delegate',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'delegate',
            }),
          });
        });

        it('with bypassPermissions mode requires allow_dangerously_skip_permissions', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          // Should fail without the safety flag
          const provider1 = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'bypassPermissions',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          await expect(provider1.callApi('Test prompt')).rejects.toThrow(
            "permission_mode 'bypassPermissions' requires allow_dangerously_skip_permissions: true as a safety measure",
          );

          // Should succeed with the safety flag
          const provider2 = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'bypassPermissions',
              allow_dangerously_skip_permissions: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const result = await provider2.callApi('Test prompt');

          expect(result.output).toBe('Response');
          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'bypassPermissions',
              allowDangerouslySkipPermissions: true,
            }),
          });
        });

        it('with permission_prompt_tool_name configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_prompt_tool_name: 'my-mcp-permission-tool',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionPromptToolName: 'my-mcp-permission-tool',
            }),
          });
        });

        it('with stderr callback configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const stderrCallback = vi.fn();
          const provider = new ClaudeCodeSDKProvider({
            config: {
              stderr: stderrCallback,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              stderr: stderrCallback,
            }),
          });
        });

        it('with executable and executable_args configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              executable: 'bun',
              executable_args: ['--smol'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              executable: 'bun',
              executableArgs: ['--smol'],
            }),
          });
        });

        it('with extra_args configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              extra_args: {
                verbose: null, // Boolean flag
                timeout: '30',
              },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              extraArgs: {
                verbose: null,
                timeout: '30',
              },
            }),
          });
        });

        it('with path_to_claude_code_executable configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              path_to_claude_code_executable: '/custom/path/to/claude-code',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              pathToClaudeCodeExecutable: '/custom/path/to/claude-code',
            }),
          });
        });

        it('with setting_sources configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              setting_sources: ['user', 'project', 'local'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              settingSources: ['user', 'project', 'local'],
            }),
          });
        });

        it('with tools configuration as array', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              tools: ['Bash', 'Read', 'Edit'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              tools: ['Bash', 'Read', 'Edit'],
            }),
          });
        });

        it('with tools configuration as preset', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              tools: { type: 'preset', preset: 'claude_code' },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              tools: { type: 'preset', preset: 'claude_code' },
            }),
          });
        });

        it('with tools as empty array to disable all tools', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              tools: [],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              tools: [],
            }),
          });
        });

        it('with enable_file_checkpointing configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              enable_file_checkpointing: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              enableFileCheckpointing: true,
            }),
          });
        });

        it('with persist_session configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              persist_session: false,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              persistSession: false,
            }),
          });
        });

        it('with spawn_claude_code_process callback', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const spawnCallback = vi.fn();
          const provider = new ClaudeCodeSDKProvider({
            config: {
              spawn_claude_code_process: spawnCallback,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              spawnClaudeCodeProcess: spawnCallback,
            }),
          });
        });

        it('with append system prompt', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'acceptEdits',
              append_system_prompt: 'Append this',
              model: 'claude-3-5-sonnet-20241022',
              fallback_model: 'claude-3-5-haiku-20241022',
              max_turns: 10,
              max_thinking_tokens: 2000,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'acceptEdits',
              systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: 'Append this',
              },
              model: 'claude-3-5-sonnet-20241022',
              fallbackModel: 'claude-3-5-haiku-20241022',
              maxTurns: 10,
              maxThinkingTokens: 2000,
            }),
          });
        });
      });
    });

    describe('caching behavior', () => {
      it('should cache responses', async () => {
        mockQuery.mockImplementation(function () {
          return createMockResponse('Cached response', { input_tokens: 10, output_tokens: 20 });
        });

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call - should hit the API
        const result1 = await provider.callApi('Test prompt');
        expect(result1.output).toBe('Cached response');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Second call with same prompt - should use cache
        const result2 = await provider.callApi('Test prompt');
        // Check if we got a result at all
        expect(result2).toBeDefined();
        // If cache worked, mockQuery should still only be called once
        expect(mockQuery).toHaveBeenCalledTimes(1);
        // And we should get the same output
        expect(result2.output).toBe('Cached response');

        // Third call with different prompt - should hit API again
        const result3 = await provider.callApi('Different prompt');
        expect(result3.output).toBe('Cached response');
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('should respect bustCache parameter', async () => {
        mockQuery.mockReturnValue(
          createMockResponse('Response v1', { input_tokens: 10, output_tokens: 20 }),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call - populates cache
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Second call without bustCache - uses cache
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Update mock response for next call
        mockQuery.mockReturnValue(
          createMockResponse('Response v2', { input_tokens: 15, output_tokens: 25 }),
        );

        // Third call with bustCache - bypasses cache for read but still writes
        const result = await provider.callApi('Test prompt', {
          bustCache: true,
        } as CallApiContextParams);
        expect(result.output).toBe('Response v2');
        expect(mockQuery).toHaveBeenCalledTimes(2);

        // Fourth call without bustCache - should get the updated cached value
        const result2 = await provider.callApi('Test prompt');
        expect(result2.output).toBe('Response v2');
        expect(mockQuery).toHaveBeenCalledTimes(2); // Still only 2 calls total
      });

      it('should handle working directory fingerprinting', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Mock filesystem for working directory fingerprinting
        const readdirSyncSpy = vi.spyOn(fs, 'readdirSync');
        readdirSyncSpy.mockReturnValue([
          { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
          { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
        ] as any);

        const originalStatSync = statSyncSpy.getMockImplementation();
        statSyncSpy.mockImplementation(function (path: any) {
          if (path === '/custom/dir') {
            return {
              isDirectory: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          if (path.includes('file1.txt') || path.includes('file2.txt')) {
            return {
              isFile: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          return originalStatSync?.(path) ?? ({} as fs.Stats);
        });

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call with working directory
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Second call with same working directory - should use cache
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Simulate file change by updating mtime
        statSyncSpy.mockImplementation(function (path: any) {
          if (path === '/custom/dir') {
            return {
              isDirectory: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          if (path.includes('file1.txt')) {
            return {
              isFile: () => true,
              mtimeMs: 9999999999, // Changed mtime
            } as fs.Stats;
          }
          if (path.includes('file2.txt')) {
            return {
              isFile: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          return originalStatSync?.(path) ?? ({} as fs.Stats);
        });

        // Clear cache to simulate new provider instance
        await clearCache();

        const provider2 = new ClaudeCodeSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Third call with changed file - should NOT use cache
        await provider2.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(2);

        readdirSyncSpy.mockRestore();
      });

      it('should handle cache disabled globally', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        disableCache();

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Even with read-only config, should not cache when disabled
        await provider.callApi('Test prompt');
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(2);

        // Re-enable cache for other tests
        enableCache();
      });

      it('should handle cache errors gracefully', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Mock cache.set to throw an error
        const cache = await getCache();
        const setSpy = vi.spyOn(cache, 'set').mockImplementation(async function () {
          throw new Error('Cache write failed');
        });

        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(function () {});

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Should complete successfully even if cache write fails
        const result = await provider.callApi('Test prompt');
        expect(result.output).toBe('Response');
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error caching response'));

        errorSpy.mockRestore();
        setSpy.mockRestore();
      });
    });
  });
});
