import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { importModule } from '../../src/esm';
import logger from '../../src/logger';
import { OpenAICodexSDKProvider } from '../../src/providers/openai/codex-sdk';

import type { CallApiContextParams } from '../../src/types/index';

const mockRun = vi.fn();
const mockRunStreamed = vi.fn();
const mockStartThread = vi.fn();
const mockResumeThread = vi.fn();

// Mock thread instance
const mockThread = {
  id: 'test-thread-123',
  run: mockRun,
  runStreamed: mockRunStreamed,
};

// Mock Codex class
const MockCodex = vi.fn().mockImplementation(function () {
  return {
    startThread: mockStartThread.mockReturnValue(mockThread),
    resumeThread: mockResumeThread.mockReturnValue(mockThread),
  };
});

// Mock SDK module export
const mockCodexSDK = {
  __esModule: true,
  Codex: MockCodex,
  Thread: vi.fn(),
};

// Mock the ESM loader to return our mock SDK
vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
    resolvePackageEntryPoint: vi.fn(() => '@openai/codex-sdk'),
  };
});

// Mock the SDK package (for type safety)
vi.mock('@openai/codex-sdk', () => mockCodexSDK);

// Helper to create mock response matching real SDK format
const createMockResponse = (
  finalResponse: string,
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number },
) => ({
  finalResponse,
  usage: usage
    ? {
        input_tokens: usage.input_tokens ?? 0,
        cached_input_tokens: usage.cached_input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
      }
    : undefined,
  items: [],
});

