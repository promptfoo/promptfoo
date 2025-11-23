import fs from 'fs';

import { clearCache, disableCache, enableCache } from '../../src/cache';
import logger from '../../src/logger';
import { OpenAICodexSDKProvider } from '../../src/providers/openai-codex-sdk';

import type { CallApiContextParams } from '../../src/types/index';

jest.mock('../../src/cliState', () => ({ basePath: '/test/basePath' }));
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));
jest.mock('node:module', () => ({
  createRequire: jest.fn(() => ({
    resolve: jest.fn(() => '@openai/codex-sdk'),
  })),
}));

const mockRun = jest.fn();
const mockRunStreamed = jest.fn();
const mockStartThread = jest.fn();
const mockResumeThread = jest.fn();

// Mock thread instance
const mockThread = {
  id: 'test-thread-123',
  run: mockRun,
  runStreamed: mockRunStreamed,
};

// Mock Codex class
const MockCodex = jest.fn().mockImplementation(() => ({
  startThread: mockStartThread.mockReturnValue(mockThread),
  resumeThread: mockResumeThread.mockReturnValue(mockThread),
}));

// Helper to create mock response
const createMockResponse = (
  finalResponse: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
) => ({
  finalResponse,
  usage: usage
    ? {
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
      }
    : undefined,
  items: [],
});

describe('OpenAICodexSDKProvider', () => {
  let statSyncSpy: jest.SpyInstance;
  let existsSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    const { importModule } = require('../../src/esm');
    importModule.mockResolvedValue({
      Codex: MockCodex,
    });

    // Default mocks
    statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
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
        model: 'gpt-4o',
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
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

      new OpenAICodexSDKProvider({ config: { model: 'unknown-model' } });

      expect(warnSpy).toHaveBeenCalledWith('Using unknown model for OpenAI Codex SDK: unknown-model');

      warnSpy.mockRestore();
    });

    it('should warn about unknown fallback model', () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

      new OpenAICodexSDKProvider({ config: { fallback_model: 'unknown-fallback' } });

      expect(warnSpy).toHaveBeenCalledWith(
        'Using unknown model for OpenAI Codex SDK fallback: unknown-fallback',
      );

      warnSpy.mockRestore();
    });

    it('should not warn about known OpenAI models', () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

      new OpenAICodexSDKProvider({ config: { model: 'gpt-4o' } });
      new OpenAICodexSDKProvider({ config: { fallback_model: 'o3-mini' } });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('callApi', () => {
    describe('basic functionality', () => {
      it('should successfully call API with simple prompt', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Test response', {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          output: 'Test response',
          tokenUsage: {
            prompt: 10,
            completion: 20,
            total: 30,
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
        const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
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
        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /OpenAI API key is not set/,
        );
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
        statSyncSpy.mockImplementation(() => {
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

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /is not a Git repository/,
        );
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

        expect(mockResumeThread).toHaveBeenCalledWith('existing-thread-123');
        expect(mockStartThread).not.toHaveBeenCalled();
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

    describe('streaming', () => {
      it('should handle streaming events', async () => {
        const mockEvents = async function* () {
          yield { type: 'item.completed', item: { content: 'Part 1' } };
          yield { type: 'item.completed', item: { content: 'Part 2' } };
          yield {
            type: 'turn.completed',
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
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
          prompt: 10,
          completion: 20,
          total: 30,
        });
      });

      it('should abort streaming on signal', async () => {
        const mockEvents = async function* () {
          yield { type: 'item.completed', item: { content: 'Part 1' } };
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
            model: 'gpt-4o',
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
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
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
  });
});