describe('OpenAICodexSDKProvider', () => {
  let statSyncSpy: MockInstance;
  let existsSyncSpy: MockInstance;
  const mockImportModule = vi.mocked(importModule);

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockStartThread.mockReturnValue(mockThread);
    mockResumeThread.mockReturnValue(mockThread);

    // Mock importModule to return our mock SDK
    mockImportModule.mockResolvedValue(mockCodexSDK);

    // Default mocks
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearCache();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const provider = new OpenAICodexSDKProvider();

      expect(provider.config).toEqual({});
      expect(provider.id()).toBe('openai:codex-sdk');
    });

    it('should initialize with custom config', () => {
      const config = {
        apiKey: 'test-key',
        model: 'gpt-5.2',
        working_dir: '/test/dir',
      };

      const provider = new OpenAICodexSDKProvider({ config });

      expect(provider.config).toEqual(config);
      expect(provider.apiKey).toBe('test-key');
    });

    it('should use custom id when provided', () => {
      const provider = new OpenAICodexSDKProvider({ id: 'custom-provider-id' });

      expect(provider.id()).toBe('custom-provider-id');
    });

    it('should warn about unknown model', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      new OpenAICodexSDKProvider({ config: { model: 'unknown-model' } });

      expect(warnSpy).toHaveBeenCalledWith(
        'Using unknown model for OpenAI Codex SDK: unknown-model',
      );

      warnSpy.mockRestore();
    });

    it('should not warn about known OpenAI models', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.2' } });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should not warn about gpt-5.1-codex models', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.1-codex' } });
      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.1-codex-max' } });
      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.1-codex-mini' } });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('callApi', () => {
    describe('basic functionality', () => {
      it('should successfully call API with simple prompt', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Test response', {
            input_tokens: 10,
            cached_input_tokens: 5,
            output_tokens: 20,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          output: 'Test response',
          tokenUsage: {
            prompt: 15, // input_tokens + cached_input_tokens (10 + 5)
            completion: 20,
            total: 35, // 10 + 5 + 20
          },
          cost: 0,
          raw: expect.any(String),
          sessionId: 'test-thread-123',
        });

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: undefined,
          skipGitRepoCheck: false,
        });

        expect(mockRun).toHaveBeenCalledWith('Test prompt', {});
      });

      it('should handle SDK exceptions', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockRun.mockRejectedValue(new Error('Network error'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Error calling OpenAI Codex SDK: Network error');
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });

      it('should return error when API key is missing', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.CODEX_API_KEY;

        const provider = new OpenAICodexSDKProvider();
        await expect(provider.callApi('Test prompt')).rejects.toThrow(/OpenAI API key is not set/);
      });
    });

    describe('working directory management', () => {
      it('should use custom working_dir when provided', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(statSyncSpy).toHaveBeenCalledWith('/custom/dir');
        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/custom/dir',
          skipGitRepoCheck: false,
        });
      });

      it('should error when working_dir does not exist', async () => {
        statSyncSpy.mockImplementation(function () {
          throw new Error('ENOENT: no such file or directory');
        });

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/nonexistent/dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /Working directory \/nonexistent\/dir does not exist/,
        );
      });

      it('should error when working_dir is not a directory', async () => {
        statSyncSpy.mockReturnValue({
          isDirectory: () => false,
        } as fs.Stats);

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/path/to/file.txt' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'Working directory /path/to/file.txt is not a directory',
        );
      });

      it('should error when working_dir is not a Git repo', async () => {
        existsSyncSpy.mockReturnValue(false);

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/path/to/non-git-dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(/is not a Git repository/);
      });

      it('should bypass Git check when skip_git_repo_check is true', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: '/path/to/non-git-dir',
            skip_git_repo_check: true,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Response');
        expect(result.error).toBeUndefined();
        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/path/to/non-git-dir',
          skipGitRepoCheck: true,
        });
      });

      it('should pass additional_directories to startThread', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: '/main/dir',
            additional_directories: ['/extra/dir1', '/extra/dir2'],
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/main/dir',
          skipGitRepoCheck: false,
          additionalDirectories: ['/extra/dir1', '/extra/dir2'],
        });
      });

      it('should not include additionalDirectories when empty', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: '/main/dir',
            additional_directories: [],
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/main/dir',
          skipGitRepoCheck: false,
        });
      });
    });

    describe('thread management', () => {
      it('should create ephemeral threads by default', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');
        expect(mockStartThread).toHaveBeenCalledTimes(1);

        // Second call should create new thread
        await provider.callApi('Test prompt');
        expect(mockStartThread).toHaveBeenCalledTimes(2);
      });

      it('should reuse threads when persist_threads is true', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { persist_threads: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('First prompt');
        expect(mockStartThread).toHaveBeenCalledTimes(1);

        await provider.callApi('First prompt'); // Same prompt = same cache key
        expect(mockStartThread).toHaveBeenCalledTimes(1); // No new thread
        expect(mockRun).toHaveBeenCalledTimes(2);
      });

      it('should resume thread when thread_id is provided', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { thread_id: 'existing-thread-123' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockResumeThread).toHaveBeenCalledWith('existing-thread-123', {
          skipGitRepoCheck: false,
          workingDirectory: undefined,
        });
        expect(mockStartThread).not.toHaveBeenCalled();
      });

      it('should reuse cached thread when resuming same thread_id', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            thread_id: 'existing-thread-123',
            persist_threads: true,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        // First call should resume thread
        await provider.callApi('Test prompt 1');
        expect(mockResumeThread).toHaveBeenCalledTimes(1);

        // Second call should use cached thread (not resume again)
        await provider.callApi('Test prompt 2');
        expect(mockResumeThread).toHaveBeenCalledTimes(1); // Still 1
        expect(mockRun).toHaveBeenCalledTimes(2); // But ran twice
      });

      it('should enforce thread pool size limits', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            persist_threads: true,
            thread_pool_size: 2,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        // Create 3 different prompts (different cache keys)
        await provider.callApi('Prompt 1');
        await provider.callApi('Prompt 2');
        await provider.callApi('Prompt 3'); // Should evict oldest

        expect(mockStartThread).toHaveBeenCalledTimes(3);
      });
    });

    describe('structured output', () => {
      it('should handle JSON schema output', async () => {
        const schema = {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            status: { type: 'string', enum: ['ok', 'error'] },
          },
          required: ['summary', 'status'],
        };

        mockRun.mockResolvedValue(createMockResponse('{"summary":"All good","status":"ok"}'));

        const provider = new OpenAICodexSDKProvider({
          config: { output_schema: schema },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Summarize status');

        expect(mockRun).toHaveBeenCalledWith('Summarize status', {
          outputSchema: schema,
        });

        expect(result.output).toBe('{"summary":"All good","status":"ok"}');
      });
    });

    describe('sandbox and network options', () => {
      it('should pass sandbox_mode to thread options', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            sandbox_mode: 'read-only',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            sandboxMode: 'read-only',
          }),
        );
      });

      it('should pass network and web search options to thread', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            network_access_enabled: true,
            web_search_enabled: true,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            networkAccessEnabled: true,
            webSearchEnabled: true,
          }),
        );
      });

      it('should pass model_reasoning_effort to thread options', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            model_reasoning_effort: 'high',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            modelReasoningEffort: 'high',
          }),
        );
      });

      it('should pass approval_policy to thread options', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            approval_policy: 'never',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            approvalPolicy: 'never',
          }),
        );
      });
    });

    describe('cost calculation', () => {
      it('should calculate cost for gpt-5.1-codex model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.1-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.1-codex: $2/1M input, $8/1M output
        // Cost = (1000 * 2/1000000) + (500 * 8/1000000) = 0.002 + 0.004 = 0.006
        expect(result.cost).toBeCloseTo(0.006, 6);
      });

      it('should calculate cost for gpt-5.1-codex-mini model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 2000,
            cached_input_tokens: 500,
            output_tokens: 1000,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.1-codex-mini' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.1-codex-mini: $0.5/1M input, $2/1M output
        // prompt tokens = 2000 + 500 = 2500
        // Cost = (2500 * 0.5/1000000) + (1000 * 2/1000000) = 0.00125 + 0.002 = 0.00325
        expect(result.cost).toBeCloseTo(0.00325, 6);
      });

      it('should return 0 cost when model pricing not found', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 100,
            output_tokens: 50,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'unknown-model' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBe(0);
      });

      it('should return 0 cost when no model specified', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 100,
            output_tokens: 50,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBe(0);
      });

      it('should return 0 cost when no usage data', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.1-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBe(0);
      });
    });

    describe('streaming', () => {
      it('should handle streaming events', async () => {
        const mockEvents = async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'item-1', type: 'agent_message', text: 'Part 1' },
          };
          yield {
            type: 'item.completed',
            item: { id: 'item-2', type: 'agent_message', text: 'Part 2' },
          };
          yield {
            type: 'turn.completed',
            usage: { input_tokens: 10, cached_input_tokens: 5, output_tokens: 20 },
          };
        };

        mockRunStreamed.mockResolvedValue({ events: mockEvents() });

        const provider = new OpenAICodexSDKProvider({
          config: { enable_streaming: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Part 1\nPart 2');
        expect(result.tokenUsage).toEqual({
          prompt: 15, // input_tokens + cached_input_tokens (10 + 5)
          completion: 20,
          total: 35, // 10 + 5 + 20
        });
      });

      it('should abort streaming on signal', async () => {
        const mockEvents = async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'item-1', type: 'agent_message', text: 'Part 1' },
          };
          // Abort will happen here
        };

        mockRunStreamed.mockResolvedValue({ events: mockEvents() });

        const provider = new OpenAICodexSDKProvider({
          config: { enable_streaming: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const abortController = new AbortController();
        abortController.abort();

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: abortController.signal,
        });

        expect(result.error).toBe('OpenAI Codex SDK call aborted before it started');
      });
    });

    describe('config merging', () => {
      it('should merge provider and prompt configs', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            model: 'gpt-5.2',
            working_dir: '/test/dir',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: {
              output_schema: { type: 'object' },
            },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockRun).toHaveBeenCalledWith('Test prompt', {
          outputSchema: { type: 'object' },
        });
      });

      it('should prioritize prompt config over provider config', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/provider/dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: { working_dir: '/prompt/dir' },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/prompt/dir',
          skipGitRepoCheck: false,
        });
      });
    });

    describe('abort signal', () => {
      it('should handle pre-aborted signal', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const abortController = new AbortController();
        abortController.abort();

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: abortController.signal,
        });

        expect(result.error).toBe('OpenAI Codex SDK call aborted before it started');
        expect(mockRun).not.toHaveBeenCalled();
      });

      it('should handle abort during execution', async () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const abortError = new Error('AbortError');
        abortError.name = 'AbortError';
        mockRun.mockRejectedValue(abortError);

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: new AbortController().signal,
        });

        expect(result.error).toBe('OpenAI Codex SDK call aborted');
        expect(warnSpy).toHaveBeenCalledWith('OpenAI Codex SDK call aborted');

        warnSpy.mockRestore();
      });
    });

    describe('environment variables', () => {
      it('should use default env inheritance', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith({
          env: expect.objectContaining({
            OPENAI_API_KEY: 'test-api-key',
            CODEX_API_KEY: 'test-api-key',
          }),
        });
      });

      it('should use custom cli_env', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            cli_env: {
              CUSTOM_VAR: 'custom-value',
            },
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith({
          env: expect.objectContaining({
            CUSTOM_VAR: 'custom-value',
            OPENAI_API_KEY: 'test-api-key',
          }),
        });
      });

      it('should handle codex_path_override', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            codex_path_override: '/custom/path/to/codex',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith({
          env: expect.any(Object),
          codexPathOverride: '/custom/path/to/codex',
        });
      });
    });

    describe('model configuration', () => {
      it('should pass model to startThread', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            model: 'gpt-5.2',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: undefined,
          skipGitRepoCheck: false,
          model: 'gpt-5.2',
        });
      });

      it('should not include model in startThread if not specified', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: undefined,
          skipGitRepoCheck: false,
        });
      });
    });

    describe('API key priority', () => {
      beforeEach(() => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.CODEX_API_KEY;
      });

      it('should prioritize config apiKey over env vars', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        process.env.OPENAI_API_KEY = 'env-key';
        const provider = new OpenAICodexSDKProvider({
          config: { apiKey: 'config-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith({
          env: expect.objectContaining({
            OPENAI_API_KEY: 'config-key',
            CODEX_API_KEY: 'config-key',
          }),
        });
      });

      it('should use CODEX_API_KEY from env if available', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { CODEX_API_KEY: 'codex-env-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith({
          env: expect.objectContaining({
            OPENAI_API_KEY: 'codex-env-key',
            CODEX_API_KEY: 'codex-env-key',
          }),
        });
      });
    });
  });

  describe('toString', () => {
    it('should return provider string representation', () => {
      const provider = new OpenAICodexSDKProvider();
      expect(provider.toString()).toBe('[OpenAI Codex SDK Provider]');
    });
  });

  describe('cleanup', () => {
    it('should clear threads map', async () => {
      mockRun.mockResolvedValue(createMockResponse('Response'));

      const provider = new OpenAICodexSDKProvider({
        config: { persist_threads: true },
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

      // Create a persisted thread
      await provider.callApi('Test prompt');

      // Verify thread was persisted
      expect((provider as any).threads.size).toBe(1);

      // Cleanup
      await provider.cleanup();

      // Verify threads cleared
      expect((provider as any).threads.size).toBe(0);
    });
  });
});
